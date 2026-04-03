import { Info, RefreshCw, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { RedisValueViewer } from "@/components/workspace/redis/RedisValueViewer.tsx";
import { formatSize, getTypeColor, type KeyDetail } from "@/components/workspace/redis/redisWorkspace.shared.ts";

interface RedisValuePanelProps {
  connectionId: number;
  db: number;
  selectedKey: string | null;
  selectedKeyItem?: KeyDetail;
  selectedValue: any;
  allValues: any[];
  valueHasMore: boolean;
  valueLoading: boolean;
  valueFilter: string;
  setValueFilter: (value: string) => void;
  hasValueSearched: boolean;
  valueObserverTarget: RefObject<HTMLDivElement | null>;
  zsetOrder: "asc" | "desc";
  setZsetOrder: (order: "asc" | "desc") => void;
  valueExactSearch: boolean;
  setValueExactSearch: (exact: boolean) => void;
  totalItemCount: number | null;
  lastScannedValueFilter: string;
  valueCursor: string;
  onRefresh: (keyToRefresh?: string | any) => void;
  onDeleteKey: (keyToDelete?: string | any) => void;
  onOpenEditTTL: () => void;
  onSearchValues: () => void;
  onFetchComplexValues: (reset?: boolean) => void;
  formatTTL: (seconds?: number) => string;
}

export function RedisValuePanel({
  connectionId,
  db,
  selectedKey,
  selectedKeyItem,
  selectedValue,
  allValues,
  valueHasMore,
  valueLoading,
  valueFilter,
  setValueFilter,
  hasValueSearched,
  valueObserverTarget,
  zsetOrder,
  setZsetOrder,
  valueExactSearch,
  setValueExactSearch,
  totalItemCount,
  lastScannedValueFilter,
  valueCursor,
  onRefresh,
  onDeleteKey,
  onOpenEditTTL,
  onSearchValues,
  onFetchComplexValues,
  formatTTL,
}: RedisValuePanelProps) {
  const { t } = useTranslation();

  if (!selectedKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <div className="bg-muted/50 p-4 rounded-full">
          <Info className="w-8 h-8 opacity-50" />
        </div>
        <p>{t("common.selectKeyToView")}</p>
      </div>
    );
  }

  const totalCount = (() => {
    if (selectedKeyItem?.type === "hash" || selectedKeyItem?.type === "zset") {
      return totalItemCount !== null ? totalItemCount : `${Math.floor(allValues.length / 2)}${valueHasMore ? "+" : ""}`;
    }

    if (selectedKeyItem?.type === "set" || selectedKeyItem?.type === "list") {
      return totalItemCount !== null ? totalItemCount : `${allValues.length}${valueHasMore ? "+" : ""}`;
    }

    return null;
  })();

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b flex justify-between items-start bg-background">
        <div className="flex flex-col gap-2 overflow-hidden flex-1 mr-4">
          <div className="flex items-center">
            <Badge className={`uppercase rounded-sm ${getTypeColor(selectedKeyItem?.type)} border-0`}>
              {selectedKeyItem?.type || "UNKNOWN"}
            </Badge>
          </div>
          <h1 className="text-lg font-bold font-mono break-all select-text" title={selectedKey}>
            {selectedKey}
          </h1>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-muted"
            onClick={() => onRefresh()}
            disabled={valueLoading}
            title={t("common.refresh", "Refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${valueLoading ? "animate-spin" : ""}`} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:text-destructive"
                title={t("redis.deleteKey", "Delete Key")}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>{t("common.confirmDeletion")}</DropdownMenuLabel>
              <div className="px-2 pt-2 pb-0.5 text-xs text-muted-foreground">
                {t("redis.deleteKeyPrompt", "Will delete key:")}
              </div>
              <div className="px-2 pb-2 text-xs font-mono font-medium break-all">{selectedKey}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive cursor-pointer focus:bg-red-50"
                onClick={() => onDeleteKey()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("common.delete", "Delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="px-4 py-2 border-b bg-muted/10 flex gap-6 text-xs text-muted-foreground">
        <div className="flex gap-1">
          <span className="font-medium">{t("redis.size", "Size")}:</span>
          <span>{formatSize(selectedKeyItem?.length)}</span>
        </div>
        <div className="flex gap-1 items-center">
          <span className="font-medium">{t("redis.ttl", "TTL")}:</span>
          <span>{formatTTL(selectedKeyItem?.ttl)}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 ml-1 text-muted-foreground hover:text-foreground"
            onClick={onOpenEditTTL}
            title={t("redis.editTTL", "Edit TTL")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 Z"></path></svg>
          </Button>
        </div>
        <div className="flex gap-1">
          <span className="font-medium">{t("redis.type", "Type")}:</span>
          <span className="uppercase">{selectedKeyItem?.type}</span>
        </div>
        {totalCount !== null && (
          <div className="flex gap-1">
            <span className="font-medium">{t("redis.total", "Total")}:</span>
            <span>{totalCount}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0">
          <RedisValueViewer
            connectionId={connectionId}
            db={db}
            keyName={selectedKey}
            value={selectedValue}
            type={selectedKeyItem?.type}
            allValues={allValues}
            hasMore={valueHasMore}
            loading={valueLoading}
            filter={valueFilter}
            onFilterChange={setValueFilter}
            onSearch={onSearchValues}
            onScanMore={() => {
              if (valueHasMore && valueFilter === lastScannedValueFilter && valueCursor !== "0") {
                onFetchComplexValues(false);
              } else {
                onFetchComplexValues(true);
              }
            }}
            hasSearched={hasValueSearched}
            onRefresh={() => onRefresh()}
            observerTarget={valueObserverTarget}
            zsetOrder={zsetOrder}
            onZsetOrderChange={setZsetOrder}
            exactSearch={valueExactSearch}
            onExactSearchChange={setValueExactSearch}
          />
        </div>
      </div>
    </div>
  );
}
