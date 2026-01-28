import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { useTranslation } from "react-i18next";
import { CreateTableDialog } from "@/components/workspace/mysql/CreateTableDialog.tsx";
import { useSettingsStore } from "@/store/useSettingsStore";

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
    const setTablesLoading = useAppStore(state => state.setTablesLoading);

    // 获取设置和最近访问记录
    const mysqlPrefetchDbCount = useSettingsStore(state => state.mysqlPrefetchDbCount);
    const getRecentDatabases = useSettingsStore(state => state.getRecentDatabases);
    const addRecentDatabase = useSettingsStore(state => state.addRecentDatabase);

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

    // 右键菜单状态 - 使用单个共享菜单而不是每行都渲染
    const [contextMenu, setContextMenu] = useState<{
        type: 'database' | 'table';
        db: string;
        table?: string;
        x: number;
        y: number;
    } | null>(null);

    // 使用 ref 来防止 loadDatabases 重复调用
    const loadingDatabasesRef = useRef<{ connectionId: number; loading: boolean } | null>(null);
    const prefetchLoadingRef = useRef(false);
    const hasPrefetchedRef = useRef(false);

    // Auto-expand if filter matches something inside (and we have data)
    // This is tricky with lazy loading. We only filter what we have.

    // 缓存小写的 filterTerm 避免重复计算
    const filterTermLower = useMemo(() => filterTerm?.toLowerCase() || '', [filterTerm]);

    const isMatch = useCallback((text: string) => {
        if (!filterTermLower) return true;
        return text.toLowerCase().includes(filterTermLower);
    }, [filterTermLower]);

    // 使用 useMemo 缓存过滤后的数据库列表
    const filteredDatabasesMap = useMemo(() => {
        if (!filterTermLower) {
            return { databases, tablesMap: {} as Record<string, TableInfo[]> };
        }

        const filteredDbs: string[] = [];
        const tablesMap: Record<string, TableInfo[]> = {};

        for (const db of databases) {
            const dbMatch = db.toLowerCase().includes(filterTermLower);
            const dbTables = tables[db] || [];
            const matchedTables = dbTables.filter(t => t.name.toLowerCase().includes(filterTermLower));

            if (dbMatch || matchedTables.length > 0) {
                filteredDbs.push(db);
                // 如果数据库名匹配，显示所有表；否则只显示匹配的表
                tablesMap[db] = dbMatch ? dbTables : matchedTables;
            }
        }

        return { databases: filteredDbs, tablesMap };
    }, [databases, tables, filterTermLower]);

    // 定义扁平化的树节点类型
    type FlatTreeNode =
        | { type: 'database'; db: string }
        | { type: 'table'; db: string; table: TableInfo }
        | { type: 'loading'; db: string };

    // 将树结构扁平化为虚拟列表可用的数组
    const flattenedNodes = useMemo((): FlatTreeNode[] => {
        const nodes: FlatTreeNode[] = [];
        const filteredDbs = filteredDatabasesMap.databases;

        for (const db of filteredDbs) {
            nodes.push({ type: 'database', db });

            // 只有展开的数据库才添加表节点
            if (expandedDatabases.has(db) && (connection.db_type === 'mysql' || connection.db_type === 'sqlite')) {
                const isLoading = loadingTables.has(db) && (!tables[db] || tables[db].length === 0);
                if (isLoading) {
                    nodes.push({ type: 'loading', db });
                } else {
                    const dbTables = filterTermLower
                        ? (filteredDatabasesMap.tablesMap[db] || [])
                        : (tables[db] || []);
                    for (const table of dbTables) {
                        nodes.push({ type: 'table', db, table });
                    }
                }
            }
        }

        return nodes;
    }, [filteredDatabasesMap, expandedDatabases, loadingTables, tables, filterTermLower, connection.db_type]);

    // 虚拟列表容器 ref
    const virtualListRef = useRef<HTMLDivElement>(null);

    // 虚拟列表配置
    const virtualizer = useVirtualizer({
        count: flattenedNodes.length,
        getScrollElement: () => virtualListRef.current,
        estimateSize: () => 28, // 每行大约 28px
        overscan: 10, // 预渲染额外的行数
    });

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

    // 预取表信息（根据设置决定查询范围）
    const prefetchAllTables = async () => {
        if (prefetchLoadingRef.current || hasPrefetchedRef.current) {
            return;
        }

        prefetchLoadingRef.current = true;
        const startTime = Date.now();

        // 根据设置决定查询哪些数据库
        let sql: string;
        const recentDbs = getRecentDatabases(connection.id);

        if (mysqlPrefetchDbCount === 'all' || recentDbs.length === 0) {
            // 查询所有非系统数据库
            sql = `
                SELECT TABLE_SCHEMA, TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            `;
        } else {
            // 优先查询最近访问的数据库
            const limit = mysqlPrefetchDbCount;
            const dbsToQuery = recentDbs.slice(0, limit);
            const dbList = dbsToQuery.map(db => `'${db.replace(/'/g, "''")}'`).join(',');
            sql = `
                SELECT TABLE_SCHEMA, TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE TABLE_SCHEMA IN (${dbList})
            `;
        }

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
    // 使用 filteredDatabasesMap 中已缓存的结果，避免重复计算
    useEffect(() => {
        if (filterTermLower && connection.db_type === 'mysql') {
            const dbsToExpand = filteredDatabasesMap.databases.filter(db => {
                // 只展开那些有匹配表的数据库（且尚未展开）
                const hasMatchingTables = filteredDatabasesMap.tablesMap[db]?.length > 0;
                return hasMatchingTables && !expandedDatabases.has(db);
            });

            if (dbsToExpand.length > 0) {
                setExpandedDatabases(prev => {
                    const newSet = new Set(prev);
                    dbsToExpand.forEach(db => newSet.add(db));
                    return newSet;
                });
            }
        }
    }, [filterTermLower, filteredDatabasesMap, connection.db_type]);

    const toggleDatabaseExpand = async (dbName: string, e: React.MouseEvent) => {
        e.stopPropagation();

        // 记录用户访问的数据库（MySQL/SQLite）
        if (connection.db_type === 'mysql' || connection.db_type === 'sqlite') {
            addRecentDatabase(connection.id, dbName);
        }

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
        }

        // 每次点击数据库都刷新表数据（获取最新的注释和行数）
        if (!loadingTables.has(dbName)) {
            loadTables(dbName);
        }
    };

    const loadTables = async (dbName: string) => {
        setLoadingTables(prev => new Set(prev).add(dbName));
        // 设置全局加载状态，防止 DatabaseTablesTab 重复加载
        setTablesLoading(connection.id, dbName, true);

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
            setLoadingTables(prev => {
                const newSet = new Set(prev);
                newSet.delete(dbName);
                return newSet;
            });
            // 清除全局加载状态
            setTablesLoading(connection.id, dbName, false);
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
    const filteredDatabases = filteredDatabasesMap.databases;

    const selfMatch = isMatch(connection.name);
    const hasMatchingChildren = filteredDatabases.length > 0;

    // Hide if no matches
    if (filterTerm && !selfMatch && !hasMatchingChildren) {
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
                <div className="ml-4 border-l border-border/40 pl-1">
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
                        <div
                            ref={virtualListRef}
                            className={cn(
                                "overflow-y-auto",
                                (connection.db_type === 'mysql' || connection.db_type === 'sqlite') ? "max-h-[600px]" : "max-h-[320px]"
                            )}
                        >
                            <div
                                style={{
                                    height: `${virtualizer.getTotalSize()}px`,
                                    width: '100%',
                                    position: 'relative',
                                }}
                            >
                                {virtualizer.getVirtualItems().map(virtualRow => {
                                    const node = flattenedNodes[virtualRow.index];

                                    return (
                                        <div
                                            key={virtualRow.key}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: `${virtualRow.size}px`,
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            {node.type === 'database' && (
                                                <div
                                                    className="flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground text-xs"
                                                    onClick={(e) => toggleDatabaseExpand(node.db, e)}
                                                    onContextMenu={(e) => {
                                                        if (connection.db_type === 'mysql' || connection.db_type === 'sqlite') {
                                                            e.preventDefault();
                                                            setContextMenu({ type: 'database', db: node.db, x: e.clientX, y: e.clientY });
                                                        }
                                                    }}
                                                >
                                                    {(connection.db_type === 'mysql' || connection.db_type === 'sqlite') && (
                                                        <button className="p-0.5">
                                                            {expandedDatabases.has(node.db) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                        </button>
                                                    )}
                                                    <Database className={cn(
                                                        "h-3 w-3 shrink-0",
                                                        connection.db_type === 'redis' ? "text-red-400/70" : "text-yellow-500/70"
                                                    )} />
                                                    <span className="truncate">
                                                        {connection.db_type === 'redis' ? `DB ${node.db}` : node.db}
                                                    </span>
                                                </div>
                                            )}

                                            {node.type === 'loading' && (
                                                <div className="px-4 py-1 flex items-center gap-2 text-muted-foreground text-xs ml-4">
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    <span>Loading...</span>
                                                </div>
                                            )}

                                            {node.type === 'table' && (
                                                <div
                                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground text-xs ml-6"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectTable?.(connection, node.db, node.table.name);
                                                    }}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        setContextMenu({ type: 'table', db: node.db, table: node.table.name, x: e.clientX, y: e.clientY });
                                                    }}
                                                >
                                                    <TableIcon className="h-3 w-3 text-blue-400/70 shrink-0" />
                                                    <span className="truncate">{node.table.name}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 共享的右键菜单 */}
            {contextMenu && (
                <div
                    className="fixed inset-0 z-50"
                    onClick={() => setContextMenu(null)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
                >
                    <div
                        className="absolute w-32 bg-popover border rounded-md shadow-md py-1 z-50"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {contextMenu.type === 'database' && (
                            <>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { handleNewQueryTab(contextMenu.db); setContextMenu(null); }}
                                >
                                    {t('mysql.newQueryTab', '新建查询')}
                                </button>
                                <div className="h-px bg-border my-1" />
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { handleCreateTable(contextMenu.db); setContextMenu(null); }}
                                >
                                    {t('mysql.createTable')}
                                </button>
                            </>
                        )}
                        {contextMenu.type === 'table' && contextMenu.table && (
                            <>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { onSelectTable?.(connection, contextMenu.db, contextMenu.table!); setContextMenu(null); }}
                                >
                                    {t('mysql.viewData')}
                                </button>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { handleViewTableSchema(contextMenu.db, contextMenu.table!); setContextMenu(null); }}
                                >
                                    {t('mysql.viewSchema')}
                                </button>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { handleNewQueryTab(contextMenu.db, contextMenu.table); setContextMenu(null); }}
                                >
                                    {t('mysql.newQueryTab', '新建查询')}
                                </button>
                                <div className="h-px bg-border my-1" />
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { handleCreateTable(contextMenu.db); setContextMenu(null); }}
                                >
                                    {t('mysql.createTable')}
                                </button>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap text-red-600"
                                    onClick={() => { handleDeleteTable(contextMenu.db, contextMenu.table!); setContextMenu(null); }}
                                >
                                    {t('mysql.deleteTable')}
                                </button>
                            </>
                        )}
                    </div>
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
