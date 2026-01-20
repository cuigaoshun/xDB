import { Search, Plus, Trash2, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect, useRef } from "react";
import { addCommandToConsole } from "@/components/ui/CommandConsole";
import { RedisHashViewer } from "../redis/RedisHashViewer";
import { RedisSetViewer } from "../redis/RedisSetViewer";
import { RedisZSetViewer } from "../redis/RedisZSetViewer";
import { RedisListViewer } from "../redis/RedisListViewer";
import { RedisStringViewer } from "../redis/RedisStringViewer";
import { RedisAddKeyDialog } from "../redis/RedisAddKeyDialog";
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

  // Sync state to global store
  useEffect(() => {
    const timer = setTimeout(() => {
      updateTab(tabId, {
        savedResult: {
          keys,
          cursor,
          hasMore,
          selectedKey,
          selectedValue,
          allValues,
          valueCursor,
          lastScannedFilter
        }
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [keys, cursor, hasMore, selectedKey, selectedValue, allValues, valueCursor, lastScannedFilter, tabId, updateTab]);

  // Generate search pattern based on input
  const getSearchPattern = (searchTerm: string) => {
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

  const fetchKeys = async (reset = false) => {
    if (loading) return;
    if (!reset && !hasMore) return;

    setLoading(true);

    const useExactSearch = filter && !filter.endsWith('*') && filter.trim() !== "";
    const startTime = Date.now();
    let command = '';

    try {
      if (useExactSearch) {
        // Exact search: use EXISTS command
        const searchTerm = filter.trim();
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

        // Log command to console
        addCommandToConsole({
          databaseType: 'redis',
          command,
          duration: Date.now() - startTime,
          success: true
        });
      } else {
        // Full scan or prefix search: use SCAN
        // IMPORTANT: If we are not resetting, we continue from the existing cursor
        // If the filter has changed, we should have reset via the useEffect or manual trigger, so `reset` would be true.
        // If we are here with `reset=false`, it means we are continuing the scan for the *same* filter (or we should be).

        const currentCursor = reset ? "0" : cursor;
        const searchPattern = getSearchPattern(filter);
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
        if (!useExactSearch) {
          setLastScannedFilter(filter);
        }

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
  };

  const handleDeleteKey = async () => {
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
  };

  const fetchComplexValues = async (reset = false) => {
    const currentKeyItem = keys.find((k) => k.key === selectedKey);
    if (!selectedKey || !currentKeyItem) return;
    if (valueLoading) return;
    if (!reset && !valueHasMore) return;

    setValueLoading(true);
    const currentCursor = reset ? "0" : valueCursor;

    // Determine search strategy for complex values
    const useExactSearch = valueFilter && !valueFilter.endsWith('*') && valueFilter.trim() !== "";
    const searchPattern = getSearchPattern(valueFilter);
    const type = currentKeyItem.type;

    const startTime = Date.now();
    let command = '';

    try {
      let result;

      if (type === "hash") {
        command = `HSCAN ${selectedKey} ${currentCursor} MATCH ${searchPattern} COUNT 100`;
        result = await invoke<ValueScanResult>("scan_hash_values", {
          connectionId,
          key: selectedKey,
          cursor: currentCursor,
          count: 100,
          pattern: searchPattern,
          db,
        });
      } else if (type === "set") {
        command = `SSCAN ${selectedKey} ${currentCursor} MATCH ${searchPattern} COUNT 100`;
        result = await invoke<ValueScanResult>("scan_set_members", {
          connectionId,
          key: selectedKey,
          cursor: currentCursor,
          count: 100,
          pattern: searchPattern,
          db,
        });
      } else if (type === "zset") {
        command = `ZSCAN ${selectedKey} ${currentCursor} MATCH ${searchPattern} COUNT 100`;
        result = await invoke<ValueScanResult>("scan_zset_members", {
          connectionId,
          key: selectedKey,
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
        const searchTerm = valueFilter.trim();
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
  };

  const fetchListValues = async (start = 0, end = 99) => {
    const currentKeyItem = keys.find((k) => k.key === selectedKey);
    if (!selectedKey || !currentKeyItem || currentKeyItem.type !== "list") return;
    if (valueLoading) return;

    setValueLoading(true);

    const startTime = Date.now();
    const command = `LRANGE ${selectedKey} ${start} ${end}`;

    try {
      const result = await invoke<RedisResult>("scan_list_values", {
        connectionId,
        key: selectedKey,
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
  };

  // Precision control for fetchKeys using refs to handle Strict Mode and dependencies
  const propsRef = useRef({ connectionId, db, filter, initialized: false });

  useEffect(() => {
    const prev = propsRef.current;
    const curr = { connectionId, db, filter, initialized: true };
    propsRef.current = curr;

    // Case 1: Initial mount - Immediate fetch if no saved data
    if (!prev.initialized) {
      if (!savedResult) {
        fetchKeys(true);
      }
      return;
    }

    // Case 2: Connection or DB changed - Immediate fetch
    if (prev.connectionId !== curr.connectionId || prev.db !== curr.db) {
      fetchKeys(true);
      return;
    }

    // Case 3: Filter changed - Debounced fetch
    if (prev.filter !== curr.filter) {
      const timer = setTimeout(() => {
        fetchKeys(true);
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, db, filter]);

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
        const isPrefixSearch = filter && filter.endsWith("*");
        if (entries[0].isIntersecting && hasMore && !loading && !isPrefixSearch) {
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

  const handleKeyClick = async (keyItem: KeyDetail) => {
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
  };

  // Helper to render key type badge color
  const getTypeColor = (type?: string) => {
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

  const formatSize = (bytes?: number | null) => {
    if (bytes === null || bytes === undefined) return "-";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  const formatTTL = (seconds?: number) => {
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
  };

  const selectedKeyItem = keys.find((k) => k.key === selectedKey);

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
              <div className="relative">
                <Search
                  className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"
                />
                <Input
                  placeholder={t('redis.filterKeysPlaceholder', 'Filter by Key Name...')}
                  className="pl-8 h-9"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="flex justify-between items-center mt-2 px-1">
                <span className="text-xs text-muted-foreground">
                  {t('common.total', 'Total')}: {keys.length}
                  {hasMore ? "+" : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-[11px] font-medium text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                  onClick={() => {
                    const isPrefixSearch = filter && filter.endsWith('*');
                    // We only continue scanning if the filter hasn't changed (comparing to lastScannedFilter)
                    // If filter changed, we should start fresh (fetchKeys(true)).
                    // If cursor is "0", that means we finished previous scan, so we start over or just refresh (also fetchKeys(true)).
                    // The only case to fetchKeys(false) [continue scan] is:
                    // 1. We are in a prefix search
                    // 2. The current filter matches what we were scanning
                    // 3. We haven't finished scanning (cursor != "0")
                    if (isPrefixSearch && filter === lastScannedFilter && cursor !== "0") {
                      fetchKeys(false);
                    } else {
                      fetchKeys(true);
                    }
                  }}
                >
                  {loading ? t('common.scanning', 'Scanning...') : t('common.scanMore', 'Scan More')}
                </Button>
              </div>
            </div>

            {/* Key List */}
            <ScrollArea className="flex-1">
              <div className="flex flex-col divide-y">
                {keys.map((key) => (
                  <div
                    key={key.key}
                    className={`flex items-center p-3 cursor-pointer hover:bg-accent/50 transition-colors gap-3 ${selectedKey === key.key ? "bg-accent" : ""
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
                ))}
                {keys.length === 0 && !loading && (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    {t('redis.noKeys', 'No keys found')}
                  </div>
                )}

                {/* Sentinel for infinite scroll */}
                <div ref={observerTarget} className="h-px w-full" />

                {loading && (
                  <div className="p-4 text-center text-muted-foreground text-xs">
                    {t('common.loading', 'Loading...')}
                  </div>
                )}
              </div>
            </ScrollArea>
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
                        onRefresh={() => {
                          const currentKeyItem = keys.find((k) => k.key === selectedKey);
                          if (!selectedKey || !currentKeyItem) return;

                          if (currentKeyItem.type === "string") {
                            setValueLoading(true);
                            invoke<RedisResult>("execute_redis_command", {
                              connectionId,
                              command: "GET",
                              args: [selectedKey],
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
                        }}
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
