import { useAppStore } from "@/store/useAppStore";
import { X, Database, Server } from "lucide-react";
import { cn } from "@/lib/utils";

export function TabBar() {
  const tabs = useAppStore((state) => state.tabs);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);

  return (
    <div className="flex items-center border-b bg-muted/5 w-full overflow-x-auto no-scrollbar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            "group flex items-center gap-2 px-4 py-2.5 border-r min-w-[150px] max-w-[200px] text-sm cursor-pointer select-none transition-colors",
            tab.id === activeTabId
              ? "bg-background border-b-transparent font-medium text-primary"
              : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
          )}
        >
          {tab.type === 'mysql' ? (
            <Database className="h-3.5 w-3.5 text-blue-500/70" />
          ) : (
            <Server className="h-3.5 w-3.5 text-red-500/70" />
          )}
          
          <span className="truncate flex-1">{tab.title}</span>
          
          <div
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className={cn(
              "opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-destructive/10 hover:text-destructive transition-all",
              tab.id === activeTabId && "opacity-100" // active tab always shows close button or on hover? let's keep it clean
            )}
          >
            <X className="h-3.5 w-3.5" />
          </div>
        </div>
      ))}
      {tabs.length === 0 && (
        <div className="px-4 py-2.5 text-sm text-muted-foreground italic select-none">
          No active tabs
        </div>
      )}
    </div>
  );
}
