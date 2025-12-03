import { Search, Terminal, RefreshCw, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

interface RedisResult {
    output: any;
}

interface ScanResult {
    cursor: string;
    keys: string[];
}

interface KeyDetail {
    type: string;
    ttl: number;
    value: any;
}

export function RedisWorkspace({ name, connectionId }: { name: string; connectionId: number }) {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState<string>("0");
  const [hasMore, setHasMore] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyDetails, setKeyDetails] = useState<KeyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const fetchKeys = async (reset = false) => {
    if (loading && !reset) return; // Allow reset even if loading (maybe cancel prev? but for now just ignore)
    // Actually if loading, we should probably wait.
    // But simplistic check:
    if (loading) return;
    
    if (!reset && !hasMore) return;

    setLoading(true);
    const currentCursor = reset ? "0" : cursor;
    const searchPattern = filter ? `*${filter}*` : "*";

    try {
      console.log("Fetching keys with cursor:", currentCursor);
      const result = await invoke<ScanResult>("get_redis_keys", {
          connectionId: connectionId,
          cursor: currentCursor,
          count: 100,
          pattern: searchPattern
      });
      console.log("Fetch result:", result);
      
      if (reset) {
          setKeys(result.keys);
      } else {
          setKeys(prev => [...prev, ...result.keys]);
      }
      
      setCursor(result.cursor);
      setHasMore(result.cursor !== "0");
    } catch (e) {
        console.error("Failed to fetch keys", e);
    } finally {
        setLoading(false);
    }
  };

  // Reset and fetch when connection changes
  useEffect(() => {
      setKeys([]);
      setCursor("0");
      setHasMore(true);
      setFilter(""); 
      // Use a timeout to allow state updates to settle? 
      // Or just call fetchKeys(true) which uses 0 anyway.
      // We need to pass the function to the effect, or define it inside.
      // To avoid stale closures, we can use a ref for the fetch function or just rely on dependency array.
      // But here we want to trigger fetchKeys(true).
      fetchKeys(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  // Debounce filter change
  useEffect(() => {
      const timer = setTimeout(() => {
          fetchKeys(true);
      }, 300);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
      // Threshold 50px
      if (scrollHeight - scrollTop <= clientHeight + 50) {
          if (!loading && hasMore) {
              fetchKeys(false);
          }
      }
  };

  const handleKeyClick = async (key: string) => {
      setSelectedKey(key);
      setDetailsLoading(true);
      setKeyDetails(null);
      
      try {
          // 1. Get Type
          const typeRes = await invoke<RedisResult>("execute_redis_command", {
              connectionId, command: "TYPE", args: [key]
          });
          const type = typeRes.output as string;

          // 2. Get TTL
          const ttlRes = await invoke<RedisResult>("execute_redis_command", {
              connectionId, command: "TTL", args: [key]
          });
          const ttl = ttlRes.output as number;

          // 3. Get Value based on type
          let value: any = null;
          if (type === 'string') {
              const valRes = await invoke<RedisResult>("execute_redis_command", {
                  connectionId, command: "GET", args: [key]
              });
              value = valRes.output;
          } else if (type === 'hash') {
              const valRes = await invoke<RedisResult>("execute_redis_command", {
                  connectionId, command: "HGETALL", args: [key]
              });
              value = valRes.output;
          } else if (type === 'list') {
               const valRes = await invoke<RedisResult>("execute_redis_command", {
                  connectionId, command: "LRANGE", args: [key, "0", "-1"]
              });
              value = valRes.output;
          } else if (type === 'set') {
               const valRes = await invoke<RedisResult>("execute_redis_command", {
                  connectionId, command: "SMEMBERS", args: [key]
              });
              value = valRes.output;
          } else if (type === 'zset') {
               const valRes = await invoke<RedisResult>("execute_redis_command", {
                  connectionId, command: "ZRANGE", args: [key, "0", "-1", "WITHSCORES"]
              });
              value = valRes.output;
          }

          setKeyDetails({ type, ttl, value });

      } catch (error) {
          console.error("Failed to fetch details", error);
      } finally {
          setDetailsLoading(false);
      }
  };

  return (
    <div className="h-full flex flex-col">
       {/* Header */}
       <div className="border-b p-3 flex justify-between items-center bg-muted/5">
        <div className="flex items-center gap-4">
            <h2 className="font-semibold text-sm">{name}</h2>
            <div className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{t('redis.connected') || "Connected"}</div>
        </div>
        <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => fetchKeys(true)} title="Refresh">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" title="CLI"><Terminal className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
         {/* Filter */}
         <div className="p-3 border-b flex gap-2">
           <div className="relative flex-1 max-w-md">
             <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
             <Input 
                placeholder={t('redis.filterKeys') || "Filter keys..."} 
                className="pl-8 h-9" 
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
             />
           </div>
           <Button className="gap-1">
               <Plus className="w-4 h-4" /> {t('redis.addKey') || "Key"}
           </Button>
         </div>

         {/* List */}
         <div className="flex-1 overflow-auto" onScroll={handleScroll}>
             <table className="w-full text-sm text-left">
                 <thead className="text-xs text-muted-foreground bg-muted/10 font-medium uppercase border-b sticky top-0 bg-background">
                     <tr>
                         <th className="px-4 py-2">{t('redis.key') || "Key"}</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y">
                     {keys.map(key => (
                         <tr 
                            key={key} 
                            className={`hover:bg-accent/50 cursor-pointer ${selectedKey === key ? 'bg-accent' : ''}`}
                            onClick={() => handleKeyClick(key)}
                        >
                             <td className="px-4 py-2 font-mono text-sm">{key}</td>
                         </tr>
                     ))}
                     {keys.length === 0 && (
                         <tr><td className="p-4 text-center text-muted-foreground">
                             {loading ? "Loading..." : "No keys found"}
                         </td></tr>
                     )}
                 </tbody>
             </table>
         </div>
      </div>

      {/* Details Sheet */}
      <Sheet open={!!selectedKey} onOpenChange={(open) => !open && setSelectedKey(null)}>
          <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
              <SheetHeader>
                  <SheetTitle className="font-mono break-all">{selectedKey}</SheetTitle>
                  <SheetDescription>
                      {detailsLoading ? "Loading..." : (
                          <div className="flex gap-2 mt-2">
                              <Badge variant="outline">{keyDetails?.type?.toUpperCase()}</Badge>
                              <Badge variant="secondary">TTL: {keyDetails?.ttl}</Badge>
                          </div>
                      )}
                  </SheetDescription>
              </SheetHeader>
              
              <div className="mt-6">
                  {detailsLoading ? (
                      <div className="text-center text-muted-foreground">Loading value...</div>
                  ) : (
                      <div className="space-y-4">
                          <h3 className="text-sm font-medium text-muted-foreground">Value</h3>
                          <div className="bg-muted p-4 rounded-md overflow-auto max-h-[600px]">
                              <pre className="text-xs font-mono whitespace-pre-wrap">
                                  {JSON.stringify(keyDetails?.value, null, 2)}
                              </pre>
                          </div>
                      </div>
                  )}
              </div>
          </SheetContent>
      </Sheet>
    </div>
  );
}

