import { useAppStore, Tab } from "@/store/useAppStore";
import { X, Database, Server, ChevronLeft, ChevronRight, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import { useTranslation } from "react-i18next";
import { useRef, useState, useEffect, useMemo } from "react";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";

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
  const connections = useAppStore((state) => state.connections);
  const connectionGroups = useAppStore((state) => state.connectionGroups);

  // Add shortcut for closing active tab (Ctrl+W / Cmd+W)
  useKeyboardShortcut('w', () => {
    if (activeTabId) {
      closeTab(activeTabId);
    }
  }, { mod: true, enabled: !!activeTabId });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // 创建 Tab 颜色映射，根据连接的分组颜色
  const tabColorMap = useMemo(() => {
    const map = new Map<string, string>();
    tabs.forEach(tab => {
      const connection = connections.find(c => c.id === tab.connectionId);
      if (connection?.group_id) {
        const group = connectionGroups.find(g => g.id === connection.group_id);
        if (group) {
          map.set(tab.id, group.color);
        }
      }
    });
    return map;
  }, [tabs, connections, connectionGroups]);

  const checkScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setShowLeftArrow(scrollLeft > 0);
    // Allow small error margin
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const check = () => checkScroll();

    // Initial check
    check();

    // Resize observer for container size changes
    const observer = new ResizeObserver(() => {
      check();
    });
    observer.observe(el);

    // Scroll listener
    el.addEventListener('scroll', check);

    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', check);
    };
  }, [tabs]);

  // Update scroll buttons when active tab changes
  useEffect(() => {
    checkScroll();

    // Auto-scroll to active tab if it's out of view
    // This is a common UX expectation
    if (activeTabId && scrollContainerRef.current) {
      // We defer this slightly to ensure rendering is complete
      setTimeout(() => {
        if (!scrollContainerRef.current) return;
        // No easy way to find the specific tab DOM element without refs map,
        // but we can trust the user will scroll if needed, or implement refs map later.
        // For now, checks are enough.
        checkScroll();
      }, 100);
    }
  }, [activeTabId]);


  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const getTabTitle = (tab: Tab) => {
    // 1. 优先显示表名
    const tableName = tab.tableName || tab.schemaInfo?.tableName;
    if (tableName) return tableName;

    // 2. Redis 显示库名 (DB0, DB1...)
    if (tab.type === 'redis') {
      if (tab.redisDbInfo?.db !== undefined) return `DB${tab.redisDbInfo.db}`;
      if (tab.dbName) return tab.dbName;
    }

    // 3. MySQL 显示库名 (如果不是表相关操作)
    if (tab.type === 'mysql' && tab.dbName) {
      return tab.dbName;
    }

    return tab.title;
  };

  return (
    <div className="flex items-stretch w-full bg-muted/30 border-b border-border/40 select-none overflow-hidden h-10">
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          className="px-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border-r border-border/40 flex-shrink-0 flex items-center justify-center bg-muted/30 z-10"
          title={t('common.scrollLeft', 'Scroll Left')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center overflow-x-auto no-scrollbar scroll-smooth h-full"
      >
        {tabs.map((tab) => {
          const tabColor = tabColorMap.get(tab.id) || 'hsl(var(--primary))';
          const isActive = tab.id === activeTabId;
          
          return (
          <ContextMenu key={tab.id}>
            <ContextMenuTrigger asChild>
              <div
                onClick={() => setActiveTab(tab.id)}
                style={{
                  borderTopColor: isActive ? tabColor : 'transparent',
                }}
                className={cn(
                  "group flex-1 flex items-center gap-2 px-3 h-full min-w-[100px] max-w-[200px] text-sm cursor-pointer transition-colors border-r border-border/20 last:border-r-0 relative",
                  isActive
                    ? "bg-background font-medium text-foreground border-t-2 border-b border-b-transparent"
                    : "bg-muted/20 text-muted-foreground hover:bg-muted/40 border-t-2 border-t-transparent border-b border-border/40"
                )}
              >
                {tab.type === 'mysql' ? (
                  <Database className="h-3.5 w-3.5 text-blue-500/70 shrink-0" />
                ) : tab.type === 'sqlite' ? (
                  <FileCode className="h-3.5 w-3.5 text-green-500/70 shrink-0" />
                ) : (
                  <Server className="h-3.5 w-3.5 text-red-500/70 shrink-0" />
                )}

                <span className="truncate flex-1">{getTabTitle(tab)}</span>

                <div
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={cn(
                    "absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-destructive/10 hover:text-destructive transition-all z-10",
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
                <ContextMenuShortcut>{/Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? '⌘W' : 'Ctrl+W'}</ContextMenuShortcut>
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
          );
        })}
        {tabs.length === 0 && (
          <div className="px-4 flex items-center h-full text-sm text-muted-foreground italic">
            {t('common.noActiveTabs')}
          </div>
        )}
      </div>

      {showRightArrow && (
        <button
          onClick={() => scroll('right')}
          className="px-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border-l border-border/40 flex-shrink-0 flex items-center justify-center bg-muted/30 z-10"
          title={t('common.scrollRight', 'Scroll Right')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
