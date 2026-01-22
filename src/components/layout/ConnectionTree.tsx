import { useState, useEffect, useRef } from "react";
import { Connection, useAppStore, TableInfo } from "@/store/useAppStore";
import { confirm } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
    Database,
    Server,
    ChevronRight,
    ChevronDown,
    Table as TableIcon,
    Loader2,
    FileCode,
    ChevronsDownUp,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { addCommandToConsole } from "@/components/ui/CommandConsole";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useTranslation } from "react-i18next";
import { CreateTableDialog } from "@/components/workspace/CreateTableDialog";

// 系统数据库列表（移到组件外部避免重复创建）
const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);

interface ConnectionTreeItemProps {
    connection: Connection;
    isActive: boolean;
    onSelect: (conn: Connection) => void;
    onSelectTable?: (conn: Connection, db: string, table: string) => void;
    filterTerm?: string;
}

interface SqlResult {
    rows: Record<string, any>[];
}

export function ConnectionTreeItem({ connection, isActive, onSelect, onSelectTable, filterTerm }: ConnectionTreeItemProps) {
    const { t } = useTranslation();
    const addTab = useAppStore(state => state.addTab);
    const setExpandedConnectionId = useAppStore(state => state.setExpandedConnectionId);
    const globalExpandedId = useAppStore(state => state.expandedConnectionId);
    const setTablesCache = useAppStore(state => state.setTablesCache);

    const [isExpanded, setIsExpanded] = useState(false);
    const [databases, setDatabases] = useState<string[]>([]);
    const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
    const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    // Map dbName -> TableInfo[]
    const [tables, setTables] = useState<Record<string, TableInfo[]>>({});
    const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set());

    // Create table dialog state
    const [showCreateTableDialog, setShowCreateTableDialog] = useState(false);
    const [createTableDbName, setCreateTableDbName] = useState<string>('');

    // 使用 ref 来防止 loadDatabases 重复调用
    const loadingDatabasesRef = useRef<{ connectionId: number; loading: boolean } | null>(null);
    const prefetchLoadingRef = useRef(false);
    const hasPrefetchedRef = useRef(false);

    // Auto-expand if filter matches something inside (and we have data)
    // This is tricky with lazy loading. We only filter what we have.

    const isMatch = (text: string) => !filterTerm || text.toLowerCase().includes(filterTerm.toLowerCase());

    // Filter databases to display
    const getFilteredDatabases = () => {
        if (!filterTerm) return databases;
        return databases.filter(db => {
            if (isMatch(db)) return true;
            // Check if any table matches
            const dbTables = tables[db];
            if (dbTables && dbTables.some(t => isMatch(t.name))) return true;
            return false;
        });
    };

    // Filter tables to display for a db
    const getFilteredTables = (db: string) => {
        const dbTables = tables[db] || [];
        if (!filterTerm) return dbTables;
        return dbTables.filter(t => isMatch(t.name));
    };

    // Sync from global expanded ID
    useEffect(() => {
        if (globalExpandedId === connection.id && !isExpanded) {
            setIsExpanded(true);
            // 如果数据库列表为空，则加载
            if (databases.length === 0) {
                loadDatabases();
            }
        }
    }, [globalExpandedId, connection.id, isExpanded, databases.length]);

    // 自动预取表信息
    useEffect(() => {
        if ((isExpanded || isActive) && connection.db_type?.toLowerCase() === 'mysql') {
            prefetchAllTables();
        }
    }, [isExpanded, isActive, connection.db_type]);

    const toggleExpand = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (!isExpanded) {
            setIsExpanded(true);
            setExpandedConnectionId(connection.id);
            const isSupported = (connection.db_type?.toLowerCase() === 'mysql' || connection.db_type === 'redis' || connection.db_type === 'sqlite');

            // Load databases if not loaded yet (for supported types)
            if (isSupported && databases.length === 0) {
                loadDatabases();
            }
        } else {
            setIsExpanded(false);
            if (globalExpandedId === connection.id) {
                setExpandedConnectionId(null);
            }
        }
    };

    // Also expand when selecting the connection
    const handleSelect = async (_e: React.MouseEvent) => {
        onSelect(connection);
        // 只展开，不折叠
        if (!isExpanded) {
            setIsExpanded(true);
            setExpandedConnectionId(connection.id);
            const isSupported = (connection.db_type?.toLowerCase() === 'mysql' || connection.db_type === 'redis' || connection.db_type === 'sqlite');

            // Load databases if not loaded yet
            if (isSupported && databases.length === 0) {
                loadDatabases();
            }
        }
    };

    interface RedisCommandResult {
        output: any;
    }

    const loadDatabases = async () => {
        // 如果已经在加载相同连接的数据，直接返回
        if (loadingDatabasesRef.current?.connectionId === connection.id && loadingDatabasesRef.current?.loading) {
            return;
        }

        // 立即设置加载标志
        loadingDatabasesRef.current = { connectionId: connection.id, loading: true };
        setError(null);
        if (connection.db_type === 'sqlite') {
            // SQLite doesn't have multiple databases per connection usually, just treat the file as "main"
            setDatabases(['main']);
            loadingDatabasesRef.current.loading = false;
            return;
        }

        const startTime = Date.now();

        if (connection.db_type === 'redis') {
            try {
                // Try to fetch real config
                const result = await invoke<RedisCommandResult>('execute_redis_command', {
                    connectionId: connection.id,
                    command: 'CONFIG',
                    args: ['GET', 'databases'],
                    db: 0
                });

                let count = 16; // Default fallback

                // Output format for CONFIG GET databases is usually ["databases", "16"]
                if (Array.isArray(result.output) && result.output.length >= 2) {
                    const key = result.output[0];
                    const value = result.output[1];

                    if (key === 'databases') {
                        const parsed = parseInt(value);
                        if (!isNaN(parsed) && parsed > 0) {
                            count = parsed;
                        }
                    }
                }

                const redisDbs = Array.from({ length: count }, (_, i) => i.toString());
                setDatabases(redisDbs);

                addCommandToConsole({
                    databaseType: 'redis',
                    command: 'CONFIG GET databases',
                    duration: Date.now() - startTime,
                    success: true
                });
            } catch (err: any) {
                const errorMsg = String(err);
                if (errorMsg.toLowerCase().includes("failed to connect") || errorMsg.toLowerCase().includes("connection refused")) {
                    setError(errorMsg);
                    // If connection fails, do NOT fallback to 16 DBs, just show error
                    setDatabases([]);
                } else {
                    console.warn("Failed to fetch Redis config, falling back to 16:", err);
                    const redisDbs = Array.from({ length: 16 }, (_, i) => i.toString());
                    setDatabases(redisDbs);
                }

                addCommandToConsole({
                    databaseType: 'redis',
                    command: 'CONFIG GET databases',
                    duration: Date.now() - startTime,
                    success: false,
                    error: errorMsg
                });
            } finally {
                loadingDatabasesRef.current.loading = false;
            }
            return;
        }

        setIsLoadingDatabases(true);
        try {
            const result = await invoke<SqlResult>('execute_sql', {
                connectionId: connection.id,
                sql: 'SHOW DATABASES'
            });

            // Robustly parse result by taking the first value of each row
            const dbs = result.rows
                .map(row => Object.values(row)[0] as string)
                .filter(Boolean)
                .filter(db => !SYSTEM_DBS.has(db.toLowerCase()));

            setDatabases(dbs);

            addCommandToConsole({
                databaseType: 'mysql',
                command: 'SHOW DATABASES',
                duration: Date.now() - startTime,
                success: true
            });

            // 异步加载所有表的缓存，用于搜索
            if (connection.db_type?.toLowerCase() === 'mysql') {
                prefetchAllTables();
            }

        } catch (err) {
            console.error("Failed to load databases:", err);
            setError(String(err));
            setDatabases([]);

            addCommandToConsole({
                databaseType: 'mysql',
                command: 'SHOW DATABASES',
                duration: Date.now() - startTime,
                success: false,
                error: String(err)
            });
        } finally {
            setIsLoadingDatabases(false);
            // 加载完成后重置loading标志
            if (loadingDatabasesRef.current?.connectionId === connection.id) {
                loadingDatabasesRef.current.loading = false;
            }
        }
    };

    // 预取所有表信息
    const prefetchAllTables = async () => {
        if (prefetchLoadingRef.current || hasPrefetchedRef.current) {
            return;
        }

        prefetchLoadingRef.current = true;
        const startTime = Date.now();

        const sql = `
            SELECT TABLE_SCHEMA, TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        `;

        try {
            const result = await invoke<SqlResult>('execute_sql', {
                connectionId: connection.id,
                sql
            });

            const newTables: Record<string, TableInfo[]> = {};

            result.rows.forEach(row => {
                const schema = row['TABLE_SCHEMA'] as string;
                const name = row['TABLE_NAME'] as string;
                if (!schema || !name) return;

                if (!newTables[schema]) {
                    newTables[schema] = [];
                }
                newTables[schema].push({ name });
            });

            setTables(prev => {
                const merged = { ...prev };
                Object.keys(newTables).forEach(db => {
                    // 如果当前没有缓存，或者缓存为空，才使用预取的数据
                    if (!merged[db] || merged[db].length === 0) {
                        merged[db] = newTables[db];
                        // 同时缓存到全局 store
                        setTablesCache(connection.id, db, newTables[db]);
                    }
                });
                return merged;
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: sql,
                duration: Date.now() - startTime,
                success: true
            });

            hasPrefetchedRef.current = true;
        } catch (err) {
            console.error("Failed to prefetch tables:", err);
            addCommandToConsole({
                databaseType: 'mysql',
                command: sql,
                duration: Date.now() - startTime,
                success: false,
                error: String(err)
            });
        } finally {
            prefetchLoadingRef.current = false;
        }
    };

    // 监听搜索词，如果有匹配的表，自动展开对应的数据库
    useEffect(() => {
        if (filterTerm && connection.db_type === 'mysql') {
            const newExpanded = new Set(expandedDatabases);
            let changed = false;

            databases.forEach(db => {
                // 如果数据库名本身匹配，不需要因为表而展开（虽然也可以）
                // 这里主要处理：数据库名不匹配，但表名匹配的情况
                const dbTables = tables[db];
                if (dbTables && dbTables.some(t => isMatch(t.name))) {
                    if (!newExpanded.has(db)) {
                        newExpanded.add(db);
                        changed = true;
                    }
                }
            });

            if (changed) {
                setExpandedDatabases(newExpanded);
            }
        }
    }, [filterTerm, tables, databases, connection.db_type]);

    const toggleDatabaseExpand = async (dbName: string, e: React.MouseEvent) => {
        e.stopPropagation();

        // For Redis, clicking a DB creates a new tab
        if (connection.db_type === 'redis') {
            const tabId = `redis-db-${connection.id}-${dbName}`;
            addTab({
                id: tabId,
                title: `DB ${dbName} - ${connection.name}`,
                type: 'redis',
                tabType: 'redis-db',
                connectionId: connection.id,
                redisDbInfo: {
                    db: parseInt(dbName)
                }
            });
            return;
        }

        // 打开数据库表列表 Tab - DatabaseTablesTab 会自动加载表列表
        if (connection.db_type === 'mysql' || connection.db_type === 'sqlite') {
            const tabId = `db-tables-${connection.id}-${dbName}`;
            addTab({
                id: tabId,
                title: dbName,
                type: connection.db_type,
                tabType: 'database-tables',
                connectionId: connection.id,
                databaseTablesInfo: {
                    dbName
                }
            });
        }

        // 展开/折叠树节点
        const newExpanded = new Set(expandedDatabases);
        if (newExpanded.has(dbName)) {
            newExpanded.delete(dbName);
            setExpandedDatabases(newExpanded);
        } else {
            newExpanded.add(dbName);
            setExpandedDatabases(newExpanded);

            // 真正点击展开时，尝试更新最新的表数据
            // 只有当没有正在加载时才加载
            if (!loadingTables.has(dbName)) {
                loadTables(dbName);
            }
        }
    };

    const loadTables = async (dbName: string) => {
        const newLoading = new Set(loadingTables);
        newLoading.add(dbName);
        setLoadingTables(newLoading);

        const startTime = Date.now();
        let command = "";
        const dbType = connection.db_type;

        try {
            let tableList: TableInfo[] = [];

            if (connection.db_type === 'sqlite') {
                command = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;";
                const result = await invoke<SqlResult>('execute_sqlite_sql', {
                    connectionId: connection.id,
                    sql: command
                });
                tableList = result.rows
                    .map(row => ({ name: Object.values(row)[0] as string }))
                    .filter(item => Boolean(item.name));
            } else {
                // 使用 SHOW TABLE STATUS 获取完整的表信息
                command = `SHOW TABLE STATUS FROM \`${dbName}\``;
                const result = await invoke<SqlResult>('execute_sql', {
                    connectionId: connection.id,
                    sql: command
                });

                // 解析表信息
                tableList = result.rows
                    .map(row => {
                        const nameKey = Object.keys(row).find(k => k.toLowerCase() === 'name') || Object.keys(row)[0];
                        const commentKey = Object.keys(row).find(k => k.toLowerCase() === 'comment');
                        const rowsKey = Object.keys(row).find(k => k.toLowerCase() === 'rows');

                        return {
                            name: row[nameKey] as string,
                            comment: commentKey ? row[commentKey] as string : undefined,
                            rowCount: rowsKey ? row[rowsKey] as number : undefined
                        };
                    })
                    .filter(item => Boolean(item.name));
            }

            setTables(prev => ({
                ...prev,
                [dbName]: tableList
            }));

            // 缓存到 store 中
            setTablesCache(connection.id, dbName, tableList);

            addCommandToConsole({
                databaseType: dbType as any,
                command: command,
                duration: Date.now() - startTime,
                success: true
            });
        } catch (err) {
            console.error(`Failed to load tables for ${dbName}:`, err);

            addCommandToConsole({
                databaseType: dbType as any,
                command: command || `Load tables for ${dbName}`,
                duration: Date.now() - startTime,
                success: false,
                error: String(err)
            });
        } finally {
            const finishedLoading = new Set(loadingTables);
            finishedLoading.delete(dbName);
            setLoadingTables(finishedLoading);
        }
    };

    // 右键菜单处理函数
    const handleViewTableSchema = (dbName: string, tableName: string) => {
        const tabId = `schema-${connection.id}-${dbName}-${tableName}`;
        addTab({
            id: tabId,
            title: `${tableName} - ${t('mysql.tableStructure')}`,
            type: connection.db_type,
            tabType: 'table-schema',
            connectionId: connection.id,
            schemaInfo: {
                dbName,
                tableName
            }
        });
    };

    const handleCreateTable = (dbName: string) => {
        setCreateTableDbName(dbName);
        setShowCreateTableDialog(true);
    };

    const handleDeleteTable = async (dbName: string, tableName: string) => {
        const confirmed = await confirm({
            title: t('common.confirmDeletion'),
            description: t('mysql.confirmDeleteTable', { table: tableName }),
            variant: 'destructive'
        });
        if (!confirmed) return;

        try {
            const sql = `DROP TABLE \`${dbName}\`.\`${tableName}\``;
            const startTime = Date.now();

            await invoke("execute_sql", {
                connectionId: connection.id,
                sql
            });

            addCommandToConsole({
                databaseType: connection.db_type as any,
                command: sql,
                duration: Date.now() - startTime,
                success: true
            });

            // 刷新表列表
            await loadTables(dbName);
            alert(t('common.success'));
        } catch (err: any) {
            console.error("Failed to drop table:", err);
            alert(t('common.error') + ': ' + String(err));

            addCommandToConsole({
                databaseType: connection.db_type as any,
                command: `DROP TABLE \`${dbName}\`.\`${tableName}\``,
                duration: 0,
                success: false,
                error: String(err)
            });
        }
    };

    // 新建查询Tab
    const handleNewQueryTab = (dbName: string, tableName?: string) => {
        const tabId = `query-${connection.id}-${dbName}-${Date.now()}`;
        const initialSql = tableName
            ? `SELECT * FROM \`${dbName}\`.\`${tableName}\`;`
            : `-- ${t('mysql.newQueryTab', '新建查询')}`;
        addTab({
            id: tabId,
            title: tableName ? `${tableName} - Query` : `${dbName} - Query`,
            type: connection.db_type,
            connectionId: connection.id,
            dbName,
            tableName: tableName || undefined,
            initialSql
        });
    };

    // Other types (postgres) might not support tree view yet
    if (connection.db_type !== 'mysql' && connection.db_type !== 'redis' && connection.db_type !== 'sqlite') {
        // Simple filter for non-supported types
        if (filterTerm && !isMatch(connection.name)) return null;

        return (
            <div
                onClick={() => onSelect(connection)}
                className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors mb-1 text-sm",
                    isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
            >
                <Server className="h-4 w-4 text-red-500" />
                <span className="truncate">{connection.name}</span>
            </div>
        );
    }

    // For MySQL & Redis & SQLite:
    const filteredDatabases = getFilteredDatabases();

    const selfMatch = isMatch(connection.name);
    const hasMatchingChildren = filteredDatabases.length > 0;

    // Hide if loaded and no matches
    if (filterTerm && !selfMatch && databases.length > 0 && !hasMatchingChildren) {
        return null;
    }

    return (
        <div className="mb-1 select-none">
            {/* Connection Row */}
            <div
                className={cn(
                    "flex items-center gap-1 px-2 py-2 rounded-md cursor-pointer transition-colors text-sm group",
                    isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
                onClick={handleSelect}
            >
                <button
                    className="p-0.5 rounded-sm hover:bg-background/20 text-muted-foreground"
                    onClick={toggleExpand}
                >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>

                {connection.db_type === 'redis' ? (
                    <Server className="h-4 w-4 text-red-500 shrink-0" />
                ) : connection.db_type === 'sqlite' ? (
                    <FileCode className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                    <Database className="h-4 w-4 text-blue-500 shrink-0" />
                )}
                <span className="truncate flex-1">
                    {connection.name}
                </span>
                {/* 收起所有按钮 - MySQL/SQLite收起表，Redis/Memcached收起整个连接 */}
                {isExpanded && (
                    ((['mysql', 'sqlite'] as const).includes(connection.db_type as any) && expandedDatabases.size > 0) ||
                    (['redis', 'memcached'] as const).includes(connection.db_type as any)
                ) && (
                    <button
                        className="p-0.5 rounded-sm hover:bg-background/50 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (connection.db_type === 'mysql' || connection.db_type === 'sqlite') {
                                // 收起所有表（数据库节点）
                                setExpandedDatabases(new Set());
                            } else {
                                // Redis/Memcache: 收起整个连接
                                setIsExpanded(false);
                                if (globalExpandedId === connection.id) {
                                    setExpandedConnectionId(null);
                                }
                            }
                        }}
                        title={t('common.collapseAll', '收起所有')}
                    >
                        <ChevronsDownUp className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {/* Databases List */}
            {isExpanded && (
                <div className={cn(
                    "ml-4 border-l border-border/40 pl-1 overflow-y-auto",
                    (connection.db_type === 'mysql' || connection.db_type === 'sqlite') ? "max-h-[600px]" : "max-h-[320px]"
                )}>
                    {error && (
                        <div className="px-2 py-1.5 text-xs text-destructive bg-destructive/10 rounded mx-1 mb-1 break-words">
                            {error}
                        </div>
                    )}
                    {isLoadingDatabases ? (
                        <div className="px-4 py-2 flex items-center gap-2 text-muted-foreground text-xs">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Loading...</span>
                        </div>
                    ) : (
                        filteredDatabases.map(db => (
                            <div key={db} className="flex flex-col">
                                {/* 为MySQL和SQLite数据库添加右键菜单 */}
                                {(connection.db_type === 'mysql' || connection.db_type === 'sqlite') ? (
                                    <ContextMenu>
                                        <ContextMenuTrigger>
                                            <div
                                                className="flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground text-xs"
                                                onClick={(e) => toggleDatabaseExpand(db, e)}
                                            >
                                                <button className="p-0.5">
                                                    {expandedDatabases.has(db) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                </button>
                                                <Database className="h-3 w-3 shrink-0 text-yellow-500/70" />
                                                <span className="truncate">{db}</span>
                                            </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent>
                                            <ContextMenuItem onClick={() => handleNewQueryTab(db)}>
                                                {t('mysql.newQueryTab', '新建查询')}
                                            </ContextMenuItem>
                                            <ContextMenuSeparator />
                                            <ContextMenuItem onClick={() => handleCreateTable(db)}>
                                                {t('mysql.createTable')}
                                            </ContextMenuItem>
                                        </ContextMenuContent>
                                    </ContextMenu>
                                ) : (
                                    <div
                                        className="flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground text-xs"
                                        onClick={(e) => toggleDatabaseExpand(db, e)}
                                    >
                                        <Database className={cn(
                                            "h-3 w-3 shrink-0",
                                            connection.db_type === 'redis' ? "text-red-400/70" : "text-yellow-500/70"
                                        )} />
                                        <span className="truncate">
                                            {connection.db_type === 'redis' ? `DB ${db}` : db}
                                        </span>
                                    </div>
                                )}

                                {/* Tables List (MySQL & SQLite) */}
                                {(connection.db_type === 'mysql' || connection.db_type === 'sqlite') && expandedDatabases.has(db) && (
                                    <div className="ml-4 border-l border-border/40 pl-1">
                                        {(loadingTables.has(db) && (!tables[db] || tables[db].length === 0)) ? (
                                            <div className="px-4 py-1 flex items-center gap-2 text-muted-foreground text-xs">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span>Loading...</span>
                                            </div>
                                        ) : (
                                            getFilteredTables(db).map(table => (
                                                <ContextMenu key={table.name}>
                                                    <ContextMenuTrigger>
                                                        <div
                                                            className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground text-xs ml-4"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onSelectTable?.(connection, db, table.name);
                                                            }}
                                                        >
                                                            <TableIcon className="h-3 w-3 text-blue-400/70 shrink-0" />
                                                            <span className="truncate">{table.name}</span>
                                                        </div>
                                                    </ContextMenuTrigger>
                                                    <ContextMenuContent>
                                                        <ContextMenuItem
                                                            onClick={() => onSelectTable?.(connection, db, table.name)}
                                                        >
                                                            {t('mysql.viewData')}
                                                        </ContextMenuItem>
                                                        <ContextMenuItem
                                                            onClick={() => handleViewTableSchema(db, table.name)}
                                                        >
                                                            {t('mysql.viewSchema')}
                                                        </ContextMenuItem>
                                                        <ContextMenuItem
                                                            onClick={() => handleNewQueryTab(db, table.name)}
                                                        >
                                                            {t('mysql.newQueryTab', '新建查询')}
                                                        </ContextMenuItem>
                                                        <ContextMenuSeparator />
                                                        <ContextMenuItem
                                                            onClick={() => handleCreateTable(db)}
                                                        >
                                                            {t('mysql.createTable')}
                                                        </ContextMenuItem>
                                                        <ContextMenuItem
                                                            onClick={() => handleDeleteTable(db, table.name)}
                                                            className="text-red-600"
                                                        >
                                                            {t('mysql.deleteTable')}
                                                        </ContextMenuItem>
                                                    </ContextMenuContent>
                                                </ContextMenu>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Create Table Dialog */}
            {connection.db_type === 'mysql' && (
                <CreateTableDialog
                    open={showCreateTableDialog}
                    onOpenChange={setShowCreateTableDialog}
                    connectionId={connection.id}
                    dbName={createTableDbName}
                    onSuccess={() => {
                        // 刷新表列表
                        if (createTableDbName) {
                            loadTables(createTableDbName);
                        }
                    }}
                />
            )}
        </div>
    );
}
