import { TabBar } from "./TabBar";
import { MysqlWorkspace } from "../workspace/MysqlWorkspace";
import { RedisWorkspace } from "../workspace/RedisWorkspace";
import { ConnectionManager } from "../workspace/ConnectionManager";
import { useAppStore } from "@/store/useAppStore";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ActivityBar, ConnectionSidebar } from "./ActivityBar";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export function MainLayout() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const tabs = useAppStore((state) => state.tabs);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  
  // View state: 'home' (Connection Manager) or 'connections' (Workspaces)
  const [activeView, setActiveView] = useState<'home' | 'connections'>('home');
  
  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Auto-switch to 'connections' view when a tab is activated
  useEffect(() => {
      if (activeTabId) {
          setActiveView('connections');
      }
  }, [activeTabId]);

  const handleViewChange = (view: 'home' | 'connections') => {
      setActiveView(view);
      // Optional: if switching to home, maybe clear active tab or just hide it?
      // For now, we keep active tab state but just show home screen.
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex">
       {/* 1. Activity Bar (Leftmost, slim) */}
       <ActivityBar activeView={activeView} onViewChange={handleViewChange} />

       {/* 2. Main Content Area */}
       <div className="flex-1 flex overflow-hidden">
            {activeView === 'home' ? (
                <div className="flex-1">
                     <ConnectionManager />
                </div>
            ) : (
                <ResizablePanelGroup direction="horizontal">
                    <ResizablePanel 
                        defaultSize={20} 
                        minSize={15} 
                        maxSize={30} 
                        className={cn(
                            "min-w-[200px] transition-all duration-300 ease-in-out",
                            sidebarCollapsed && "min-w-0 max-w-0 w-0 border-0"
                        )}
                        collapsible={true}
                        onCollapse={() => setSidebarCollapsed(true)}
                        onExpand={() => setSidebarCollapsed(false)}
                    >
                        <ConnectionSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
                    </ResizablePanel>
                    
                    {!sidebarCollapsed && <ResizableHandle />}
                    
                    <ResizablePanel defaultSize={80}>
                        <div className="h-full flex flex-col bg-background">
                            <TabBar />
                            <div className="flex-1 overflow-hidden relative">
                                {activeTab ? (
                                    activeTab.type === 'mysql' ? (
                                        <MysqlWorkspace key={activeTab.id} name={activeTab.title} />
                                    ) : (
                                        <RedisWorkspace key={activeTab.id} name={activeTab.title} />
                                    )
                                ) : (
                                    <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/5">
                                        <div className="text-center">
                                            <p>Select a tab or go Home to connect.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </ResizablePanel>
                </ResizablePanelGroup>
            )}
       </div>
    </div>
  );
}
