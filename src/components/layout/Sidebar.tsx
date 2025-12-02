import { cn } from "@/lib/utils";
import { useAppStore, Connection } from "@/store/useAppStore";
import { Database, Server } from "lucide-react";

export function Sidebar() {
  const connections = useAppStore((state) => state.connections);
  const addTab = useAppStore((state) => state.addTab);

  const handleConnectionClick = (conn: Connection) => {
    // 简单的逻辑：点击连接即打开一个“连接概览”或“工作台” Tab
    addTab({
      id: `conn-${conn.id}`,
      title: conn.name,
      type: conn.type,
      connectionId: conn.id,
    });
  };

  return (
    <div className="h-full flex flex-col bg-muted/10">
      <div className="p-4 font-semibold text-sm text-muted-foreground uppercase tracking-wider">
        Connections
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {connections.map((conn) => (
          <div
            key={conn.id}
            onClick={() => handleConnectionClick(conn)}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors mb-1",
              "text-sm font-medium"
            )}
          >
            {conn.type === 'mysql' ? (
              <Database className="h-4 w-4 text-blue-500" />
            ) : (
              <Server className="h-4 w-4 text-red-500" />
            )}
            <span>{conn.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
