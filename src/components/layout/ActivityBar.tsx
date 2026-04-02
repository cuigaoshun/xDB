import { useAppStore, Connection, ConnectionGroup } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import {
    Database,
    ChevronLeft,
    ChevronRight,
    Home,
    Terminal,
    History,
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
import { X, Square, CheckSquare } from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "@/store/useSettingsStore";

// Sidebar List for Quick Connection Switching (Collapsible)
export function ConnectionSidebar({ collapsed, onToggle }: { collapsed: boolean, onToggle: () => void }) {
    const { connections, connectionGroups, activeTabId, setActiveTab, addTab, replaceTab, tabs, setExpandedConnectionId, expandedConnectionId } = useAppStore(
        useShallow((state) => ({
            connections: state.connections,
            connectionGroups: state.connectionGroups,
            activeTabId: state.activeTabId,
            setActiveTab: state.setActiveTab,
            addTab: state.addTab,
            replaceTab: state.replaceTab,
            tabs: state.tabs,
            setExpandedConnectionId: state.setExpandedConnectionId,
            expandedConnectionId: state.expandedConnectionId,
        }))
    );
    const { t } = useTranslation();
    const explorerSearchHistory = useSettingsStore((state) => state.explorerSearchHistory);
    const addExplorerSearchHistory = useSettingsStore((state) => state.addExplorerSearchHistory);
    const clearExplorerSearchHistory = useSettingsStore((state) => state.clearExplorerSearchHistory);

    const [searchTerm, setSearchTerm] = useState("");
    const [isExactMatch, setIsExactMatch] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(-1);
    const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    const suggestedHistory = useMemo(() => {
        const normalizedSearchTerm = searchTerm.trim().toLowerCase();
        if (!normalizedSearchTerm) return [];

        return explorerSearchHistory
            .filter((item) => item.toLowerCase().startsWith(normalizedSearchTerm))
            .slice(0, 10);
    }, [explorerSearchHistory, searchTerm]);

    const visibleHistory = useMemo(
        () => (showHistoryDropdown ? explorerSearchHistory.slice(0, 10) : suggestedHistory),
        [explorerSearchHistory, showHistoryDropdown, suggestedHistory],
    );

    const commitSearchHistory = useCallback(
        (keyword: string) => {
            const trimmedKeyword = keyword.trim();
            if (!trimmedKeyword) return;
            addExplorerSearchHistory(trimmedKeyword);
        },
        [addExplorerSearchHistory],
    );

    const applySearchTerm = useCallback(
        (keyword: string, options?: { closeDropdown?: boolean; focusInput?: boolean; commit?: boolean }) => {
            const trimmedKeyword = keyword.trim();
            setSearchTerm(trimmedKeyword || keyword);

            if (options?.commit !== false && trimmedKeyword) {
                commitSearchHistory(trimmedKeyword);
            }

            if (options?.closeDropdown !== false) {
                setShowHistoryDropdown(false);
                setSelectedHistoryIndex(-1);
            }

            setIsInputFocused(options?.focusInput ?? false);
        },
        [commitSearchHistory],
    );

    const commitCurrentSearchTerm = useCallback(() => {
        commitSearchHistory(searchTerm);
    }, [commitSearchHistory, searchTerm]);

    useEffect(() => {
        setSelectedHistoryIndex(-1);
    }, [visibleHistory]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setShowHistoryDropdown(false);
                setIsInputFocused(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (expandedConnectionId) {
            const conn = connections.find(c => c.id === expandedConnectionId);
            if (conn && conn.group_id) {
                setExpandedGroups(prev => {
                    if (!prev.has(conn.group_id!)) {
                        const newSet = new Set(prev);
                        newSet.add(conn.group_id!);
                        return newSet;
                    }
                    return prev;
                });
            }
        }
    }, [expandedConnectionId, connections]);

    // 构建树节点：分组和连接混合排序
    const buildTreeNodes = () => {
        type TreeNode = 
            | { type: 'group'; group: ConnectionGroup; connections: Connection[] }
            | { type: 'connection'; connection: Connection };

        const nodes: TreeNode[] = [];
        const ungroupedConnections: Connection[] = [];

        // 分离有分组和无分组的连接
        connections.forEach(conn => {
            if (conn.group_id) {
                // 已分组的连接稍后处理
            } else {
                ungroupedConnections.push(conn);
            }
        });

        // 添加分组节点
        connectionGroups.forEach(group => {
            const groupConnections = connections.filter(c => c.group_id === group.id);
            if (groupConnections.length > 0 || !searchTerm) {
                nodes.push({
                    type: 'group',
                    group,
                    connections: groupConnections
                });
            }
        });

        // 添加无分组连接
        ungroupedConnections.forEach(conn => {
            nodes.push({
                type: 'connection',
                connection: conn
            });
        });

        // 按 sort_order 排序
        nodes.sort((a, b) => {
            const orderA = a.type === 'group' ? a.group.sort_order : a.connection.sort_order || 0;
            const orderB = b.type === 'group' ? b.group.sort_order : b.connection.sort_order || 0;
            return orderA - orderB;
        });

        return nodes;
    };

    const treeNodes = buildTreeNodes();

    const toggleGroup = (groupId: number) => {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupId)) {
                newSet.delete(groupId);
            } else {
                newSet.add(groupId);
            }
            return newSet;
        });
    };

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

        const tabId = `query-${conn.id}-${db}-${table}`;
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
            conn.db_type !== 'mysql' && // Disable reuse for MySQL as per user request
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
                ? `SELECT * FROM "${table}" LIMIT 20;`
                : `SELECT * FROM \`${db}\`.\`${table}\` LIMIT 20;`,
            dbName: db,
            tableName: table
        };

        if (isReusable) {
            replaceTab(activeTab.id, newTab);
        } else {
            addTab(newTab);
        }
    };

    return (
        <div className={cn("w-full h-full bg-background flex flex-col text-foreground", collapsed && "hidden")}>
            <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm uppercase tracking-wider">{t('sidebar.explorer')}</span>
                    <button onClick={onToggle} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                </div>
                <div className="relative" ref={searchContainerRef}>
                    <button
                        className={cn(
                            "absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent z-10 transition-colors",
                            isExactMatch && "text-primary hover:text-primary bg-primary/10 hover:bg-primary/20"
                        )}
                        onClick={() => setIsExactMatch(!isExactMatch)}
                        title={t('common.exactMatch', '精确匹配')}
                    >
                        {isExactMatch ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                    </button>
                    <Input
                        placeholder={t('common.searchExplorer')}
                        className="h-8 pl-8 pr-12 text-xs bg-background"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setIsInputFocused(true);
                            setShowHistoryDropdown(false);
                        }}
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={() => {
                            setTimeout(() => setIsInputFocused(false), 200);
                        }}
                        onKeyDown={(e) => {
                            const isDropdownOpen = showHistoryDropdown || (isInputFocused && suggestedHistory.length > 0);

                            if (isDropdownOpen && visibleHistory.length > 0) {
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setSelectedHistoryIndex((prev) => (prev < visibleHistory.length - 1 ? prev + 1 : prev));
                                    return;
                                }

                                if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setSelectedHistoryIndex((prev) => (prev > -1 ? prev - 1 : -1));
                                    return;
                                }

                                if (e.key === 'Enter' && selectedHistoryIndex >= 0) {
                                    e.preventDefault();
                                    applySearchTerm(visibleHistory[selectedHistoryIndex]);
                                    return;
                                }
                            }

                            if (e.key === 'Enter') {
                                applySearchTerm(searchTerm);
                                return;
                            }

                            if (e.key === 'Escape') {
                                setShowHistoryDropdown(false);
                                setSelectedHistoryIndex(-1);
                                setIsInputFocused(false);
                            }
                        }}
                    />
                    <button
                        className={cn(
                            "absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10",
                            showHistoryDropdown && "text-primary"
                        )}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                            setShowHistoryDropdown((prev) => !prev);
                            setIsInputFocused(true);
                        }}
                        title={t('common.searchHistory')}
                    >
                        <History className="h-3.5 w-3.5" />
                    </button>
                    {searchTerm && (
                        <button
                            className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                setSearchTerm("");
                                setShowHistoryDropdown(false);
                                setSelectedHistoryIndex(-1);
                            }}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                    {(showHistoryDropdown || (isInputFocused && suggestedHistory.length > 0)) && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-popover text-popover-foreground border rounded-md shadow-md z-50 py-1 max-h-[300px] overflow-auto">
                            {showHistoryDropdown ? (
                                visibleHistory.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-muted-foreground">{t('common.noSearchHistory')}</div>
                                ) : (
                                    <>
                                        {visibleHistory.map((item, index) => (
                                            <div
                                                key={`${item}-${index}`}
                                                className={cn(
                                                    "px-3 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground",
                                                    index === selectedHistoryIndex && "bg-accent text-accent-foreground",
                                                )}
                                                onMouseEnter={() => setSelectedHistoryIndex(index)}
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => applySearchTerm(item)}
                                            >
                                                <span className="block truncate">{item}</span>
                                            </div>
                                        ))}
                                        <div className="h-px bg-border my-1" />
                                        <div
                                            className="px-3 py-1.5 text-xs cursor-pointer text-destructive hover:bg-accent"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                clearExplorerSearchHistory();
                                                setShowHistoryDropdown(false);
                                                setSelectedHistoryIndex(-1);
                                            }}
                                        >
                                            {t('common.clearHistory')}
                                        </div>
                                    </>
                                )
                            ) : (
                                visibleHistory.map((item, index) => (
                                    <div
                                        key={`${item}-${index}`}
                                        className={cn(
                                            "px-3 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground",
                                            index === selectedHistoryIndex && "bg-accent text-accent-foreground",
                                        )}
                                        onMouseEnter={() => setSelectedHistoryIndex(index)}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => applySearchTerm(item)}
                                    >
                                        <span className="block truncate">{item}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {treeNodes.map((node) => {
                        if (node.type === 'group') {
                            // 搜索时自动展开分组
                            const isExpanded = searchTerm ? true : expandedGroups.has(node.group.id);
                            
                            return (
                                <div key={`group-${node.group.id}`} className="mb-2">
                                    <div
                                        className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors text-xs"
                                        onClick={() => toggleGroup(node.group.id)}
                                    >
                                        <ChevronRight
                                            className={cn(
                                                "h-3 w-3 transition-transform shrink-0",
                                                isExpanded && "rotate-90"
                                            )}
                                        />
                                        <span className="font-medium flex-1 truncate">{node.group.name}</span>
                                        <div
                                            className="w-3 h-3 rounded-sm shrink-0"
                                            style={{ backgroundColor: node.group.color }}
                                        />
                                    </div>
                                    {isExpanded && (
                                        <div className="ml-4 mt-1">
                                            {node.connections.map((conn) => (
                                                     <ConnectionTreeItem
                                                         key={conn.id}
                                                         connection={conn}
                                                         isActive={!!tabs.find(t => t.connectionId === conn.id && t.id === activeTabId)}
                                                         onSelect={handleConnectionClick}
                                                         onSelectTable={handleTableSelect}
                                                         onCommitSearchHistory={commitCurrentSearchTerm}
                                                         filterTerm={searchTerm}
                                                         isExactMatch={isExactMatch}
                                                     />
                                                 ))}
                                        </div>
                                    )}
                                </div>
                            );
                        } else {
                            return (
                                 <ConnectionTreeItem
                                     key={node.connection.id}
                                     connection={node.connection}
                                     isActive={!!tabs.find(t => t.connectionId === node.connection.id && t.id === activeTabId)}
                                     onSelect={handleConnectionClick}
                                     onSelectTable={handleTableSelect}
                                     onCommitSearchHistory={commitCurrentSearchTerm}
                                     filterTerm={searchTerm}
                                     isExactMatch={isExactMatch}
                                 />
                            );
                        }
                    })}
            </div>
        </div>
    );
}
