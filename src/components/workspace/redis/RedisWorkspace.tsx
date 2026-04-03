import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable.tsx";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { RedisAddKeyDialog } from "@/components/workspace/redis/RedisAddKeyDialog.tsx";
import { RedisKeyBrowserPanel } from "@/components/workspace/redis/RedisKeyBrowserPanel.tsx";
import { RedisValuePanel } from "@/components/workspace/redis/RedisValuePanel.tsx";
import { useAppStore } from "@/store/useAppStore.ts";
import { toast } from "@/hooks/useToast.ts";
import { useSettingsStore } from "@/store/useSettingsStore.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  invokeRedisCommand,
  invokeGetKeysDetails,
  invokeGetRedisKeys,
  invokeScanHashValues,
  invokeScanSetMembers,
  invokeScanZsetMembers,
  invokeScanListValues
} from "@/lib/api.ts";
import {
  getSearchPattern,
  type RedisResult,
  type KeyDetail,
  type ValueScanResult,
  type ScanResult,
} from "@/components/workspace/redis/redisWorkspace.shared.ts";

export function RedisWorkspace({ tabId, name, connectionId, db = 0, savedResult }: { tabId: string; name: string; connectionId: number; db?: number; savedResult?: any }) {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<KeyDetail[]>(savedResult?.keys || []);
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState<string>(savedResult?.cursor || "0");
  const [hasMore, setHasMore] = useState(savedResult?.hasMore ?? true);
  const [selectedKey, setSelectedKey] = useState<string | null>(savedResult?.selectedKey || null);
  const [loading, setLoading] = useState(false);
  const [isAddKeyDialogOpen, setIsAddKeyDialogOpen] = useState(false);

  // TTL Edit logic
  const [isEditTTLDialogOpen, setIsEditTTLDialogOpen] = useState(false);
  const [editTTLValue, setEditTTLValue] = useState("");

  // Details for the selected key (value content)
  const [selectedValue, setSelectedValue] = useState<any>(savedResult?.selectedValue || null);
  const [valueLoading, setValueLoading] = useState(false);

  // Scan state for complex data types
  const [valueCursor, setValueCursor] = useState<string>(savedResult?.valueCursor || "0");
  const [valueHasMore, setValueHasMore] = useState(true);
  const [valueFilter, setValueFilter] = useState<string>("");
  const [allValues, setAllValues] = useState<any[]>(savedResult?.allValues || []);
  const [totalItemCount, setTotalItemCount] = useState<number | null>(null);
  const [zsetOrder, setZsetOrder] = useState<'asc' | 'desc'>(savedResult?.zsetOrder || 'desc');
  const [valueExactSearch, setValueExactSearch] = useState(savedResult?.valueExactSearch ?? false);

  const [lastScannedFilter, setLastScannedFilter] = useState<string>(savedResult?.lastScannedFilter || "");
  const [hasValueSearched, setHasValueSearched] = useState(savedResult?.hasValueSearched ?? false);
  const [lastScannedValueFilter, setLastScannedValueFilter] = useState<string>(savedResult?.lastScannedValueFilter || "");

  const updateTab = useAppStore(state => state.updateTab);
  const redisScanCount = useSettingsStore(state => state.redisScanCount);
  const redisViewPreferences = useSettingsStore(state => state.redisViewPreferences);
  const redisSearchHistory = useSettingsStore(state => state.redisSearchHistory);
  const setRedisViewMode = useSettingsStore(state => state.setRedisViewMode);
  const setRedisDelimiter = useSettingsStore(state => state.setRedisDelimiter);
  const addRedisSearchHistory = useSettingsStore(state => state.addRedisSearchHistory);
  const clearRedisSearchHistory = useSettingsStore(state => state.clearRedisSearchHistory);

  // 计算当前连接和DB的视图偏好和搜索历史
  const viewPreference = useMemo(() => {
    const key = `${connectionId}:${db}`;
    return redisViewPreferences[key] ?? { viewMode: 'list' as const, delimiter: ':' };
  }, [redisViewPreferences, connectionId, db]);

  const searchHistory = useMemo(() => {
    const key = `${connectionId}:${db}`;
    return redisSearchHistory[key] ?? [];
  }, [redisSearchHistory, connectionId, db]);

  // 新增状态：精确搜索和是否已搜索
  const [exactSearch, setExactSearch] = useState(false);
  const [hasSearched, setHasSearched] = useState(savedResult?.hasSearched ?? false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  // 计算搜索建议：前缀匹配
  const suggestedHistory = useMemo(() => {
    if (!filter.trim()) return [];
    return searchHistory.filter(h =>
      h.toLowerCase().startsWith(filter.toLowerCase())
    );
  }, [searchHistory, filter]);

  // 当列表改变时重置选择索引
  useEffect(() => {
    setSelectedIndex(-1);
  }, [suggestedHistory, showHistoryDropdown]);

  // 显示 Scan More 按钮的条件：非精确搜索 + 搜索框非空 + 已搜索
  // hasMore 只决定按钮是否可点击，不决定是否显示
  const showScanMore = !exactSearch && filter.trim() !== '' && hasSearched && hasMore;

  // Sync keys state to global store
  useEffect(() => {
    const timer = setTimeout(() => {
      updateTab(tabId, {
        savedResult: {
          keys,
          cursor,
          hasMore,
          lastScannedFilter,
          hasSearched
        }
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [keys, cursor, hasMore, lastScannedFilter, hasSearched, tabId, updateTab]);

  // Sync value state to global store (separate effect to reduce updates)
  useEffect(() => {
    const timer = setTimeout(() => {
      updateTab(tabId, {
        savedResult: {
          selectedKey,
          selectedValue,
          allValues,
          valueCursor,
          zsetOrder,
          valueExactSearch,
          hasValueSearched,
          lastScannedValueFilter
        }
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedKey, selectedValue, allValues, valueCursor, zsetOrder, valueExactSearch, hasValueSearched, lastScannedValueFilter, tabId, updateTab]);

  // Refs for stable access in callbacks
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const exactSearchRef = useRef(exactSearch);
  exactSearchRef.current = exactSearch;

  // Refs for value-related state
  const valueLoadingRef = useRef(valueLoading);
  valueLoadingRef.current = valueLoading;
  const valueHasMoreRef = useRef(valueHasMore);
  valueHasMoreRef.current = valueHasMore;
  const valueCursorRef = useRef(valueCursor);
  valueCursorRef.current = valueCursor;
  const valueFilterRef = useRef(valueFilter);
  valueFilterRef.current = valueFilter;
  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const zsetOrderRef = useRef(zsetOrder);
  zsetOrderRef.current = zsetOrder;
  const valueExactSearchRef = useRef(valueExactSearch);
  valueExactSearchRef.current = valueExactSearch;

  const fetchKeys = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    if (!reset && !hasMoreRef.current) return;

    setLoading(true);

    const currentFilter = filterRef.current;
    const useExactSearch = exactSearchRef.current && currentFilter.trim() !== "";
    try {
      if (useExactSearch) {
        // Exact search: use EXISTS command
        const searchTerm = currentFilter.trim();

        const result = await invokeRedisCommand<RedisResult>({
          connectionId,
          command: "EXISTS",
          args: [searchTerm],
          db,
        });

        // If key exists, get its details
        if (result.output === 1) {
          const keyDetails = await invokeGetKeysDetails<KeyDetail[]>({
            connectionId,
            keys: [searchTerm],
            db,
          });
          setKeys(keyDetails);
        } else {
          setKeys([]);
        }

        setHasMore(false);
        setCursor("0");

        // Log command to console
      } else {
        // Full scan or pattern search: use SCAN
        const currentCursor = reset ? "0" : cursorRef.current;
        const searchPattern = getSearchPattern(currentFilter);
        const scanCount = searchPattern === '*' ? 1000 : redisScanCount;

        const result = await invokeGetRedisKeys<ScanResult>({
          connectionId,
          cursor: currentCursor,
          count: scanCount,
          pattern: searchPattern,
          db,
        });

        if (reset) {
          setKeys(result.keys);
        } else {
          setKeys((prev) => [...prev, ...result.keys]);
        }

        setCursor(result.cursor);
        setHasMore(result.cursor !== "0");

        // Update the last scanned filter only on successful scan
        setLastScannedFilter(currentFilter);

        // Log command to console
      }
    } catch (e) {
      console.error("Failed to fetch keys", e);

      // Log error command
    } finally {
      setLoading(false);
    }
  }, [connectionId, db, redisScanCount]);

  const handleDeleteKey = useCallback(async (keyToDelete?: string | any) => {
    let targetKeyStr = selectedKey;
    if (typeof keyToDelete === 'string') {
      targetKeyStr = keyToDelete;
    }
    if (!targetKeyStr) return;

    try {
      await invokeRedisCommand({
        connectionId,
        command: "DEL",
        args: [targetKeyStr],
        db,
      });
      if (selectedKey === targetKeyStr) setSelectedKey(null);
      setKeys((prev) => prev.filter((k) => k.key !== targetKeyStr));
      toast({ title: t('redis.deletedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to delete key", error);
      toast({ title: t('redis.deleteFailed'), description: String(error), variant: 'destructive' });
    }
  }, [connectionId, db, selectedKey, t]);

  const handleUpdateTTL = useCallback(async () => {
    if (!selectedKey) return;

    const parsedTTL = parseInt(editTTLValue);
    if (isNaN(parsedTTL)) return;

    setIsEditTTLDialogOpen(false);
    let command;
    let args;

    if (parsedTTL === -1) {
      command = "PERSIST";
      args = [selectedKey];
    } else if (parsedTTL > 0) {
      command = "EXPIRE";
      args = [selectedKey, parsedTTL.toString()];
    } else {
      return;
    }

    try {
      await invokeRedisCommand({
        connectionId,
        command,
        args,
        db,
      });
      // Update local state to reflect new TTL
      setKeys((prev) => prev.map((k) => k.key === selectedKey ? { ...k, ttl: parsedTTL } : k));
      toast({ title: t('redis.ttlUpdatedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error(`Failed to update TTL`, error);
      toast({ title: t('redis.ttlUpdateFailed'), description: String(error), variant: 'destructive' });
    }
  }, [connectionId, db, selectedKey, editTTLValue]);

  // 搜索处理函数
  const handleSearch = useCallback((searchTerm?: string) => {
    const term = searchTerm ?? filter;

    // 添加到搜索历史（非空时）
    if (term.trim()) {
      addRedisSearchHistory(connectionId, db, term.trim());
    }

    setHasSearched(true);
    fetchKeys(true);
  }, [filter, connectionId, db, addRedisSearchHistory, fetchKeys]);

  const fetchComplexValues = useCallback(async (reset = false, forcedType?: string) => {
    const currentSelectedKey = selectedKeyRef.current;
    const currentKeys = keysRef.current;
    const currentKeyItem = currentKeys.find((k) => k.key === currentSelectedKey);
    if (!currentSelectedKey || !currentKeyItem) return;
    if (valueLoadingRef.current) return;
    if (!reset && !valueHasMoreRef.current) return;

    setValueLoading(true);
    const currentCursor = reset ? "0" : valueCursorRef.current;

    // Determine search strategy for complex values
    const currentValueFilter = valueFilterRef.current;
    const isExact = valueExactSearchRef.current;

    let searchPattern = "*";
    if (currentValueFilter.trim() !== "") {
      if (isExact) {
        searchPattern = currentValueFilter.trim();
      } else {
        searchPattern = currentValueFilter.includes('*') ? currentValueFilter : `*${currentValueFilter}*`;
      }
    }

    const type = forcedType || currentKeyItem.type;



    try {
      let result: ValueScanResult = { cursor: "0", values: [] };

      if (isExact && type !== "list") {
        const searchTerm = currentValueFilter.trim();
        if (searchTerm) {
          if (type === "hash") {
            const val = await invokeRedisCommand<RedisResult>({
              connectionId,
              command: "HGET",
              args: [currentSelectedKey, searchTerm],
              db,
            });
            if (val.output !== null) {
              result.values = [searchTerm, val.output];
            }
          } else if (type === "set") {
            const exists = await invokeRedisCommand<RedisResult>({
              connectionId,
              command: "SISMEMBER",
              args: [currentSelectedKey, searchTerm],
              db,
            });
            if (exists.output === 1) {
              result.values = [searchTerm];
            }
          } else if (type === "zset") {
            const score = await invokeRedisCommand<RedisResult>({
              connectionId,
              command: "ZSCORE",
              args: [currentSelectedKey, searchTerm],
              db,
            });
            if (score.output !== null) {
              result.values = [searchTerm, score.output];
            }
          }
        } else {
          // If search term is empty but exact match is on, just do a normal scan
          const res = await (type === "hash" ? invokeScanHashValues : type === "set" ? invokeScanSetMembers : invokeScanZsetMembers)<ValueScanResult>({
            connectionId,
            key: currentSelectedKey,
            cursor: currentCursor,
            count: 100,
            pattern: "*",
            db,
          });
          result = res;
        }
      } else {
        // Original logic
        if (type === "hash") {
          result = await invokeScanHashValues<ValueScanResult>({
            connectionId,
            key: currentSelectedKey,
            cursor: currentCursor,
            count: 100,
            pattern: searchPattern,
            db,
          });
        } else if (type === "set") {
          result = await invokeScanSetMembers<ValueScanResult>({
            connectionId,
            key: currentSelectedKey,
            cursor: currentCursor,
            count: 100,
            pattern: searchPattern,
            db,
          });
        } else if (type === "zset") {
          const currentZsetOrder = zsetOrderRef.current;
          if (searchPattern === "*") {
            // If no pattern, use ZRANGE/ZREVRANGE for score sorting
            const start = reset ? 0 : allValues.length / 2;
            const end = start + 99;
            const command = currentZsetOrder === 'desc' ? "ZREVRANGE" : "ZRANGE";

            const res = await invokeRedisCommand<RedisResult>({
              connectionId,
              command,
              args: [currentSelectedKey, start.toString(), end.toString(), "WITHSCORES"],
              db,
            });

            result = {
              cursor: res.output.length >= 200 ? String(start + 100) : "0", // Cursor used as offset here
              values: res.output
            };
          } else {
            // Use ZSCAN when there's a pattern
            result = await invokeScanZsetMembers<ValueScanResult>({
              connectionId,
              key: currentSelectedKey,
              cursor: currentCursor,
              count: 100,
              pattern: searchPattern,
              db,
            });
          }
        }
      }

      let filteredValues = result.values;

      if (reset) {
        setAllValues(filteredValues);
      } else {
        setAllValues((prev) => [...prev, ...filteredValues]);
      }

      setLastScannedValueFilter(currentValueFilter);
      // setHasValueSearched is now only triggered explicitly by user search action

      setValueCursor(result.cursor);
      const hasMoreData = result.cursor !== "0";
      setValueHasMore(hasMoreData);

      if (reset) {
        if (hasMoreData && searchPattern === "*") {
          // If there are more items, use execute_redis_command to get exact length
          let lenCmd = "";
          if (type === "hash") lenCmd = "HLEN";
          else if (type === "set") lenCmd = "SCARD";
          else if (type === "zset") lenCmd = "ZCARD";

          if (lenCmd) {

            try {
              const res = await invokeRedisCommand<RedisResult>({
                connectionId,
                command: lenCmd,
                args: [currentSelectedKey],
                db,
              });
              setTotalItemCount(Number(res.output));
            } catch (e) {
              console.error(e);
              setTotalItemCount(null);
            }
          } else {
            setTotalItemCount(null);
          }
        } else if (!hasMoreData && searchPattern === "*") {
          // We have all items
          setTotalItemCount(type === "hash" || type === "zset" ? filteredValues.length / 2 : filteredValues.length);
        } else {
          // Filtered, exact count is unknown without scanning all
          setTotalItemCount(null);
        }
      }

      // Log command to console
    } catch (e) {
      console.error("Failed to fetch complex values", e);

      // Log error command
    } finally {
      setValueLoading(false);
    }
  }, [connectionId, db, allValues.length]);

  const fetchListValues = useCallback(async (start = 0, end = 99, forcedType?: string) => {
    const currentSelectedKey = selectedKeyRef.current;
    const currentKeys = keysRef.current;
    const currentKeyItem = currentKeys.find((k) => k.key === currentSelectedKey);
    if (!currentSelectedKey || !currentKeyItem) return;
    const type = forcedType || currentKeyItem.type;
    if (type !== "list") return;
    if (valueLoadingRef.current) return;

    setValueLoading(true);

    try {
      const result = await invokeScanListValues<RedisResult>({
        connectionId,
        key: currentSelectedKey,
        start,
        end,
        db,
      });

      setAllValues(result.output);
      const hasMoreData = result.output.length === end - start + 1;
      setValueHasMore(false);

      if (start === 0) {
        if (hasMoreData) {

          try {
            const res = await invokeRedisCommand<RedisResult>({
              connectionId,
              command: "LLEN",
              args: [currentSelectedKey],
              db,
            });
            setTotalItemCount(Number(res.output));
          } catch (e) {
            console.error(e);
          }
        } else {
          setTotalItemCount(result.output.length);
        }
      }

      // Log command to console
    } catch (e) {
      console.error("Failed to fetch list values", e);

      // Log error command
    } finally {
      setValueLoading(false);
    }
  }, [connectionId, db]);

  // Precision control for fetchKeys using refs to handle Strict Mode and dependencies
  const propsRef = useRef({ connectionId, db, initialized: false });

  useEffect(() => {
    const prev = propsRef.current;
    const curr = { connectionId, db, initialized: true };
    propsRef.current = curr;

    // Case 1: Initial mount - Immediate fetch if no saved data
    if (!prev.initialized) {
      if (!savedResult) {
        fetchKeys(true);
      }
      return;
    }

    // Case 2: Connection or DB changed - Immediate fetch and reset state
    if (prev.connectionId !== curr.connectionId || prev.db !== curr.db) {
      setHasSearched(false);
      setExactSearch(false);
      fetchKeys(true);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, db]);

  // Fetch lists and complex types on selected key change
  const prevSelectedKeyRef = useRef<string | null>(null);
  const prevZsetOrderRef = useRef<'asc' | 'desc'>(zsetOrder);

  useEffect(() => {
    // Determine if selectedKey or zsetOrder actually changed
    const isKeyChanged = prevSelectedKeyRef.current !== selectedKey;
    const isOrderChanged = prevZsetOrderRef.current !== zsetOrder;
    prevSelectedKeyRef.current = selectedKey;
    prevZsetOrderRef.current = zsetOrder;

    if (!selectedKey) return;

    const currentKeyItem = keys.find((k) => k.key === selectedKey);
    if (!currentKeyItem) return;

    // If nothing relevant changed, return
    if (!isKeyChanged && !isOrderChanged) return;
    // If only order changed but it's not a zset, return
    if (!isKeyChanged && isOrderChanged && currentKeyItem.type !== "zset") return;

    if (isKeyChanged) {
      setAllValues([]);
      setValueCursor("0");
      setValueHasMore(false);
      setValueFilter("");
      setTotalItemCount(null);
      setHasValueSearched(false);
      setLastScannedValueFilter("");
    }

    if (currentKeyItem.type === "list") {
      if (isKeyChanged) fetchListValues(0, 99);
      return;
    }

    if (currentKeyItem.type === "hash" || currentKeyItem.type === "set" || currentKeyItem.type === "zset") {
      // Immediate fetch on key change
      fetchComplexValues(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, zsetOrder]);

  const observerTarget = useRef<HTMLDivElement>(null);
  const valueObserverTarget = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowHistoryDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // 检查列表是否有滚动条（内容超出容器）
        const parent = parentRef.current;
        const hasScrollbar = parent && parent.scrollHeight > parent.clientHeight;

        // 只有在列表有滚动条时才自动加载更多
        if (entries[0].isIntersecting && hasMore && !loading && hasScrollbar) {
          fetchKeys(false);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loading, fetchKeys]);

  // Value scroll observer for complex types
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const currentKeyItem = keys.find((k) => k.key === selectedKey);
        
        // 检查列表是否有滚动条（内容超出容器）
        const parent = valueObserverTarget.current?.parentElement;
        const hasScrollbar = parent && parent.scrollHeight > parent.clientHeight;

        if (entries[0].isIntersecting && valueHasMore && !valueLoading &&
          selectedKey && currentKeyItem &&
          (currentKeyItem.type === "hash" || currentKeyItem.type === "set" || currentKeyItem.type === "zset") && hasScrollbar) {
          fetchComplexValues(false);
        }
      },
      { threshold: 0.1 }
    );

    if (valueObserverTarget.current) {
      observer.observe(valueObserverTarget.current);
    }

    return () => observer.disconnect();
  }, [valueHasMore, valueLoading, fetchComplexValues, selectedKey, keys]);

  const handleKeyClick = useCallback(async (keyItem: KeyDetail) => {
    if (selectedKey === keyItem.key) return;

    setSelectedKey(keyItem.key);
    setSelectedValue(null);

    // Reset scan state
    setValueCursor("0");
    setValueHasMore(true);
    setValueFilter("");
    setAllValues([]);

    const type = keyItem.type || "string";

    if (type === "string") {
      // For string type, use original logic
      setValueLoading(true);


      try {
        const valRes = await invokeRedisCommand<RedisResult>({
          connectionId,
          command: "GET",
          args: [keyItem.key],
          db,
        });
        setSelectedValue(valRes.output);

        // Log command to console
      } catch (error) {
        console.error("Failed to fetch value", error);
        setSelectedValue(t('common.errorFetching'));

        // Log error command
      } finally {
        setValueLoading(false);
      }
    }
    // List and complex types are handled by useEffect
  }, [connectionId, db, t, selectedKey]);

  const formatTTL = useCallback((seconds?: number): string => {
    if (seconds === undefined || seconds === null) return "-";
    if (seconds === -1) return t('common.noLimit');
    if (seconds < 0) return t('common.expired');

    const d = Math.floor(seconds / (3600 * 24));
    if (d > 0) return `${d}d`;

    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    if (h > 0) return `${h}h`;

    const m = Math.floor((seconds % 3600) / 60);
    if (m > 0) return `${m}m`;

    const s = seconds % 60;
    return `${s}s`;
  }, [t]);

  const selectedKeyItem = useMemo(
    () => keys.find((k) => k.key === selectedKey),
    [keys, selectedKey]
  );

  // P1: Extract onRefresh callback to avoid recreation on each render
  const handleRefresh = useCallback((keyToRefresh?: string | any) => {
    let targetKeyStr = selectedKeyRef.current;
    if (typeof keyToRefresh === 'string') {
      targetKeyStr = keyToRefresh;
    }
    if (!targetKeyStr) return;

    const currentKeys = keysRef.current;
    const currentKeyItem = currentKeys.find((k) => k.key === targetKeyStr);
    if (!currentKeyItem) return;

    // Refresh key details (TTL, length, etc)
    invokeGetKeysDetails<KeyDetail[]>({
      connectionId,
      keys: [targetKeyStr],
      db,
    }).then(details => {
      let updatedType = currentKeyItem.type;
      if (details && details.length > 0) {
        const isAutoDeleted = details[0].type === "none" && currentKeyItem.type !== "none";
        updatedType = isAutoDeleted ? currentKeyItem.type : details[0].type;
        
        setKeys(prev => prev.map(k => {
          if (k.key === targetKeyStr) {
            return {
              ...details[0],
              type: updatedType,
              ttl: isAutoDeleted ? -2 : details[0].ttl,
              length: isAutoDeleted ? 0 : details[0].length,
            };
          }
          return k;
        }));
      }

      if (targetKeyStr === selectedKeyRef.current) {
        if (updatedType === "string") {
          setValueLoading(true);
          invokeRedisCommand<RedisResult>({
            connectionId,
            command: "GET",
            args: [targetKeyStr],
            db,
          }).then(valRes => {
            setSelectedValue(valRes.output);
          }).catch(error => {
            console.error("Failed to refresh string value", error);
          }).finally(() => {
            setValueLoading(false);
          });
        } else if (updatedType === "list") {
          fetchListValues(0, 99, updatedType);
        } else {
          fetchComplexValues(true, updatedType);
        }
      }
    }).catch(error => {
      console.error("Failed to refresh key details", error);
    });
  }, [connectionId, db, fetchListValues, fetchComplexValues]);

  const parentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-2 flex justify-between items-center bg-muted/30 shrink-0 h-12">
        <div className="flex items-center gap-4 px-2">
          <h2 className="font-semibold text-sm">{name}</h2>
          <Badge
            variant="outline"
            className="text-xs font-normal bg-green-50 text-green-700 border-green-200"
          >
            {t('redis.connected', 'Connected')}
          </Badge>
          <span className="text-xs text-muted-foreground">DB {db}</span>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            className="h-8 gap-1 ml-2 bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
            onClick={() => setIsAddKeyDialogOpen(true)}
          >
            <Plus className="w-4 h-4" /> {t('redis.addKey', 'Key')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Sidebar */}
          <ResizablePanel defaultSize={35} minSize={20} maxSize={50} className="flex flex-col">
            <RedisKeyBrowserPanel
              keys={keys}
              selectedKey={selectedKey}
              loading={loading}
              filter={filter}
              setFilter={setFilter}
              searchHistory={searchHistory}
              suggestedHistory={suggestedHistory}
              isInputFocused={isInputFocused}
              setIsInputFocused={setIsInputFocused}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
              showHistoryDropdown={showHistoryDropdown}
              setShowHistoryDropdown={setShowHistoryDropdown}
              exactSearch={exactSearch}
              setExactSearch={setExactSearch}
              hasMore={hasMore}
              hasSearched={hasSearched}
              lastScannedFilter={lastScannedFilter}
              cursor={cursor}
              showScanMore={showScanMore}
              viewPreference={viewPreference}
              connectionId={connectionId}
              db={db}
              setRedisViewMode={setRedisViewMode}
              setRedisDelimiter={setRedisDelimiter}
              clearRedisSearchHistory={clearRedisSearchHistory}
              onSearch={handleSearch}
              onFetchKeys={fetchKeys}
              onKeyClick={handleKeyClick}
              onRefreshKey={handleRefresh}
              onDeleteKey={handleDeleteKey}
              formatTTL={formatTTL}
              searchContainerRef={searchContainerRef}
              observerTarget={observerTarget}
              parentRef={parentRef}
            />
          </ResizablePanel>

          <ResizableHandle />

          {/* Right Content */}
          <ResizablePanel defaultSize={40}>
            <RedisValuePanel
              connectionId={connectionId}
              db={db}
              selectedKey={selectedKey}
              selectedKeyItem={selectedKeyItem}
              selectedValue={selectedValue}
              allValues={allValues}
              valueHasMore={valueHasMore}
              valueLoading={valueLoading}
              valueFilter={valueFilter}
              setValueFilter={setValueFilter}
              hasValueSearched={hasValueSearched}
              valueObserverTarget={valueObserverTarget}
              zsetOrder={zsetOrder}
              setZsetOrder={setZsetOrder}
              valueExactSearch={valueExactSearch}
              setValueExactSearch={setValueExactSearch}
              totalItemCount={totalItemCount}
              lastScannedValueFilter={lastScannedValueFilter}
              valueCursor={valueCursor}
              onRefresh={handleRefresh}
              onDeleteKey={handleDeleteKey}
              onOpenEditTTL={() => {
                setEditTTLValue(selectedKeyItem?.ttl?.toString() || "-1");
                setIsEditTTLDialogOpen(true);
              }}
              onSearchValues={() => {
                setHasValueSearched(true);
                fetchComplexValues(true);
              }}
              onFetchComplexValues={fetchComplexValues}
              formatTTL={formatTTL}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <RedisAddKeyDialog
        open={isAddKeyDialogOpen}
        onOpenChange={setIsAddKeyDialogOpen}
        connectionId={connectionId}
        db={db}
        onSuccess={() => fetchKeys(true)}
      />

      <Dialog open={isEditTTLDialogOpen} onOpenChange={setIsEditTTLDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('redis.editTTL', 'Edit TTL')}</DialogTitle>
            <DialogDescription>
              {t('redis.editTTLDescription', 'Set expiration time for key ')}
              <span className="font-mono font-medium">{selectedKey}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-4">
              <label htmlFor="ttl-input" className="text-right text-sm">
                TTL ({t('common.seconds', 'seconds')})
              </label>
              <Input
                id="ttl-input"
                type="number"
                value={editTTLValue}
                onChange={(e) => setEditTTLValue(e.target.value)}
                className="col-span-3"
                placeholder="-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleUpdateTTL();
                  }
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t('redis.ttlHint', 'Set to -1 to remove expiration (persist).')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTTLDialogOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleUpdateTTL}>
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
