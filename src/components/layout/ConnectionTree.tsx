import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Connection, useAppStore, TableInfo } from "@/store/useAppStore";
import { confirm, toast } from "@/hooks/useToast.ts";
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
    GripHorizontal,
    RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CreateTableDialog } from "@/components/workspace/mysql/CreateTableDialog.tsx";
import { CreateDatabaseDialog } from "@/components/workspace/mysql/CreateDatabaseDialog.tsx";
import { useSettingsStore } from "@/store/useSettingsStore";
import { invokeRedisPipeline, invokeSql, invokeSqliteSql } from "@/lib/api.ts";

// 系统数据库列表（移到组件外部避免重复创建）
const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);

// 搜索高亮组件
function HighlightText({ text, highlight }: { text: string; highlight?: string }) {
    if (!highlight) return <>{text}</>;

    // 转义正则特殊字符
    const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escapedHighlight})`, 'gi'));

    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-500 rounded-sm px-0.5">{part}</span>
                ) : (
                    part
                )
            )}
        </>
    );
}

interface ConnectionTreeItemProps {
    connection: Connection;
    isActive: boolean;
    onSelect: (conn: Connection) => void;
    onSelectTable?: (conn: Connection, db: string, table: string) => void;
    filterTerm?: string;
    isExactMatch?: boolean;
}

interface SqlResult {
    rows: Record<string, any>[];
}

export function ConnectionTreeItem({ connection, isActive, onSelect, onSelectTable, filterTerm, isExactMatch }: ConnectionTreeItemProps) {
    const { t } = useTranslation();
    const addTab = useAppStore(state => state.addTab);
    const setExpandedConnectionId = useAppStore(state => state.setExpandedConnectionId);
    const globalExpandedId = useAppStore(state => state.expandedConnectionId);
    const setTablesCache = useAppStore(state => state.setTablesCache);
    const setTablesLoading = useAppStore(state => state.setTablesLoading);

    // 获取设置和最近访问记录
    const mysqlPrefetchDbCount = useSettingsStore(state => state.mysqlPrefetchDbCount);
    const showSystemDatabases = useSettingsStore(state => state.showSystemDatabases);
    const getRecentDatabases = useSettingsStore(state => state.getRecentDatabases);
    const addRecentDatabase = useSettingsStore(state => state.addRecentDatabase);

    const [isExpanded, setIsExpanded] = useState(false);
    const [databases, setDatabases] = useState<string[]>([]);
    const [redisKeysCount, setRedisKeysCount] = useState<Record<string, number>>({});
    const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
    const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    // Map dbName -> TableInfo[]
    const [tables, setTables] = useState<Record<string, TableInfo[]>>({});
    const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set());

    // Resizing logic
    const heightMap = useSettingsStore(state => state.connectionListHeights);
    const setConnectionListHeight = useSettingsStore(state => state.setConnectionListHeight);
    const resetConnectionListHeight = useSettingsStore(state => state.resetConnectionListHeight);

    // Local resizing state for smooth UI
    const [, setIsResizing] = useState(false);
    const [dragHeight, setDragHeight] = useState<number | undefined>(undefined);
    const resizingRef = useRef<{ startY: number, startHeight: number } | null>(null);

    const storedHeight = heightMap[connection.id];
    const actualHeight = dragHeight ?? storedHeight;

    // Use a ref to track the current drag height synchronously
    const currentDragHeightRef = useRef<number | undefined>(undefined);

    const handleResizeStart = (e: React.MouseEvent) => {
        if (filterTerm) return;
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);

        // Determine current starting height
        const currentRef = virtualListRef.current;
        const startH = actualHeight || (currentRef ? currentRef.offsetHeight : 300);

        setDragHeight(startH);
        currentDragHeightRef.current = startH;
        resizingRef.current = { startY: e.clientY, startHeight: startH };

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!resizingRef.current) return;
            const deltaY = moveEvent.clientY - resizingRef.current.startY;
            // Min height 100px
            const newHeight = Math.max(100, resizingRef.current.startHeight + deltaY);

            // Update state for UI
            setDragHeight(newHeight);
            // Update ref for final save
            currentDragHeightRef.current = newHeight;
        };

        const handleMouseUp = () => {
            // Save final height from ref
            if (currentDragHeightRef.current) {
                setConnectionListHeight(connection.id, currentDragHeightRef.current);
            }

            // Clean up
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            setIsResizing(false);
            setDragHeight(undefined); // Reset local drag state so we use stored state
            resizingRef.current = null;
            currentDragHeightRef.current = undefined;
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Create table dialog state
    const [showCreateTableDialog, setShowCreateTableDialog] = useState(false);
    const [createTableDbName, setCreateTableDbName] = useState<string>('');
    const [showCreateDatabaseDialog, setShowCreateDatabaseDialog] = useState(false);

    // 右键菜单状态 - 使用单个共享菜单而不是每行都渲染
    const [contextMenu, setContextMenu] = useState<{
        type: 'connection' | 'database' | 'table';
        db?: string;
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
        return isExactMatch 
            ? text.toLowerCase() === filterTermLower
            : text.toLowerCase().includes(filterTermLower);
    }, [filterTermLower, isExactMatch]);

    // 使用 useMemo 缓存过滤后的数据库列表
    const filteredDatabasesMap = useMemo(() => {
        if (!filterTermLower) {
            return { databases, tablesMap: {} as Record<string, TableInfo[]> };
        }

        const filteredDbs: string[] = [];
        const tablesMap: Record<string, TableInfo[]> = {};
        const dbScores: Record<string, number> = {};

        for (const db of databases) {
            const dbLower = db.toLowerCase();
            const dbMatch = isExactMatch 
                ? dbLower === filterTermLower 
                : dbLower.includes(filterTermLower);
            const dbTables = tables[db] || [];
            const matchedTables = dbTables.filter(t => 
                isExactMatch 
                    ? t.name.toLowerCase() === filterTermLower 
                    : t.name.toLowerCase().includes(filterTermLower)
            );

            if (dbMatch || matchedTables.length > 0) {
                filteredDbs.push(db);
                // 如果数据库名匹配，显示所有表；否则只显示匹配的表
                tablesMap[db] = dbMatch ? dbTables : matchedTables;

                // 计算优先级得分：库名匹配 > 表名匹配
                let score = 0;
                if (dbLower === filterTermLower) {
                    score = 100; // 完全匹配库名
                } else if (dbLower.startsWith(filterTermLower)) {
                    score = 50;  // 库名前缀匹配
                } else if (dbMatch) {
                    score = 10;  // 库名包含搜索词
                } else {
                    score = 0;   // 仅表名匹配
                }
                dbScores[db] = score;
            }
        }

        // 根据得分降序排序，匹配库名的排在前面
        filteredDbs.sort((a, b) => dbScores[b] - dbScores[a]);

        return { databases: filteredDbs, tablesMap };
    }, [databases, tables, filterTermLower, isExactMatch]);

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

        if (connection.db_type === 'redis') {
            try {
                interface PipelineResult {
                    outputs: any[];
                }

                const result = await invokeRedisPipeline<PipelineResult>({
                    connectionId: connection.id,
                    commands: [
                        { command: 'INFO', args: ['keyspace'] },
                        { command: 'CONFIG', args: ['GET', 'databases'] }
                    ],
                    db: 0
                });

                const [infoOutput, configOutput] = result.outputs;

                let parsedDbs: string[] = [];
                let newKeysCount: Record<string, number> = {};

                const parseInfo = (infoString: string) => {
                    const lines = infoString.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('db')) {
                            const colonIdx = trimmed.indexOf(':');
                            if (colonIdx !== -1) {
                                const dbStr = trimmed.substring(2, colonIdx);
                                const statsMatch = trimmed.match(/keys=(\d+)/);
                                if (statsMatch) {
                                    parsedDbs.push(dbStr);
                                    newKeysCount[dbStr] = parseInt(statsMatch[1], 10);
                                }
                            }
                        }
                    }
                };

                let infoStr = "";
                if (typeof infoOutput === 'string') {
                    infoStr = infoOutput;
                } else if (Array.isArray(infoOutput) && typeof infoOutput[0] === 'string') {
                    infoStr = infoOutput[0];
                }

                if (infoStr) {
                    parseInfo(infoStr);
                }

                let totalDatabases = 16;
                if (Array.isArray(configOutput) && configOutput.length >= 2) {
                    totalDatabases = parseInt(configOutput[1], 10) || 16;
                }

                const dbsWithKeys = new Set(parsedDbs);
                const dbsWithoutKeys: string[] = [];
                
                for (let i = 0; i < totalDatabases; i++) {
                    const dbStr = String(i);
                    if (!dbsWithKeys.has(dbStr)) {
                        dbsWithoutKeys.push(dbStr);
                        newKeysCount[dbStr] = 0;
                    }
                }

                const allDbs = [...parsedDbs, ...dbsWithoutKeys];

                setDatabases(allDbs);
                setRedisKeysCount(newKeysCount);
            } catch (err: any) {
                const errorMsg = String(err);
                if (errorMsg.toLowerCase().includes("failed to connect") || errorMsg.toLowerCase().includes("connection refused")) {
                    setError(errorMsg);
                    setDatabases([]);
                    setRedisKeysCount({});
                } else {
                    console.warn("Failed to fetch Redis info keyspace:", err);
                    setDatabases(['0']);
                    setRedisKeysCount({ '0': 0 });
                }
            } finally {
                loadingDatabasesRef.current.loading = false;
            }
            return;
        }

        setIsLoadingDatabases(true);
        try {
            const result = await invokeSql<SqlResult>({
                connectionId: connection.id,
                sql: 'SHOW DATABASES'
            });

            // Robustly parse result by taking the first value of each row
            const dbs = result.rows
                .map(row => Object.values(row)[0] as string)
                .filter(Boolean)
                .filter(db => showSystemDatabases || !SYSTEM_DBS.has(db.toLowerCase()));

            setDatabases(dbs);
            // 异步加载所有表的缓存，用于搜索
            if (connection.db_type?.toLowerCase() === 'mysql') {
                prefetchAllTables();
            }

        } catch (err) {
            console.error("Failed to load databases:", err);
            setError(String(err));
            setDatabases([]);
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

        // 根据设置决定查询哪些数据库
        let sql: string;
        const recentDbs = getRecentDatabases(connection.id);

        if (mysqlPrefetchDbCount === 'all' || recentDbs.length === 0) {
            // 查询所有数据库（根据设置决定是否包含系统库）
            const systemDbFilter = showSystemDatabases ? "" : "WHERE TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')";
            sql = `
                SELECT TABLE_SCHEMA, TABLE_NAME 
                FROM information_schema.TABLES 
                ${systemDbFilter}
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
            const result = await invokeSql<SqlResult>({
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
            hasPrefetchedRef.current = true;
        } catch (err) {
            console.error("Failed to prefetch tables:", err);
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

        // 展开/折叠树节点（搜索时不折叠）
        if (!filterTermLower) {
            const newExpanded = new Set(expandedDatabases);
            if (newExpanded.has(dbName)) {
                newExpanded.delete(dbName);
                setExpandedDatabases(newExpanded);
            } else {
                newExpanded.add(dbName);
                setExpandedDatabases(newExpanded);
            }
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
        let command = "";
        try {
            let tableList: TableInfo[] = [];

            if (connection.db_type === 'sqlite') {
                command = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;";
                const result = await invokeSqliteSql<SqlResult>({
                    connectionId: connection.id,
                    sql: command
                });
                tableList = result.rows
                    .map(row => ({ name: Object.values(row)[0] as string }))
                    .filter(item => Boolean(item.name));
            } else {
                // 使用 SHOW TABLE STATUS 获取完整的表信息
                command = `SHOW TABLE STATUS FROM \`${dbName}\``;
                const result = await invokeSql<SqlResult>({
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
        } catch (err) {
            console.error(`Failed to load tables for ${dbName}:`, err);
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

            await invokeSql({
                connectionId: connection.id,
                sql
            });
            // 刷新表列表
            await loadTables(dbName);
            toast({
                title: t('common.success'),
                description: t('mysql.deleteTableSuccess', { table: tableName }),
                variant: 'success'
            });
        } catch (err: any) {
            console.error("Failed to drop table:", err);
            toast({
                title: t('common.error'),
                description: String(err),
                variant: 'destructive'
            });
        }
    };

    const handleDeleteDatabase = async (dbName: string) => {
        const confirmed = await confirm({
            title: t('common.confirmDeletion'),
            description: t('mysql.confirmDeleteDatabase', { db: dbName }),
            variant: 'destructive'
        });
        if (!confirmed) return;

        try {
            const sql = `DROP DATABASE \`${dbName}\``;

            await invokeSql({
                connectionId: connection.id,
                sql
            });
            // 刷新数据库列表
            loadDatabases();
            toast({
                title: t('common.success'),
                description: t('mysql.deleteDatabaseSuccess', { db: dbName }),
                variant: 'success'
            });
        } catch (err: any) {
            console.error("Failed to drop database:", err);
            toast({
                title: t('common.error'),
                description: String(err),
                variant: 'destructive'
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
                <Server className={cn("h-4 w-4", connection.db_type === 'memcached' ? "text-orange-500" : "text-red-500")} />
                <span className="truncate">
                    <HighlightText text={connection.name} highlight={filterTerm} />
                </span>
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
                onContextMenu={(e) => {
                    if (connection.db_type === 'mysql') {
                        e.preventDefault();
                        setContextMenu({ type: 'connection', x: e.clientX, y: e.clientY });
                    }
                }}
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
                    <HighlightText text={connection.name} highlight={filterTerm} />
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
                <div className="ml-4 border-l border-border/40 pl-1 relative">
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
                                "overflow-y-auto transition-all duration-75 scrollbar-thin",
                                !actualHeight && ((connection.db_type === 'mysql' || connection.db_type === 'sqlite') ? "max-h-[600px]" : "max-h-[320px]")
                            )}
                            style={actualHeight ? { height: actualHeight } : undefined}
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
                                                        e.preventDefault();
                                                        setContextMenu({ type: 'database', db: node.db, x: e.clientX, y: e.clientY });
                                                    }}
                                                >
                                                    {(connection.db_type === 'mysql' || connection.db_type === 'sqlite') && !filterTermLower && (
                                                        <button className="p-0.5">
                                                            {expandedDatabases.has(node.db) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                        </button>
                                                    )}
                                                    <Database className={cn(
                                                        "h-3 w-3 shrink-0",
                                                        connection.db_type === 'redis' ? "text-red-500" : "text-yellow-500"
                                                    )} />
                                                    <span className="truncate flex-1">
                                                        <HighlightText
                                                            text={connection.db_type === 'redis' ? `DB ${node.db}` : node.db}
                                                            highlight={filterTerm}
                                                        />
                                                    </span>
                                                    {connection.db_type === 'redis' && redisKeysCount[node.db] !== undefined && (
                                                        <span className="text-[10px] text-muted-foreground/70 ml-2">
                                                            {redisKeysCount[node.db]}
                                                        </span>
                                                    )}
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
                                                    <TableIcon className="h-3 w-3 text-blue-500 shrink-0" />
                                                    <span className="truncate">
                                                        <HighlightText text={node.table.name} highlight={filterTerm} />
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Resize Handle Area */}
                    {!filterTerm && (
                        <div
                            className="absolute bottom-0 left-0 right-0 flex items-center justify-center z-10 cursor-ns-resize group h-1 hover:h-4 transition-all duration-200"
                            onMouseDown={handleResizeStart}
                        >
                            <div className="absolute inset-0 bg-transparent group-hover:bg-accent/50 transition-colors rounded-sm" />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <GripHorizontal className="w-4 h-4 text-muted-foreground/50" />
                            </div>
                            {storedHeight && (
                                <button
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        resetConnectionListHeight(connection.id);
                                    }}
                                    title={t('common.resetHeight', '恢复默认高度')}
                                >
                                    <RotateCcw className="w-3 h-3" />
                                </button>
                            )}
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
                        {contextMenu.type === 'connection' && (
                            <>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { setShowCreateDatabaseDialog(true); setContextMenu(null); }}
                                >
                                    {t('mysql.createDatabase')}
                                </button>
                            </>
                        )}
                        {contextMenu.type === 'database' && contextMenu.db && (
                            <>
                                {connection.db_type === 'redis' ? (
                                    <button
                                        className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                        onClick={() => {
                                            const tabId = `redis-db-${connection.id}-${contextMenu.db}-${Date.now()}`;
                                            addTab({
                                                id: tabId,
                                                title: `DB ${contextMenu.db} - ${connection.name}`,
                                                type: 'redis',
                                                tabType: 'redis-db',
                                                connectionId: connection.id,
                                                redisDbInfo: {
                                                    db: parseInt(contextMenu.db!)
                                                }
                                            });
                                            setContextMenu(null);
                                        }}
                                    >
                                        {t('redis.newTab', '新建标签页')}
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                            onClick={() => { handleNewQueryTab(contextMenu.db!); setContextMenu(null); }}
                                        >
                                            {t('mysql.newQueryTab', '新建查询')}
                                        </button>
                                        <div className="h-px bg-border my-1" />
                                        <button
                                            className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                            onClick={() => { handleCreateTable(contextMenu.db!); setContextMenu(null); }}
                                        >
                                            {t('mysql.createTable')}
                                        </button>
                                        <div className="h-px bg-border my-1" />
                                        <button
                                            className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                            onClick={() => { setShowCreateDatabaseDialog(true); setContextMenu(null); }}
                                        >
                                            {t('mysql.createDatabase')}
                                        </button>
                                        <button
                                            className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap text-red-600"
                                            onClick={() => { handleDeleteDatabase(contextMenu.db!); setContextMenu(null); }}
                                        >
                                            {t('mysql.deleteDatabase')}
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                        {contextMenu.type === 'table' && contextMenu.table && contextMenu.db && (
                            <>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { onSelectTable?.(connection, contextMenu.db!, contextMenu.table!); setContextMenu(null); }}
                                >
                                    {t('mysql.viewData')}
                                </button>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { handleViewTableSchema(contextMenu.db!, contextMenu.table!); setContextMenu(null); }}
                                >
                                    {t('mysql.viewSchema')}
                                </button>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { handleNewQueryTab(contextMenu.db!, contextMenu.table!); setContextMenu(null); }}
                                >
                                    {t('mysql.newQueryTab', '新建查询')}
                                </button>
                                <div className="h-px bg-border my-1" />
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => { handleCreateTable(contextMenu.db!); setContextMenu(null); }}
                                >
                                    {t('mysql.createTable')}
                                </button>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap text-red-600"
                                    onClick={() => { handleDeleteTable(contextMenu.db!, contextMenu.table!); setContextMenu(null); }}
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

            {/* Create Database Dialog */}
            {connection.db_type === 'mysql' && (
                <CreateDatabaseDialog
                    open={showCreateDatabaseDialog}
                    onOpenChange={setShowCreateDatabaseDialog}
                    connectionId={connection.id}
                    onSuccess={() => {
                        // Refresh databases list
                        loadDatabases();
                    }}
                />
            )}
        </div>
    );
}
