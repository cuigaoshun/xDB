import { useAppStore, Connection } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import {
    Database,
    ChevronLeft,
    Home,
    Terminal
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { SettingsMenu } from "./SettingsMenu";
import { ConnectionTreeItem } from "./ConnectionTree";

interface ActivityBarProps {
    activeView: 'home' | 'connections' | 'settings';
    onViewChange: (view: 'home' | 'connections' | 'settings') => void;
    consoleVisible: boolean;
    onToggleConsole: () => void;
}

export function ActivityBar({ activeView, onViewChange, consoleVisible, onToggleConsole }: ActivityBarProps) {
    const { t } = useTranslation();

    return (
        <div className="w-12 bg-sidebar flex flex-col items-center py-4 text-sidebar-foreground z-20">
            <div className="flex flex-col gap-4 w-full items-center">
                <TooltipProvider delayDuration={0}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => onViewChange('home')}
                                className={cn(
                                    "p-2 rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                                    activeView === 'home' ? "bg-primary text-primary-foreground" : ""
                                )}
                            >
                                <Home className="h-5 w-5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-popover border-border text-popover-foreground">
                            <p>{t('menu.home')}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <TooltipProvider delayDuration={0}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => onViewChange('connections')}
                                className={cn(
                                    "p-2 rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                                    activeView === 'connections' ? "bg-primary text-primary-foreground" : ""
                                )}
                            >
                                <Database className="h-5 w-5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-popover border-border text-popover-foreground">
                            <p>{t('sidebar.connections')}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            <div className="mt-auto flex flex-col gap-4 w-full items-center">
                <TooltipProvider delayDuration={0}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={onToggleConsole}
                                className={cn(
                                    "p-2 rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                                    consoleVisible ? "bg-primary text-primary-foreground" : ""
                                )}
                            >
                                <Terminal className="h-5 w-5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-popover border-border text-popover-foreground">
                            <p>{t('common.toggleConsole')}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <SettingsMenu />
            </div>
        </div>
    );
}

import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";

// Sidebar List for Quick Connection Switching (Collapsible)
export function ConnectionSidebar({ collapsed, onToggle }: { collapsed: boolean, onToggle: () => void }) {
    const { connections, activeTabId, setActiveTab, addTab, replaceTab, tabs, setExpandedConnectionId } = useAppStore(
        useShallow((state) => ({
            connections: state.connections,
            activeTabId: state.activeTabId,
            setActiveTab: state.setActiveTab,
            addTab: state.addTab,
            replaceTab: state.replaceTab,
            tabs: state.tabs,
            setExpandedConnectionId: state.setExpandedConnectionId,
        }))
    );
    const { t } = useTranslation();

    const [searchTerm, setSearchTerm] = useState("");

    // If a connection is already open in a tab, switch to it. Otherwise just expand (don't create tab)
    const handleConnectionClick = (conn: Connection) => {
        const existingTab = tabs.find(t => t.connectionId === conn.id);
        if (existingTab) {
            setActiveTab(existingTab.id);
        } else {
            // 对于不支持树状展开的类型（如 Memcached, Postgres），直接打开 tab
            if (conn.db_type === 'memcached' || conn.db_type === 'postgres') {
                const tabId = `connection-${conn.id}`;
                addTab({
                    id: tabId,
                    title: conn.name,
                    type: conn.db_type,
                    connectionId: conn.id,
                });
            } else {
                // 不再自动创建tab，只展开数据库列表
                setExpandedConnectionId(conn.id);
            }
        }
    };

    const handleTableSelect = (conn: Connection, db: string, table: string) => {
        if (conn.db_type === 'redis') {
            const tabId = `redis-${conn.id}-${db}`;
            const existingTab = tabs.find(t => t.id === tabId);
            if (existingTab) {
                setActiveTab(existingTab.id);
                return;
            }

            // Check reuse for Redis
            const activeTab = tabs.find(t => t.id === activeTabId);
            const isReusable = activeTab && activeTab.type === 'redis';
            // For Redis, we don't have SQL to check modification. 
            // Maybe simple reuse is fine if we are just browsing?
            // Or should we always open new tab?
            // Let's reuse if it's a redis tab.

            const newTab = {
                id: tabId,
                title: `${conn.name} (DB ${db})`,
                type: conn.db_type,
                connectionId: conn.id,
                dbName: db, // Store Redis DB index in dbName
            };

            if (isReusable) {
                replaceTab(activeTab.id, newTab);
            } else {
                addTab(newTab);
            }
            return;
        }

        const tabId = `table-${conn.id}-${db}-${table}`;
        const existingTab = tabs.find(t => t.id === tabId);

        if (existingTab) {
            setActiveTab(existingTab.id);
            return;
        }

        // Check if we can reuse the current active tab
        const activeTab = tabs.find(t => t.id === activeTabId);

        // 检查当前SQL是否为默认模式
        const isDefaultSqlPattern = (sql: string | undefined) => {
            if (!sql) return true;
            // 移除空格和分号进行比较
            const cleanSql = sql.trim().replace(/;\s*$/, '').replace(/\s+/g, ' ');
            // 匹配默认SQL模式: SELECT * FROM `db`.`table` 或 SELECT * FROM "table"
            const mysqlPattern = /^SELECT \* FROM `[^`]+`\.`[^`]+`$/i;
            const sqlitePattern = /^SELECT \* FROM "[^"]+"$/i;
            const genericPattern = /^SELECT \* FROM [^\s]+$/i;
            return mysqlPattern.test(cleanSql) || sqlitePattern.test(cleanSql) || genericPattern.test(cleanSql);
        };

        const isReusable = activeTab &&
            (activeTab.type === 'mysql' || activeTab.type === 'sqlite') &&
            (!activeTab.currentSql ||
                activeTab.currentSql === activeTab.initialSql ||
                isDefaultSqlPattern(activeTab.currentSql));

        const newTab = {
            id: tabId,
            title: table,
            type: conn.db_type,
            connectionId: conn.id,
            initialSql: conn.db_type === 'sqlite'
                ? `SELECT * FROM "${table}" LIMIT 100;`
                : `SELECT * FROM \`${db}\`.\`${table}\` LIMIT 100;`,
            dbName: db,
            tableName: table
        };

        if (isReusable) {
            replaceTab(activeTab.id, newTab);
        } else {
            addTab(newTab);
        }
    };

    if (collapsed) {
        return null;
    }

    return (
        <div className="w-full h-full bg-background flex flex-col text-foreground">
            <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm uppercase tracking-wider">{t('sidebar.explorer')}</span>
                    <button onClick={onToggle} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                </div>
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
                    <Input
                        placeholder={t('common.searchExplorer')}
                        className="h-8 pl-7 pr-7 text-xs bg-background"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                            onClick={() => setSearchTerm("")}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {connections.filter(c => !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase()) || searchTerm).map((conn) => (
                    <ConnectionTreeItem
                        key={conn.id}
                        connection={conn}
                        isActive={!!tabs.find(t => t.connectionId === conn.id && t.id === activeTabId)}
                        onSelect={handleConnectionClick}
                        onSelectTable={handleTableSelect}
                        filterTerm={searchTerm}
                    />
                ))}
            </div>
        </div>
    );
}
