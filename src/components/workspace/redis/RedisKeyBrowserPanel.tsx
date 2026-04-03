import { History, List, FolderTree, RefreshCw, Search, Trash2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { RedisKeyTree } from "@/components/workspace/redis/RedisKeyTree.tsx";
import { KEY_ITEM_HEIGHT, formatSize, getTypeColor, type KeyDetail } from "@/components/workspace/redis/redisWorkspace.shared.ts";

interface RedisKeyBrowserPanelProps {
  keys: KeyDetail[];
  selectedKey: string | null;
  loading: boolean;
  filter: string;
  setFilter: Dispatch<SetStateAction<string>>;
  searchHistory: string[];
  suggestedHistory: string[];
  isInputFocused: boolean;
  setIsInputFocused: Dispatch<SetStateAction<boolean>>;
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  showHistoryDropdown: boolean;
  setShowHistoryDropdown: Dispatch<SetStateAction<boolean>>;
  exactSearch: boolean;
  setExactSearch: Dispatch<SetStateAction<boolean>>;
  hasMore: boolean;
  hasSearched: boolean;
  lastScannedFilter: string;
  cursor: string;
  showScanMore: boolean;
  viewPreference: {
    viewMode: "list" | "tree";
    delimiter: string;
  };
  connectionId: number;
  db: number;
  setRedisViewMode: (connectionId: number, db: number, viewMode: "list" | "tree") => void;
  setRedisDelimiter: (connectionId: number, db: number, delimiter: string) => void;
  clearRedisSearchHistory: (connectionId: number, db: number) => void;
  onSearch: (searchTerm?: string) => void;
  onFetchKeys: (reset?: boolean) => void;
  onKeyClick: (keyItem: KeyDetail) => void;
  onRefreshKey: (keyToRefresh?: string | any) => void;
  onDeleteKey: (keyToDelete?: string | any) => void;
  formatTTL: (seconds?: number) => string;
  searchContainerRef: RefObject<HTMLDivElement | null>;
  observerTarget: RefObject<HTMLDivElement | null>;
  parentRef: RefObject<HTMLDivElement | null>;
}

export function RedisKeyBrowserPanel({
  keys,
  selectedKey,
  loading,
  filter,
  setFilter,
  searchHistory,
  suggestedHistory,
  isInputFocused,
  setIsInputFocused,
  selectedIndex,
  setSelectedIndex,
  showHistoryDropdown,
  setShowHistoryDropdown,
  exactSearch,
  setExactSearch,
  hasMore,
  hasSearched,
  lastScannedFilter,
  cursor,
  showScanMore,
  viewPreference,
  connectionId,
  db,
  setRedisViewMode,
  setRedisDelimiter,
  clearRedisSearchHistory,
  onSearch,
  onFetchKeys,
  onKeyClick,
  onRefreshKey,
  onDeleteKey,
  formatTTL,
  searchContainerRef,
  observerTarget,
  parentRef,
}: RedisKeyBrowserPanelProps) {
  const { t } = useTranslation();
  const rowVirtualizer = useVirtualizer({
    count: keys.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => KEY_ITEM_HEIGHT,
    overscan: 5,
  });

  return (
    <>
      <div className="p-2" ref={searchContainerRef}>
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("redis.filterKeysPlaceholder")}
              className="pl-8 h-9"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setIsInputFocused(true);
              }}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => {
                setTimeout(() => setIsInputFocused(false), 250);
              }}
              onKeyDown={(e) => {
                const list = showHistoryDropdown ? searchHistory : suggestedHistory;
                const isOpen = showHistoryDropdown || (isInputFocused && suggestedHistory.length > 0);

                if (isOpen && list.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedIndex((prev) => (prev < list.length - 1 ? prev + 1 : prev));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedIndex((prev) => (prev > -1 ? prev - 1 : -1));
                    return;
                  }
                  if (e.key === "Enter" && selectedIndex >= 0) {
                    e.preventDefault();
                    const selectedItem = list[selectedIndex];
                    setFilter(selectedItem);
                    setIsInputFocused(false);
                    setShowHistoryDropdown(false);
                    return;
                  }
                }
                if (e.key === "Enter") {
                  setIsInputFocused(false);
                  setShowHistoryDropdown(false);
                  onSearch();
                }
              }}
            />
            {showHistoryDropdown || (isInputFocused && suggestedHistory.length > 0) ? (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover text-popover-foreground border rounded-md shadow-md z-50 py-1 max-h-[300px] overflow-auto">
                {showHistoryDropdown ? (
                  searchHistory.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">{t("redis.noSearchHistory")}</div>
                  ) : (
                    <>
                      {searchHistory.map((item, i) => (
                        <div
                          key={i}
                          className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-center gap-2 ${i === selectedIndex ? "bg-accent text-accent-foreground" : ""}`}
                          onMouseEnter={() => setSelectedIndex(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setFilter(item);
                            setShowHistoryDropdown(false);
                            setTimeout(() => onSearch(item), 0);
                          }}
                        >
                          <History className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{item}</span>
                        </div>
                      ))}
                      <div className="h-px bg-border my-1" />
                      <div
                        className="px-3 py-1.5 text-sm cursor-pointer text-destructive hover:bg-accent"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          clearRedisSearchHistory(connectionId, db);
                          setShowHistoryDropdown(false);
                        }}
                      >
                        {t("redis.clearHistory")}
                      </div>
                    </>
                  )
                ) : (
                  suggestedHistory.map((item, i) => (
                    <div
                      key={i}
                      className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-center gap-2 ${i === selectedIndex ? "bg-accent text-accent-foreground" : ""}`}
                      onMouseEnter={() => setSelectedIndex(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setFilter(item);
                        setIsInputFocused(false);
                        setTimeout(() => onSearch(item), 0);
                      }}
                    >
                      <History className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{item}</span>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <Button
            variant={showHistoryDropdown ? "secondary" : "outline"}
            size="icon"
            className="h-9 w-9 shrink-0"
            title={t("redis.searchHistory")}
            onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
          >
            <History className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => {
              setShowHistoryDropdown(false);
              onSearch();
            }}
            title={t("redis.search")}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex justify-between items-center mt-2 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("common.total")}: {keys.length}
              {hasMore ? "+" : ""}
            </span>

            {showScanMore && (
              <Button
                variant="outline"
                size="sm"
                className={`h-6 px-2 text-[11px] font-medium ${hasMore ? "text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300" : "text-muted-foreground border-muted"}`}
                onClick={() => {
                  if (hasMore && filter === lastScannedFilter && cursor !== "0") {
                    onFetchKeys(false);
                  } else {
                    onFetchKeys(true);
                  }
                }}
                disabled={loading || !hasMore}
              >
                {loading ? t("common.scanning") : t("common.scanMore")}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                  {viewPreference.viewMode === "list" ? <List className="h-3 w-3" /> : <FolderTree className="h-3 w-3" />}
                  {viewPreference.viewMode === "list" ? t("redis.listView") : t("redis.treeView")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setRedisViewMode(connectionId, db, "list")}>
                  <List className="mr-2 h-4 w-4" />
                  {t("redis.listView")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRedisViewMode(connectionId, db, "tree")}>
                  <FolderTree className="mr-2 h-4 w-4" />
                  {t("redis.treeView")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <label className="text-xs text-muted-foreground">{t("redis.delimiter")}</label>
                  <Input
                    className="h-7 mt-1 text-xs"
                    value={viewPreference.delimiter}
                    onChange={(e) => setRedisDelimiter(connectionId, db, e.target.value)}
                    placeholder=":"
                  />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <Checkbox
                checked={exactSearch}
                onCheckedChange={(checked) => setExactSearch(checked === true)}
                className="h-3.5 w-3.5"
              />
              <span className="text-muted-foreground">{t("redis.exactSearch")}</span>
            </label>
          </div>
        </div>
      </div>

      {viewPreference.viewMode === "tree" ? (
        <RedisKeyTree
          keys={keys}
          delimiter={viewPreference.delimiter}
          selectedKey={selectedKey}
          onKeyClick={onKeyClick}
          loading={loading}
          formatTTL={formatTTL}
          isSearchActive={hasSearched && lastScannedFilter.trim() !== "" && lastScannedFilter.trim() !== "*"}
          onRefreshKey={(k) => onRefreshKey(k.key)}
          onDeleteKey={(k) => onDeleteKey(k.key)}
        />
      ) : (
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const key = keys[virtualRow.index];
              const content = (
                <div
                  className={`flex items-center p-3 cursor-pointer hover:bg-accent/50 transition-colors gap-3 border-b ${selectedKey === key.key ? "bg-accent" : ""}`}
                  onClick={() => onKeyClick(key)}
                >
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-5 rounded min-w-[40px] justify-center uppercase border-0 ${getTypeColor(key.type)}`}
                  >
                    {key.type || "..."}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate font-mono" title={key.key}>
                      {key.key}
                    </div>
                  </div>
                  <div className="flex flex-col items-end text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                    <span>{formatTTL(key.ttl)}</span>
                    <span>{formatSize(key.length)}</span>
                  </div>
                </div>
              );

              return (
                <div
                  key={key.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ContextMenu>
                    <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => onRefreshKey(key.key)}>
                        <RefreshCw className="mr-2 w-4 h-4" />
                        {t("common.refresh", "Refresh")}
                      </ContextMenuItem>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                          <Trash2 className="mr-2 w-4 h-4" />
                          {t("common.delete", "Delete")}
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-64">
                          <ContextMenuLabel>{t("common.confirmDeletion")}</ContextMenuLabel>
                          <div className="px-2 pt-2 pb-0.5 text-xs text-muted-foreground">
                            {t("redis.deleteKeyPrompt", "Will delete key:")}
                          </div>
                          <div className="px-2 pb-2 text-xs font-mono font-medium break-all">{key.key}</div>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            className="text-destructive focus:text-destructive cursor-pointer focus:bg-red-50"
                            onClick={() => onDeleteKey(key.key)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("common.delete", "Delete")}
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              );
            })}
          </div>

          {keys.length === 0 && !loading && (
            <div className="p-8 text-center text-muted-foreground text-sm">{t("redis.noKeys")}</div>
          )}

          <div ref={observerTarget} className="h-px w-full" />

          {loading && <div className="p-4 text-center text-muted-foreground text-xs">{t("common.loading")}</div>}
        </div>
      )}
    </>
  );
}
