import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { MysqlWorkspace } from "../workspace/MysqlWorkspace";
import { RedisWorkspace } from "../workspace/RedisWorkspace";
import { useAppStore } from "@/store/useAppStore";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

export function MainLayout() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const tabs = useAppStore((state) => state.tabs);
  
  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
      {/* Top Header Region (Titlebar) if needed, otherwise pure content */}
      
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="min-w-[200px]">
            <Sidebar />
          </ResizablePanel>
          
          <ResizableHandle />
          
          <ResizablePanel defaultSize={80}>
            <div className="h-full flex flex-col">
              <TabBar />
              <div className="flex-1 bg-white dark:bg-zinc-900 overflow-hidden relative">
                {activeTab ? (
                  activeTab.type === 'mysql' ? (
                    <MysqlWorkspace key={activeTab.id} name={activeTab.title} />
                  ) : (
                    <RedisWorkspace key={activeTab.id} name={activeTab.title} />
                  )
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <h3 className="text-lg font-medium mb-2">No Active Connection</h3>
                      <p className="text-sm">Select a connection from the sidebar to start.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
