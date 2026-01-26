import { TabBar } from "./TabBar";
import { MysqlWorkspace } from "../workspace/mysql/MysqlWorkspace.tsx";
import { RedisWorkspace } from "../workspace/redis/RedisWorkspace.tsx";
import { MemcachedWorkspace } from "../workspace/memcached/MemcachedWorkspace.tsx";
import { SqliteWorkspace } from "../workspace/sqllite/SqliteWorkspace.tsx";
import { TableSchemaTab } from "../workspace/mysql/TableSchemaTab.tsx";
import { DatabaseTablesTab } from "../workspace/mysql/DatabaseTablesTab.tsx";
import { ConnectionManager } from "../workspace/ConnectionManager";
import { SettingsPage } from "../settings/SettingsPage";
import { useAppStore } from "@/store/useAppStore";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ActivityBar, ConnectionSidebar } from "./ActivityBar";
import { CommandConsole } from "@/components/ui/CommandConsole";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function MainLayout() {
    const { t } = useTranslation();
    const activeTabId = useAppStore((state) => state.activeTabId);
    const tabs = useAppStore((state) => state.tabs);
    const activeView = useAppStore((state) => state.activeView);
    const setActiveView = useAppStore((state) => state.setActiveView);

    const activeTab = tabs.find(t => t.id === activeTabId);

    // Sidebar collapse state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Command console visibility state
    const [consoleVisible, setConsoleVisible] = useState(false);

    const handleViewChange = (view: 'home' | 'connections' | 'settings') => {
        if (view === activeView && view === 'connections') {
            setSidebarCollapsed(!sidebarCollapsed);
        } else {
            setActiveView(view);
            if (view === 'connections') {
                setSidebarCollapsed(false);
            }
        }
    };

    return (
        <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
            <div className="flex-1 flex overflow-hidden">
                {/* 1. Activity Bar (Leftmost, slim) */}
                <ActivityBar
                    activeView={activeView}
                    onViewChange={handleViewChange}
                    consoleVisible={consoleVisible}
                    onToggleConsole={() => setConsoleVisible(!consoleVisible)}
                />

                {/* 2. Main Content Area */}
                <div className="flex-1 flex overflow-hidden">
                    {activeView === 'home' ? (
                        <div className="flex-1 overflow-hidden">
                            <ResizablePanelGroup direction="vertical">
                                <ResizablePanel defaultSize={consoleVisible ? 70 : 100}>
                                    <ConnectionManager />
                                </ResizablePanel>
                                {consoleVisible && (
                                    <>
                                        <ResizableHandle />
                                        <ResizablePanel defaultSize={30} minSize={10} maxSize={50}>
                                            <CommandConsole />
                                        </ResizablePanel>
                                    </>
                                )}
                            </ResizablePanelGroup>
                        </div>
                    ) : activeView === 'settings' ? (
                        <div className="flex-1 overflow-hidden">
                            <ResizablePanelGroup direction="vertical">
                                <ResizablePanel defaultSize={consoleVisible ? 70 : 100}>
                                    <SettingsPage />
                                </ResizablePanel>
                                {consoleVisible && (
                                    <>
                                        <ResizableHandle />
                                        <ResizablePanel defaultSize={30} minSize={10} maxSize={50}>
                                            <CommandConsole />
                                        </ResizablePanel>
                                    </>
                                )}
                            </ResizablePanelGroup>
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
                                <ResizablePanelGroup direction="vertical">
                                    <ResizablePanel defaultSize={consoleVisible ? 70 : 100}>
                                        <div className="h-full flex flex-col bg-background">
                                            <TabBar />
                                            <div className="flex-1 overflow-hidden relative">
                                                {activeTab ? (
                                                    activeTab.tabType === 'table-schema' && activeTab.schemaInfo ? (
                                                        <TableSchemaTab
                                                            key={activeTab.id}
                                                            tabId={activeTab.id}
                                                            connectionId={activeTab.connectionId}
                                                            dbName={activeTab.schemaInfo.dbName}
                                                            tableName={activeTab.schemaInfo.tableName}
                                                        />
                                                    ) : activeTab.tabType === 'database-tables' && activeTab.databaseTablesInfo ? (
                                                        <DatabaseTablesTab
                                                            key={activeTab.id}
                                                            tabId={activeTab.id}
                                                            connectionId={activeTab.connectionId}
                                                            dbName={activeTab.databaseTablesInfo.dbName}
                                                            dbType={activeTab.type}
                                                        />
                                                    ) : activeTab.type === 'mysql' ? (
                                                        <MysqlWorkspace
                                                            key={activeTab.id}
                                                            tabId={activeTab.id}
                                                            name={activeTab.title}
                                                            connectionId={activeTab.connectionId}
                                                            initialSql={activeTab.initialSql}
                                                            savedSql={activeTab.currentSql}
                                                            dbName={activeTab.dbName}
                                                            tableName={activeTab.tableName}
                                                            savedResult={activeTab.savedResult}
                                                        />
                                                    ) : activeTab.type === 'redis' ? (
                                                        <RedisWorkspace
                                                            key={activeTab.id}
                                                            tabId={activeTab.id}
                                                            name={activeTab.title}
                                                            connectionId={activeTab.connectionId}
                                                            db={activeTab.redisDbInfo?.db ?? (activeTab.dbName ? parseInt(activeTab.dbName) : 0)}
                                                            savedResult={activeTab.savedResult}
                                                        />
                                                    ) : activeTab.type === 'memcached' ? (
                                                        <MemcachedWorkspace
                                                            key={activeTab.id}
                                                            tabId={activeTab.id}
                                                            name={activeTab.title}
                                                            connectionId={activeTab.connectionId}
                                                            savedResult={activeTab.savedResult}
                                                        />
                                                    ) : activeTab.type === 'sqlite' ? (
                                                        <SqliteWorkspace
                                                            key={activeTab.id}
                                                            tabId={activeTab.id}
                                                            name={activeTab.title}
                                                            connectionId={activeTab.connectionId}
                                                            initialSql={activeTab.initialSql}
                                                            savedSql={activeTab.currentSql}
                                                            dbName={activeTab.dbName}
                                                            tableName={activeTab.tableName}
                                                            savedResult={activeTab.savedResult}
                                                        />

                                                    ) : (
                                                        <div>{t('common.unsupportedType')}: {activeTab.type}</div>
                                                    )
                                                ) : (
                                                    <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/5">
                                                        <div className="text-center">
                                                            <p>{t('common.selectTab')}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </ResizablePanel>

                                    {consoleVisible && (
                                        <>
                                            <ResizableHandle />
                                            <ResizablePanel defaultSize={30} minSize={10} maxSize={50}>
                                                <CommandConsole />
                                            </ResizablePanel>
                                        </>
                                    )}
                                </ResizablePanelGroup>
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    )}
                </div>
            </div>
        </div>
    );
}
