import { useTranslation } from "react-i18next";
import type { RefObject } from "react";
import { RedisHashViewer } from "@/components/workspace/redis/RedisHashViewer.tsx";
import { RedisSetViewer } from "@/components/workspace/redis/RedisSetViewer.tsx";
import { RedisZSetViewer } from "@/components/workspace/redis/RedisZSetViewer.tsx";
import { RedisListViewer } from "@/components/workspace/redis/RedisListViewer.tsx";
import { RedisStringViewer } from "@/components/workspace/redis/RedisStringViewer.tsx";

interface RedisValueViewerProps {
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
  observerTarget: RefObject<HTMLDivElement | null>;
  zsetOrder: "asc" | "desc";
  onZsetOrderChange: (order: "asc" | "desc") => void;
  exactSearch: boolean;
  onExactSearchChange: (exact: boolean) => void;
}

export function RedisValueViewer({
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
  onExactSearchChange,
}: RedisValueViewerProps) {
  const { t } = useTranslation();

  if (!type) {
    return <div className="text-muted-foreground italic p-4">{t("common.selectKeyToView")}</div>;
  }

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
        <div className="text-sm">{t("redis.keyAutoDeleted")}</div>
      </div>
    );
  }

  return <div className="text-muted-foreground italic p-4">Unsupported data type: {type}</div>;
}
