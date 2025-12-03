import { Search, Terminal, RefreshCw, Plus, Copy, X, Trash2, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RedisResult {
    output: any;
}

interface KeyDetail {
    key: string;
    type: string;
    ttl: number;
    length: number | null; 
}

interface ScanResult {
    cursor: string;
    keys: KeyDetail[];
}

export function RedisWorkspace({ name, connectionId, db = 0 }: { name: string; connectionId: number; db?: number }) {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<KeyDetail[]>([]);
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState<string>("0");
  const [hasMore, setHasMore] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Details for the selected key (value content)
  const [selectedValue, setSelectedValue] = useState<any>(null);
  const [valueLoading, setValueLoading] = useState(false);

  const fetchKeys = async (reset = false) => {
    if (loading) return;
    if (!reset && !hasMore) return;

    setLoading(true);
    const currentCursor = reset ? "0" : cursor;
    // Redis SCAN match pattern
    const searchPattern = filter ? `*${filter}*` : "*";

    try {
      const result = await invoke<ScanResult>("get_redis_keys", {
        connectionId,
        cursor: currentCursor,
        count: 100,
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
    } catch (e) {
      console.error("Failed to fetch keys", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, db]);

  // Debounce filter
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchKeys(true);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
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

  const handleKeyClick = async (keyItem: KeyDetail) => {
    setSelectedKey(keyItem.key);
    setValueLoading(true);
    setSelectedValue(null);

    const type = keyItem.type || "string";

    try {
      let cmd = "GET";
      let args = [keyItem.key];

      if (type === "hash") {
        cmd = "HGETALL";
      } else if (type === "list") {
        cmd = "LRANGE";
        args.push("0", "-1");
      } else if (type === "set") {
        cmd = "SMEMBERS";
      } else if (type === "zset") {
        cmd = "ZRANGE";
        args.push("0", "-1", "WITHSCORES");
      }

      const valRes = await invoke<RedisResult>("execute_redis_command", {
        connectionId,
        command: cmd,
        args,
        db,
      });
      setSelectedValue(valRes.output);
    } catch (error) {
      console.error("Failed to fetch value", error);
      setSelectedValue("Error fetching value");
    } finally {
      setValueLoading(false);
    }
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
    if (seconds === -1) return "No limit";
    if (seconds < 0) return "Expired";

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
      <div className="border-b p-2 flex justify-between items-center bg-muted/5 shrink-0 h-12">
        <div className="flex items-center gap-4 px-2">
          <h2 className="font-semibold text-sm">{name}</h2>
          <Badge
            variant="outline"
            className="text-xs font-normal bg-green-50 text-green-700 border-green-200"
          >
            Connected
          </Badge>
          <span className="text-xs text-muted-foreground">DB {db}</span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8"
            onClick={() => fetchKeys(true)}
            title="Refresh"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8"
            title="CLI"
          >
            <Terminal className="w-4 h-4" />
          </Button>
          <Button size="sm" className="h-8 gap-1 ml-2">
            <Plus className="w-4 h-4" /> Key
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Sidebar */}
          <ResizablePanel defaultSize={35} minSize={20} maxSize={50} className="flex flex-col border-r">
            {/* Filter */}
            <div className="p-2 border-b">
              <div className="relative">
                <Search
                  className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"
                />
                <Input
                  placeholder={t("redis.filterKeys") || "Filter by Key Name..."}
                  className="pl-8 h-9"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="flex justify-between items-center mt-2 px-1">
                <span className="text-xs text-muted-foreground">
                  Total: {keys.length}
                  {hasMore ? "+" : ""}
                </span>
              </div>
            </div>

            {/* Key List */}
            <ScrollArea className="flex-1">
              <div className="flex flex-col divide-y">
                {keys.map((key) => (
                  <div
                    key={key.key}
                    className={`flex items-center p-3 cursor-pointer hover:bg-accent/50 transition-colors gap-3 ${
                      selectedKey === key.key ? "bg-accent" : ""
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
                    <div className="flex flex-col items-end text-[10px] text-muted-foreground min-w-[60px]">
                      <span>{formatTTL(key.ttl)}</span>
                      <span>{formatSize(key.length)}</span>
                    </div>
                  </div>
                ))}
                {keys.length === 0 && !loading && (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No keys found
                  </div>
                )}

                {/* Sentinel for infinite scroll */}
                <div ref={observerTarget} className="h-px w-full" />

                {loading && (
                  <div className="p-4 text-center text-muted-foreground text-xs">
                    Loading...
                  </div>
                )}
              </div>
            </ScrollArea>
          </ResizablePanel>

          <ResizableHandle />

          {/* Right Content */}
          <ResizablePanel defaultSize={65}>
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
                      className="h-8 w-8"
                      title="Copy Key"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:text-destructive"
                      title="Delete Key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelectedKey(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Metadata Bar */}
                <div className="px-4 py-2 border-b bg-muted/10 flex gap-6 text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="font-medium">Size:</span>
                    <span>{formatSize(selectedKeyItem?.length)}</span>
                  </div>
                  <div className="flex gap-1">
                    <span className="font-medium">TTL:</span>
                    <span>{formatTTL(selectedKeyItem?.ttl)}</span>
                  </div>
                  <div className="flex gap-1">
                    <span className="font-medium">Type:</span>
                    <span className="uppercase">{selectedKeyItem?.type}</span>
                  </div>
                </div>

                {/* Value Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  {valueLoading ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      Loading value...
                    </div>
                  ) : (
                    <ScrollArea className="flex-1 p-4">
                      <ValueViewer
                        value={selectedValue}
                        type={selectedKeyItem?.type}
                      />
                    </ScrollArea>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <div className="bg-muted/50 p-4 rounded-full">
                  <Info className="w-8 h-8 opacity-50" />
                </div>
                <p>Select a key to view details</p>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function ValueViewer({ value, type }: { value: any; type?: string }) {
  if (value === null || value === undefined)
    return (
      <div className="text-muted-foreground italic">Null or Empty</div>
    );

  if (typeof value === "string") {
    try {
      const json = JSON.parse(value);
      // Simple check if json is object or array
      if (typeof json === "object" && json !== null) {
        return <JsonDisplay data={json} />;
      }
      return (
        <pre
          className="font-mono text-sm whitespace-pre-wrap break-all bg-muted/30 p-4 rounded border"
        >
          {value}
        </pre>
      );
    } catch {
      return (
        <pre
          className="font-mono text-sm whitespace-pre-wrap break-all bg-muted/30 p-4 rounded border"
        >
          {value}
        </pre>
      );
    }
  }

  if (Array.isArray(value)) {
    if (type === "hash") {
      // HGETALL returning array [k, v, k, v]
      const pairs = [];
      for (let i = 0; i < value.length; i += 2) {
        pairs.push({ field: value[i], value: value[i + 1] });
      }
      return (
        <div className="border rounded-md">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/30 font-medium uppercase border-b">
              <tr>
                <th className="px-4 py-2 w-1/3">Field</th>
                <th className="px-4 py-2">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pairs.map((p, i) => (
                <tr key={i} className="hover:bg-muted/10">
                  <td
                    className="px-4 py-2 font-mono text-muted-foreground align-top"
                  >
                    {String(p.field)}
                  </td>
                  <td className="px-4 py-2 font-mono align-top break-all">
                    {String(p.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (type === "zset") {
      // ZRANGE ... WITHSCORES returning array [member, score, member, score]
      const items = [];
      for (let i = 0; i < value.length; i += 2) {
        items.push({ member: value[i], score: value[i + 1] });
      }
      return (
        <div className="border rounded-md">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/30 font-medium uppercase border-b">
              <tr>
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2 w-32">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, i) => (
                <tr key={i} className="hover:bg-muted/10">
                  <td
                    className="px-4 py-2 font-mono text-muted-foreground align-top break-all"
                  >
                    {String(item.member)}
                  </td>
                  <td className="px-4 py-2 font-mono align-top">
                    {String(item.score)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="border rounded-md">
        <div className="bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
          {value.length} Items
        </div>
        <div className="divide-y">
          {value.map((item, i) => (
            <div
              key={i}
              className="p-3 text-sm font-mono hover:bg-muted/30 break-all"
            >
              {Array.isArray(item) ? item.join(" : ") : String(item)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (typeof value === "object") {
    return <JsonDisplay data={value} />;
  }

  return (
    <pre
      className="font-mono text-sm whitespace-pre-wrap break-all bg-muted/30 p-4 rounded border"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function JsonDisplay({ data }: { data: any }) {
  return (
    <pre
      className="font-mono text-sm whitespace-pre-wrap break-all bg-muted/30 p-4 rounded border text-green-600"
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
