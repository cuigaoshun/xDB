import { useAppStore } from "@/store/useAppStore";
import { X, Database, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useTranslation } from "react-i18next";

export function TabBar() {
  const { t } = useTranslation();
  const tabs = useAppStore((state) => state.tabs);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const closeOtherTabs = useAppStore((state) => state.closeOtherTabs);
  const closeTabsToRight = useAppStore((state) => state.closeTabsToRight);
  const closeTabsToLeft = useAppStore((state) => state.closeTabsToLeft);
  const closeAllTabs = useAppStore((state) => state.closeAllTabs);

  return (
    <div className="flex items-center border-b bg-muted/5 w-full overflow-x-auto no-scrollbar">
      {tabs.map((tab) => (
        <ContextMenu key={tab.id}>
            <ContextMenuTrigger>
                <div
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
                      tab.id === activeTabId && "opacity-100"
                    )}
                  >
                    <X className="h-3.5 w-3.5" />
                  </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => closeTab(tab.id)}>
                    {t('common.close')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => closeOtherTabs(tab.id)}>
                    {t('common.closeOthers')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => closeTabsToRight(tab.id)}>
                    {t('common.closeRight')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => closeTabsToLeft(tab.id)}>
                    {t('common.closeLeft')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => closeAllTabs()}>
                    {t('common.closeAll')}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
      ))}
      {tabs.length === 0 && (
        <div className="px-4 py-2.5 text-sm text-muted-foreground italic select-none">
          No active tabs
        </div>
      )}
    </div>
  );
}
