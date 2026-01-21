import { Search, Plus, Trash2, Info, History, List, FolderTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { addCommandToConsole } from "@/components/ui/CommandConsole";
import { RedisHashViewer } from "../redis/RedisHashViewer";
import { RedisSetViewer } from "../redis/RedisSetViewer";
import { RedisZSetViewer } from "../redis/RedisZSetViewer";
import { RedisListViewer } from "../redis/RedisListViewer";
import { RedisStringViewer } from "../redis/RedisStringViewer";
import { RedisAddKeyDialog } from "../redis/RedisAddKeyDialog";
import { RedisKeyTree } from "../redis/RedisKeyTree";
import { useAppStore } from "@/store/useAppStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  return `*${searchTerm}*`;
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Details for the selected key (value content)
  const [selectedValue, setSelectedValue] = useState<any>(savedResult?.selectedValue || null);
  const [valueLoading, setValueLoading] = useState(false);

  // Scan state for complex data types
  const [valueCursor, setValueCursor] = useState<string>(savedResult?.valueCursor || "0");
  const [valueHasMore, setValueHasMore] = useState(true);
  const [valueFilter, setValueFilter] = useState<string>("");
  const [allValues, setAllValues] = useState<any[]>(savedResult?.allValues || []);

  const [lastScannedFilter, setLastScannedFilter] = useState<string>(savedResult?.lastScannedFilter || "");

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

  // 显示 Scan More 按钮的条件：非精确搜索 + 搜索框非空 + 已搜索
  // hasMore 只决定按钮是否可点击，不决定是否显示
  const showScanMore = !exactSearch && filter.trim() !== '' && hasSearched;

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
          valueCursor
        }
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedKey, selectedValue, allValues, valueCursor, tabId, updateTab]);

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

  const fetchKeys = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    if (!reset && !hasMoreRef.current) return;

    setLoading(true);

    const currentFilter = filterRef.current;
    const useExactSearch = exactSearchRef.current && currentFilter.trim() !== "";
    const startTime = Date.now();
    let command = '';

    try {
      if (useExactSearch) {
        // Exact search: use EXISTS command
        const searchTerm = currentFilter.trim();
        command = `EXISTS ${searchTerm}`;

        const result = await invoke<RedisResult>("execute_redis_command", {
          connectionId,
          command: "EXISTS",
          args: [searchTerm],
          db,
        });

        // If key exists, get its details
        if (result.output === 1) {
          const keyDetails = await invoke<KeyDetail[]>("get_keys_details", {
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
        addCommandToConsole({
          databaseType: 'redis',
          command,
          duration: Date.now() - startTime,
          success: true
        });
      } else {
        // Full scan or pattern search: use SCAN
        const currentCursor = reset ? "0" : cursorRef.current;
        const searchPattern = getSearchPattern(currentFilter);
        command = `SCAN ${currentCursor} MATCH ${searchPattern} COUNT ${redisScanCount}`;

        const result = await invoke<ScanResult>("get_redis_keys", {
          connectionId,
          cursor: currentCursor,
          count: redisScanCount,
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
        addCommandToConsole({
          databaseType: 'redis',
          command,
          duration: Date.now() - startTime,
          success: true
        });
      }
    } catch (e) {
      console.error("Failed to fetch keys", e);

      // Log error command
      addCommandToConsole({
        databaseType: 'redis',
        command,
        duration: Date.now() - startTime,
        success: false,
        error: e instanceof Error ? e.message : String(e)
      });
    } finally {
      setLoading(false);
    }
  }, [connectionId, db, redisScanCount]);

  const handleDeleteKey = useCallback(async () => {
    if (!selectedKey) return;

    setIsDeleteDialogOpen(false);
    const startTime = Date.now();
    const command = `DEL ${selectedKey}`;
    try {
      await invoke("execute_redis_command", {
        connectionId,
        command: "DEL",
        args: [selectedKey],
        db,
      });

      addCommandToConsole({
        databaseType: 'redis',
        command,
        duration: Date.now() - startTime,
        success: true
      });

      setSelectedKey(null);
      fetchKeys(true);
    } catch (error) {
      console.error("Failed to delete key", error);
      addCommandToConsole({
        databaseType: 'redis',
        command,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, [connectionId, db, selectedKey, fetchKeys]);

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

  const fetchComplexValues = useCallback(async (reset = false) => {
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
    const useExactSearch = currentValueFilter && !currentValueFilter.endsWith('*') && currentValueFilter.trim() !== "";
    const searchPattern = getSearchPattern(currentValueFilter);
    const type = currentKeyItem.type;

    const startTime = Date.now();
    let command = '';

    try {
      let result;

      if (type === "hash") {
        command = `HSCAN ${currentSelectedKey} ${currentCursor} MATCH ${searchPattern} COUNT 100`;
        result = await invoke<ValueScanResult>("scan_hash_values", {
          connectionId,
          key: currentSelectedKey,
          cursor: currentCursor,
          count: 100,
          pattern: searchPattern,
          db,
        });
      } else if (type === "set") {
        command = `SSCAN ${currentSelectedKey} ${currentCursor} MATCH ${searchPattern} COUNT 100`;
        result = await invoke<ValueScanResult>("scan_set_members", {
          connectionId,
          key: currentSelectedKey,
          cursor: currentCursor,
          count: 100,
          pattern: searchPattern,
          db,
        });
      } else if (type === "zset") {
        command = `ZSCAN ${currentSelectedKey} ${currentCursor} MATCH ${searchPattern} COUNT 100`;
        result = await invoke<ValueScanResult>("scan_zset_members", {
          connectionId,
          key: currentSelectedKey,
          cursor: currentCursor,
          count: 100,
          pattern: searchPattern,
          db,
        });
      } else {
        return;
      }

      let filteredValues = result.values;

      // If exact search, filter client-side
      if (useExactSearch) {
        const searchTerm = currentValueFilter.trim();
        if (type === "hash") {
          // For hash, search in field names
          filteredValues = [];
          for (let i = 0; i < result.values.length; i += 2) {
            const field: string = result.values[i];
            if (field === searchTerm) {
              filteredValues.push(field, result.values[i + 1]);
            }
          }
        } else if (type === "set") {
          // For set, search in member values
          filteredValues = result.values.filter((value: string) => value === searchTerm);
        } else if (type === "zset") {
          // For zset, search in member names
          filteredValues = [];
          for (let i = 0; i < result.values.length; i += 2) {
            const member: string = result.values[i];
            if (member === searchTerm) {
              filteredValues.push(member, result.values[i + 1]);
            }
          }
        }
      }

      if (reset) {
        setAllValues(filteredValues);
      } else {
        setAllValues((prev) => [...prev, ...filteredValues]);
      }

      setValueCursor(result.cursor);
      setValueHasMore(result.cursor !== "0" && !useExactSearch);

      // Log command to console
      addCommandToConsole({
        databaseType: 'redis',
        command,
        duration: Date.now() - startTime,
        success: true
      });
    } catch (e) {
      console.error("Failed to fetch complex values", e);

      // Log error command
      addCommandToConsole({
        databaseType: 'redis',
        command,
        duration: Date.now() - startTime,
        success: false,
        error: e instanceof Error ? e.message : String(e)
      });
    } finally {
      setValueLoading(false);
    }
  }, [connectionId, db]);

  const fetchListValues = useCallback(async (start = 0, end = 99) => {
    const currentSelectedKey = selectedKeyRef.current;
    const currentKeys = keysRef.current;
    const currentKeyItem = currentKeys.find((k) => k.key === currentSelectedKey);
    if (!currentSelectedKey || !currentKeyItem || currentKeyItem.type !== "list") return;
    if (valueLoadingRef.current) return;

    setValueLoading(true);

    const startTime = Date.now();
    const command = `LRANGE ${currentSelectedKey} ${start} ${end}`;

    try {
      const result = await invoke<RedisResult>("scan_list_values", {
        connectionId,
        key: currentSelectedKey,
        start,
        end,
        db,
      });

      setAllValues(result.output);
      setValueHasMore(false);

      // Log command to console
      addCommandToConsole({
        databaseType: 'redis',
        command,
        duration: Date.now() - startTime,
        success: true
      });
    } catch (e) {
      console.error("Failed to fetch list values", e);

      // Log error command
      addCommandToConsole({
        databaseType: 'redis',
        command,
        duration: Date.now() - startTime,
        success: false,
        error: e instanceof Error ? e.message : String(e)
      });
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

  // Debounce value filter for complex types and handle key selection
  const prevSelectedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Determine if selectedKey actually changed
    const isKeyChanged = prevSelectedKeyRef.current !== selectedKey;
    prevSelectedKeyRef.current = selectedKey;

    if (!selectedKey) return;

    const currentKeyItem = keys.find((k) => k.key === selectedKey);
    if (!currentKeyItem) return;

    if (currentKeyItem.type === "list") {
      if (isKeyChanged) {
        fetchListValues(0, 99);
      }
      return;
    }

    if (currentKeyItem.type === "hash" || currentKeyItem.type === "set" || currentKeyItem.type === "zset") {
      if (isKeyChanged) {
        // Immediate fetch on key change
        fetchComplexValues(true);
      } else {
        // Debounce on filter change
        const timer = setTimeout(() => {
          fetchComplexValues(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueFilter, selectedKey]);

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
        if (entries[0].isIntersecting && valueHasMore && !valueLoading &&
          selectedKey && currentKeyItem &&
          (currentKeyItem.type === "hash" || currentKeyItem.type === "set" || currentKeyItem.type === "zset")) {
          fetchComplexValues(false);
        }
      },
      { threshold: 0.1 }
    );

    if (valueObserverTarget.current) {
      observer.observe(valueObserverTarget.current);
    }

    return () => observer.disconnect();
  }, [valueHasMore, valueLoading, fetchComplexValues, selectedKey]);

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
      const startTime = Date.now();
      const command = `GET ${keyItem.key}`;
      try {
        const valRes = await invoke<RedisResult>("execute_redis_command", {
          connectionId,
          command: "GET",
          args: [keyItem.key],
          db,
        });
        setSelectedValue(valRes.output);

        // Log command to console
        addCommandToConsole({
          databaseType: 'redis',
          command,
          duration: Date.now() - startTime,
          success: true
        });
      } catch (error) {
        console.error("Failed to fetch value", error);
        setSelectedValue(t('common.errorFetching'));

        // Log error command
        addCommandToConsole({
          databaseType: 'redis',
          command,
          duration: Date.now() - startTime,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
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

    if (currentKeyItem.type === "string") {
      setValueLoading(true);
      invoke<RedisResult>("execute_redis_command", {
        connectionId,
        command: "GET",
        args: [currentSelectedKey],
        db,
      }).then(valRes => {
        setSelectedValue(valRes.output);
      }).finally(() => {
        setValueLoading(false);
      });
    } else if (currentKeyItem.type === "list") {
      fetchListValues(0, 99);
    } else {
      fetchComplexValues(true);
    }
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
                    onChange={(e) => setFilter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch();
                      }
                    }}
                  />
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
              
              {/* 第二行: Total + 视图切换 + (精确搜索 或 Scan More) */}
              <div className="flex justify-between items-center mt-2 px-1">
                <span className="text-xs text-muted-foreground">
                  {t('common.total')}: {keys.length}
                  {hasMore ? "+" : ""}
                </span>
                
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
                  
                  {/* 精确搜索 或 Scan More */}
                  {showScanMore ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-7 px-3 text-[11px] font-medium ${
                        hasMore 
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
                      {loading ? t('common.scanning') : hasMore ? t('common.scanMore') : t('common.scanMore')}
                    </Button>
                  ) : (
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                      <Checkbox
                        checked={exactSearch}
                        onCheckedChange={(checked) => setExactSearch(checked === true)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-muted-foreground">{t('redis.exactSearch')}</span>
                    </label>
                  )}
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
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Badge
                      className={`uppercase rounded-sm ${getTypeColor(
                        selectedKeyItem?.type
                      )} border-0`}
                    >
                      {selectedKeyItem?.type || "UNKNOWN"}
                    </Badge>
                    <h1
                      className="text-lg font-bold font-mono truncate"
                      title={selectedKey}
                    >
                      {selectedKey}
                    </h1>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:text-destructive"
                      title={t('redis.deleteKey', 'Delete Key')}
                      onClick={() => setIsDeleteDialogOpen(true)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Metadata Bar */}
                <div className="px-4 py-2 border-b bg-muted/10 flex gap-6 text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="font-medium">{t('redis.size', 'Size')}:</span>
                    <span>{formatSize(selectedKeyItem?.length)}</span>
                  </div>
                  <div className="flex gap-1">
                    <span className="font-medium">{t('redis.ttl', 'TTL')}:</span>
                    <span>{formatTTL(selectedKeyItem?.ttl)}</span>
                  </div>
                  <div className="flex gap-1">
                    <span className="font-medium">{t('redis.type', 'Type')}:</span>
                    <span className="uppercase">{selectedKeyItem?.type}</span>
                  </div>
                </div>

                {/* Value Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  {valueLoading ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      {t('redis.loadingValue', 'Loading value...')}
                    </div>
                  ) : (
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
                        onRefresh={handleRefresh}
                        observerTarget={valueObserverTarget}
                      />
                    </div>
                  )}
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

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.confirmDeletion')}</DialogTitle>
            <DialogDescription>
              {t('common.confirmDeleteKey', { key: selectedKey })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteKey}>
              {t('common.delete')}
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
  onRefresh,
  observerTarget
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
  onRefresh: () => void;
  observerTarget: React.RefObject<HTMLDivElement | null>;
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
        onRefresh={onRefresh}
        observerTarget={observerTarget}
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
        onRefresh={onRefresh}
        observerTarget={observerTarget}
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
        onRefresh={onRefresh}
        observerTarget={observerTarget}
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

  return (
    <div className="text-muted-foreground italic p-4">
      Unsupported data type: {type}
    </div>
  );
}
