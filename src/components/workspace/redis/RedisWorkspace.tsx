import { Search, Plus, Trash2, Info, History, List, FolderTree, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable.tsx";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RedisHashViewer } from "@/components/workspace/redis/RedisHashViewer.tsx";
import { RedisSetViewer } from "@/components/workspace/redis/RedisSetViewer.tsx";
import { RedisZSetViewer } from "@/components/workspace/redis/RedisZSetViewer.tsx";
import { RedisListViewer } from "@/components/workspace/redis/RedisListViewer.tsx";
import { RedisStringViewer } from "@/components/workspace/redis/RedisStringViewer.tsx";
import { RedisAddKeyDialog } from "@/components/workspace/redis/RedisAddKeyDialog.tsx";
import { RedisKeyTree } from "@/components/workspace/redis/RedisKeyTree.tsx";
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

interface RedisResult {
  output: any;
}

interface KeyDetail {
  key: string;
  type: string;
  ttl: number;
  length: number | null;
}

interface ValueScanResult {
  cursor: string;
  values: any[];
}

interface ScanResult {
  cursor: string;
  keys: KeyDetail[];
}

// Pure function - extract outside component to avoid recreation
const getSearchPattern = (searchTerm: string): string => {
  if (!searchTerm.trim()) {
    return "*"; // Full scan
  }

  // Check if it's a prefix pattern (ends with *)
  if (searchTerm.endsWith('*')) {
    const prefix = searchTerm.slice(0, -1);
    return prefix ? `${prefix}*` : "*";
  }

  // For exact search, we'll use pattern search but filter client-side
  return `${searchTerm}*`;
};

// Pure functions - extract outside component
const getTypeColor = (type?: string): string => {
  switch (type) {
    case "string":
      return "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200";
    case "hash":
      return "bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200";
    case "list":
      return "bg-green-100 text-green-700 hover:bg-green-200 border-green-200";
    case "set":
      return "bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200";
    case "zset":
      return "bg-pink-100 text-pink-700 hover:bg-pink-200 border-pink-200";
    default:
      return "bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200";
  }
};

const formatSize = (bytes?: number | null): string => {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
};

const KEY_ITEM_HEIGHT = 52; // Fixed height for each key item

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
  }, [suggestedHistory]);

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

  const handleDeleteKey = useCallback(async () => {
    if (!selectedKey) return;

    try {
      await invokeRedisCommand({
        connectionId,
        command: "DEL",
        args: [selectedKey],
        db,
      });
      setSelectedKey(null);
      setKeys((prev) => prev.filter((k) => k.key !== selectedKey));
      toast({ title: t('redis.deletedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to delete key", error);
      toast({ title: t('redis.deleteFailed'), description: String(error), variant: 'destructive' });
    }
  }, [connectionId, db, selectedKey, fetchKeys]);

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
  }, [connectionId, db, t]);

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
  const handleRefresh = useCallback(() => {
    const currentSelectedKey = selectedKeyRef.current;
    const currentKeys = keysRef.current;
    const currentKeyItem = currentKeys.find((k) => k.key === currentSelectedKey);
    if (!currentSelectedKey || !currentKeyItem) return;

    // Refresh key details (TTL, length, etc)
    invokeGetKeysDetails<KeyDetail[]>({
      connectionId,
      keys: [currentSelectedKey],
      db,
    }).then(details => {
      let updatedType = currentKeyItem.type;
      if (details && details.length > 0) {
        const isAutoDeleted = details[0].type === "none" && currentKeyItem.type !== "none";
        updatedType = isAutoDeleted ? currentKeyItem.type : details[0].type;
        
        setKeys(prev => prev.map(k => {
          if (k.key === currentSelectedKey) {
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

      if (updatedType === "string") {
        setValueLoading(true);
        invokeRedisCommand<RedisResult>({
          connectionId,
          command: "GET",
          args: [currentSelectedKey],
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
    }).catch(error => {
      console.error("Failed to refresh key details", error);
    });
  }, [connectionId, db, fetchListValues, fetchComplexValues]);

  // Virtual list parent ref
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtual list for keys
  const rowVirtualizer = useVirtualizer({
    count: keys.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => KEY_ITEM_HEIGHT,
    overscan: 5,
  });

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
            {/* Filter */}
            <div className="p-2">
              {/* 第一行: 搜索框 + 历史 + 搜索按钮 */}
              <div className="flex items-center gap-1">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"
                  />
                  <Input
                    placeholder={t('redis.filterKeysPlaceholder')}
                    className="pl-8 h-9"
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setIsInputFocused(true);
                    }}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => {
                      // 这里延迟高一点，因为键盘输入或者其他情况下的blur可能太快
                      setTimeout(() => setIsInputFocused(false), 250);
                    }}
                    onKeyDown={(e) => {
                      if (isInputFocused && suggestedHistory.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSelectedIndex(prev =>
                            prev < suggestedHistory.length - 1 ? prev + 1 : prev
                          );
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
                          return;
                        }
                        if (e.key === 'Enter' && selectedIndex >= 0) {
                          e.preventDefault();
                          const selectedItem = suggestedHistory[selectedIndex];
                          setFilter(selectedItem);
                          setIsInputFocused(false); // 关闭下拉框，不立即触发搜索
                          return;
                        }
                      }
                      if (e.key === 'Enter') {
                        setIsInputFocused(false);
                        handleSearch();
                      }
                    }}
                  />
                  {/* 搜索建议下拉 */}
                  {isInputFocused && suggestedHistory.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover text-popover-foreground border rounded-md shadow-md z-50 py-1 max-h-[300px] overflow-auto">
                      {suggestedHistory.map((item, i) => (
                        <div
                          key={i}
                          className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-center gap-2 ${i === selectedIndex ? "bg-accent text-accent-foreground" : ""
                            }`}
                          onMouseEnter={() => setSelectedIndex(i)}
                          onMouseDown={(e) => {
                            // 阻止默认事件防止 input 失去焦点，导致点击失效
                            e.preventDefault();
                          }}
                          onClick={() => {
                            setFilter(item);
                            setIsInputFocused(false);
                            // 延迟执行搜索，确保 filter 状态已更新
                            setTimeout(() => handleSearch(item), 0);
                          }}
                        >
                          <History className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 搜索历史下拉 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title={t('redis.searchHistory')}>
                      <History className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {searchHistory.length === 0 ? (
                      <DropdownMenuItem disabled className="text-muted-foreground">
                        {t('redis.noSearchHistory')}
                      </DropdownMenuItem>
                    ) : (
                      <>
                        {searchHistory.map((item, i) => (
                          <DropdownMenuItem
                            key={i}
                            onClick={() => {
                              setFilter(item);
                              // 延迟执行搜索，确保 filter 状态已更新
                              setTimeout(() => handleSearch(item), 0);
                            }}
                            className="font-mono text-xs truncate"
                          >
                            {item}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => clearRedisSearchHistory(connectionId, db)}
                          className="text-destructive"
                        >
                          {t('redis.clearHistory')}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* 搜索按钮 */}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => handleSearch()}
                  title={t('redis.search')}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              {/* 第二行: Total + Scan More | 视图切换 + 精确搜索 */}
              <div className="flex justify-between items-center mt-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('common.total')}: {keys.length}
                    {hasMore ? "+" : ""}
                  </span>

                  {/* Scan More 按钮 - 放在总数右边 */}
                  {showScanMore && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-6 px-2 text-[11px] font-medium ${hasMore
                        ? "text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                        : "text-muted-foreground border-muted"
                        }`}
                      onClick={() => {
                        // 继续扫描
                        if (hasMore && filter === lastScannedFilter && cursor !== "0") {
                          fetchKeys(false);
                        } else {
                          fetchKeys(true);
                        }
                      }}
                      disabled={loading || !hasMore}
                    >
                      {loading ? t('common.scanning') : t('common.scanMore')}
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* 视图切换下拉 */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                        {viewPreference.viewMode === 'list' ? (
                          <List className="h-3 w-3" />
                        ) : (
                          <FolderTree className="h-3 w-3" />
                        )}
                        {viewPreference.viewMode === 'list' ? t('redis.listView') : t('redis.treeView')}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRedisViewMode(connectionId, db, 'list')}>
                        <List className="mr-2 h-4 w-4" />
                        {t('redis.listView')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRedisViewMode(connectionId, db, 'tree')}>
                        <FolderTree className="mr-2 h-4 w-4" />
                        {t('redis.treeView')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5">
                        <label className="text-xs text-muted-foreground">{t('redis.delimiter')}</label>
                        <Input
                          className="h-7 mt-1 text-xs"
                          value={viewPreference.delimiter}
                          onChange={(e) => setRedisDelimiter(connectionId, db, e.target.value)}
                          placeholder=":"
                        />
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* 精确搜索 - 一直展示 */}
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <Checkbox
                      checked={exactSearch}
                      onCheckedChange={(checked) => setExactSearch(checked === true)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-muted-foreground">{t('redis.exactSearch')}</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Key List - 根据视图模式渲染 */}
            {viewPreference.viewMode === 'tree' ? (
              <RedisKeyTree
                keys={keys}
                delimiter={viewPreference.delimiter}
                selectedKey={selectedKey}
                onKeyClick={handleKeyClick}
                loading={loading}
                formatTTL={formatTTL}
              />
            ) : (
              <div ref={parentRef} className="flex-1 overflow-auto">
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const key = keys[virtualRow.index];
                    return (
                      <div
                        key={key.key}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div
                          className={`flex items-center p-3 cursor-pointer hover:bg-accent/50 transition-colors gap-3 border-b ${selectedKey === key.key ? "bg-accent" : ""
                            }`}
                          onClick={() => handleKeyClick(key)}
                        >
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 h-5 rounded min-w-[40px] justify-center uppercase border-0 ${getTypeColor(
                              key.type
                            )}`}
                          >
                            {key.type || "..."}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-sm font-medium truncate font-mono"
                              title={key.key}
                            >
                              {key.key}
                            </div>
                          </div>
                          <div className="flex flex-col items-end text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                            <span>{formatTTL(key.ttl)}</span>
                            <span>{formatSize(key.length)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {keys.length === 0 && !loading && (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    {t('redis.noKeys')}
                  </div>
                )}

                {/* Sentinel for infinite scroll */}
                <div ref={observerTarget} className="h-px w-full" />

                {loading && (
                  <div className="p-4 text-center text-muted-foreground text-xs">
                    {t('common.loading')}
                  </div>
                )}
              </div>
            )}
          </ResizablePanel>

          <ResizableHandle />

          {/* Right Content */}
          <ResizablePanel defaultSize={40}>
            {selectedKey ? (
              <div className="h-full flex flex-col">
                {/* Content Header */}
                <div className="p-4 border-b flex justify-between items-start bg-background">
                  <div className="flex flex-col gap-2 overflow-hidden flex-1 mr-4">
                    <div className="flex items-center">
                      <Badge
                        className={`uppercase rounded-sm ${getTypeColor(
                          selectedKeyItem?.type
                        )} border-0`}
                      >
                        {selectedKeyItem?.type || "UNKNOWN"}
                      </Badge>
                    </div>
                    <h1
                      className="text-lg font-bold font-mono break-all select-text"
                      title={selectedKey}
                    >
                      {selectedKey}
                    </h1>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-muted"
                      onClick={handleRefresh}
                      disabled={valueLoading}
                      title={t('common.refresh', 'Refresh')}
                    >
                      <RefreshCw className={`w-4 h-4 ${valueLoading ? "animate-spin" : ""}`} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:text-destructive"
                          title={t('redis.deleteKey', 'Delete Key')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel>{t('common.confirmDeletion')}</DropdownMenuLabel>
                        <div className="px-2 pt-2 pb-0.5 text-xs text-muted-foreground">
                          {t('redis.deleteKeyPrompt', 'Will delete key:')}
                        </div>
                        <div className="px-2 pb-2 text-xs font-mono font-medium break-all">
                          {selectedKey}
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive cursor-pointer focus:bg-red-50"
                          onClick={handleDeleteKey}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('common.delete', 'Delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Metadata Bar */}
                <div className="px-4 py-2 border-b bg-muted/10 flex gap-6 text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="font-medium">{t('redis.size', 'Size')}:</span>
                    <span>{formatSize(selectedKeyItem?.length)}</span>
                  </div>
                  <div className="flex gap-1 items-center">
                    <span className="font-medium">{t('redis.ttl', 'TTL')}:</span>
                    <span>{formatTTL(selectedKeyItem?.ttl)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditTTLValue(selectedKeyItem?.ttl?.toString() || "-1");
                        setIsEditTTLDialogOpen(true);
                      }}
                      title={t('redis.editTTL', 'Edit TTL')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 Z"></path></svg>
                    </Button>
                  </div>
                  <div className="flex gap-1">
                    <span className="font-medium">{t('redis.type', 'Type')}:</span>
                    <span className="uppercase">{selectedKeyItem?.type}</span>
                  </div>
                  {(selectedKeyItem?.type === 'hash' || selectedKeyItem?.type === 'zset') && (
                    <div className="flex gap-1">
                      <span className="font-medium">{t('redis.total', 'Total')}:</span>
                      <span>
                        {totalItemCount !== null
                          ? totalItemCount
                          : `${Math.floor(allValues.length / 2)}${valueHasMore ? "+" : ""}`}
                      </span>
                    </div>
                  )}
                  {(selectedKeyItem?.type === 'set' || selectedKeyItem?.type === 'list') && (
                    <div className="flex gap-1">
                      <span className="font-medium">{t('redis.total', 'Total')}:</span>
                      <span>
                        {totalItemCount !== null
                          ? totalItemCount
                          : `${allValues.length}${valueHasMore ? "+" : ""}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Value Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex-1 min-h-0">
                    <ValueViewer
                      connectionId={connectionId}
                      db={db}
                      keyName={selectedKey || ""}
                      value={selectedValue}
                      type={selectedKeyItem?.type}
                      allValues={allValues}
                      hasMore={valueHasMore}
                      loading={valueLoading}
                      filter={valueFilter}
                      onFilterChange={setValueFilter}
                      onSearch={() => {
                        setHasValueSearched(true);
                        fetchComplexValues(true);
                      }}
                      onScanMore={() => {
                        if (valueHasMore && valueFilter === lastScannedValueFilter && valueCursor !== "0") {
                          fetchComplexValues(false);
                        } else {
                          fetchComplexValues(true);
                        }
                      }}
                      hasSearched={hasValueSearched}
                      onRefresh={handleRefresh}
                      observerTarget={valueObserverTarget}
                      zsetOrder={zsetOrder}
                      onZsetOrderChange={setZsetOrder}
                      exactSearch={valueExactSearch}
                      onExactSearchChange={setValueExactSearch}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <div className="bg-muted/50 p-4 rounded-full">
                  <Info className="w-8 h-8 opacity-50" />
                </div>
                <p>{t('common.selectKeyToView')}</p>
              </div>
            )}
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

function ValueViewer({
  connectionId,
  db,
  keyName,
  value,
  type,
  allValues,
  hasMore,
  loading,
  filter,
  onFilterChange,
  onSearch,
  onScanMore,
  hasSearched,
  onRefresh,
  observerTarget,
  zsetOrder,
  onZsetOrderChange,
  exactSearch,
  onExactSearchChange
}: {
  connectionId: number;
  db: number;
  keyName: string;
  value: any;
  type?: string;
  allValues: any[];
  hasMore: boolean;
  loading: boolean;
  filter: string;
  onFilterChange: (filter: string) => void;
  onSearch: () => void;
  onScanMore: () => void;
  hasSearched: boolean;
  onRefresh: () => void;
  observerTarget: React.RefObject<HTMLDivElement | null>;
  zsetOrder: 'asc' | 'desc';
  onZsetOrderChange: (order: 'asc' | 'desc') => void;
  exactSearch: boolean;
  onExactSearchChange: (exact: boolean) => void;
}) {
  const { t } = useTranslation();
  if (!type) return <div className="text-muted-foreground italic p-4">{t('common.selectKeyToView')}</div>;

  if (type === "string") {
    return (
      <RedisStringViewer
        connectionId={connectionId}
        db={db}
        keyName={keyName}
        value={value}
        onRefresh={onRefresh}
      />
    );
  }

  if (type === "hash") {
    return (
      <RedisHashViewer
        connectionId={connectionId}
        db={db}
        keyName={keyName}
        data={allValues}
        loading={loading}
        hasMore={hasMore}
        filter={filter}
        onFilterChange={onFilterChange}
        onSearch={onSearch}
        onScanMore={onScanMore}
        hasSearched={hasSearched}
        onRefresh={onRefresh}
        observerTarget={observerTarget}
        exactSearch={exactSearch}
        onExactSearchChange={onExactSearchChange}
      />
    );
  }

  if (type === "set") {
    return (
      <RedisSetViewer
        connectionId={connectionId}
        db={db}
        keyName={keyName}
        data={allValues}
        loading={loading}
        hasMore={hasMore}
        filter={filter}
        onFilterChange={onFilterChange}
        onSearch={onSearch}
        onScanMore={onScanMore}
        hasSearched={hasSearched}
        onRefresh={onRefresh}
        observerTarget={observerTarget}
        exactSearch={exactSearch}
        onExactSearchChange={onExactSearchChange}
      />
    );
  }

  if (type === "zset") {
    return (
      <RedisZSetViewer
        connectionId={connectionId}
        db={db}
        keyName={keyName}
        data={allValues}
        loading={loading}
        hasMore={hasMore}
        filter={filter}
        onFilterChange={onFilterChange}
        onSearch={onSearch}
        onScanMore={onScanMore}
        hasSearched={hasSearched}
        onRefresh={onRefresh}
        observerTarget={observerTarget}
        sortOrder={zsetOrder}
        onSortOrderChange={onZsetOrderChange}
        exactSearch={exactSearch}
        onExactSearchChange={onExactSearchChange}
      />
    );
  }

  if (type === "list") {
    return (
      <RedisListViewer
        connectionId={connectionId}
        db={db}
        keyName={keyName}
        data={allValues}
        loading={loading}
        onRefresh={onRefresh}
      />
    );
  }

  if (type === "none") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-8">
        <div className="text-4xl">🗑️</div>
        <div className="text-sm">{t('redis.keyAutoDeleted')}</div>
      </div>
    );
  }

  return (
    <div className="text-muted-foreground italic p-4">
      Unsupported data type: {type}
    </div>
  );
}
