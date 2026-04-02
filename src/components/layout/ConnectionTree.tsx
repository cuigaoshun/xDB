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
    RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CreateTableDialog } from "@/components/workspace/mysql/CreateTableDialog.tsx";
import { useSettingsStore } from "@/store/useSettingsStore";
import { invokeSql, invokeSqliteSql } from "@/lib/api.ts";
import { useMysqlDatabases } from "@/components/workspace/mysql/hooks/useMysqlDatabases";
import { useRedisDatabases } from "@/components/workspace/redis/hooks/useRedisDatabases";
import { useSqliteDatabases } from "@/components/workspace/sqlite/hooks/useSqliteDatabases";

const EMPTY_ARRAY: string[] = [];

function HighlightText({ text, highlight }: { text: string; highlight?: string }) {
    if (!highlight) return <>{text}</>;

    const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escapedHighlight})`, "gi"));

    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-500 rounded-sm px-0.5">
                        {part}
                    </span>
                ) : (
                    part
                ),
            )}
        </>
    );
}

interface ConnectionTreeItemProps {
    connection: Connection;
    isActive: boolean;
    onSelect: (conn: Connection) => void;
    onSelectTable?: (conn: Connection, db: string, table: string) => void;
    onCommitSearchHistory?: () => void;
    filterTerm?: string;
    isExactMatch?: boolean;
}

interface SqlResult {
    rows: Record<string, any>[];
}

type FlatTreeNode =
    | { type: "database"; db: string }
    | { type: "table"; db: string; table: TableInfo }
    | { type: "loading"; db: string };

export function ConnectionTreeItem({
    connection,
    isActive,
    onSelect,
    onSelectTable,
    onCommitSearchHistory,
    filterTerm,
    isExactMatch,
}: ConnectionTreeItemProps) {
    const { t } = useTranslation();
    const addTab = useAppStore((state) => state.addTab);
    const setExpandedConnectionId = useAppStore((state) => state.setExpandedConnectionId);
    const globalExpandedId = useAppStore((state) => state.expandedConnectionId);
    const tablesCache = useAppStore((state) => state.tablesCache);
    const tablesLoadingMap = useAppStore((state) => state.tablesLoading);
    const setTablesCache = useAppStore((state) => state.setTablesCache);
    const setTablesLoading = useAppStore((state) => state.setTablesLoading);

    const mysqlPrefetchDbCount = useSettingsStore((state) => state.mysqlPrefetchDbCount);
    const showSystemDatabases = useSettingsStore((state) => state.showSystemDatabases);
    const recentDatabasesMap = useSettingsStore((state) => state.recentDatabases);
    const addRecentDatabase = useSettingsStore((state) => state.addRecentDatabase);

    const [isExpanded, setIsExpanded] = useState(false);
    const [databases, setDatabases] = useState<string[]>([]);
    const [redisKeysCount, setRedisKeysCount] = useState<Record<string, number>>({});
    const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
    const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);


    const [showCreateTableDialog, setShowCreateTableDialog] = useState(false);
    const [createTableDbName, setCreateTableDbName] = useState<string>("");
    const [contextMenu, setContextMenu] = useState<{
        type: "connection" | "database" | "table";
        db?: string;
        table?: string;
        x: number;
        y: number;
    } | null>(null);

    const loadingDatabasesRef = useRef<{ connectionId: number; loading: boolean } | null>(null);
    const prefetchLoadingRef = useRef(false);
    const lastPrefetchSignatureRef = useRef<string | null>(null);
    const virtualListRef = useRef<HTMLDivElement>(null);
    const searchExpandOverrides = useRef<Record<string, boolean>>({});
    const lastFilterTermRef = useRef<string>("");

    const { fetchMysqlDatabases } = useMysqlDatabases();
    const { fetchRedisDatabases } = useRedisDatabases();
    const { fetchSqliteDatabases } = useSqliteDatabases();


    const filterTermLower = useMemo(() => filterTerm?.toLowerCase() || "", [filterTerm]);
    const recentDatabases = recentDatabasesMap[connection.id] ?? EMPTY_ARRAY;
    const isMySql = connection.db_type === "mysql";
    const isSqlite = connection.db_type === "sqlite";
    const isRedis = connection.db_type === "redis";
    const supportsTree = isMySql || isSqlite || isRedis;

    const getTablesCacheKey = useCallback((dbName: string) => `${connection.id}-${dbName}`, [connection.id]);

    const getCachedTables = useCallback(
        (dbName: string) => tablesCache[getTablesCacheKey(dbName)] ?? [],
        [getTablesCacheKey, tablesCache],
    );

    const isTableLoading = useCallback(
        (dbName: string) => tablesLoadingMap[getTablesCacheKey(dbName)] ?? false,
        [getTablesCacheKey, tablesLoadingMap],
    );

    const isMatch = useCallback(
        (text: string) => {
            if (!filterTermLower) return true;
            return isExactMatch ? text.toLowerCase() === filterTermLower : text.toLowerCase().includes(filterTermLower);
        },
        [filterTermLower, isExactMatch],
    );

    const filteredDatabasesMap = useMemo(() => {
        if (!filterTermLower) {
            return { databases, tablesMap: {} as Record<string, TableInfo[]>, explicitTableMatch: {} as Record<string, boolean> };
        }

        const filteredDbs: string[] = [];
        const tablesMap: Record<string, TableInfo[]> = {};
        const explicitTableMatch: Record<string, boolean> = {};
        const dbScores: Record<string, number> = {};

        for (const db of databases) {
            const dbLower = db.toLowerCase();
            const dbMatch = isExactMatch ? dbLower === filterTermLower : dbLower.includes(filterTermLower);
            const dbTables = getCachedTables(db);
            const matchedTables = dbTables.filter((table) =>
                isExactMatch
                    ? table.name.toLowerCase() === filterTermLower
                    : table.name.toLowerCase().includes(filterTermLower),
            );

            if (dbMatch || matchedTables.length > 0) {
                filteredDbs.push(db);
                tablesMap[db] = matchedTables.length > 0 ? matchedTables : dbTables;
                explicitTableMatch[db] = matchedTables.length > 0;

                let score = 0;
                if (dbLower === filterTermLower) {
                    score = 100;
                } else if (dbLower.startsWith(filterTermLower)) {
                    score = 50;
                } else if (dbMatch) {
                    score = 10;
                }
                dbScores[db] = score;
            }
        }

        filteredDbs.sort((a, b) => dbScores[b] - dbScores[a]);

        return { databases: filteredDbs, tablesMap, explicitTableMatch };
    }, [databases, filterTermLower, getCachedTables, isExactMatch]);

    // Reset search expand overrides when search term changes
    if (filterTermLower !== lastFilterTermRef.current) {
        searchExpandOverrides.current = {};
        lastFilterTermRef.current = filterTermLower;
    }

    // Determine if a database should be shown expanded, considering search context
    const isDatabaseEffectivelyExpanded = useCallback((db: string): boolean => {
        if (!filterTermLower) {
            // No search active: use normal expandedDatabases state
            return expandedDatabases.has(db);
        }
        // Search is active: check if user has manually overridden
        if (db in searchExpandOverrides.current) {
            return searchExpandOverrides.current[db];
        }
        // No manual override: auto-expand only if there are explicit table matches
        return !!filteredDatabasesMap.explicitTableMatch?.[db];
    }, [expandedDatabases, filterTermLower, filteredDatabasesMap]);

    const flattenedNodes = useMemo((): FlatTreeNode[] => {
        const nodes: FlatTreeNode[] = [];

        for (const db of filteredDatabasesMap.databases) {
            nodes.push({ type: "database", db });

            if (isDatabaseEffectivelyExpanded(db) && (isMySql || isSqlite)) {
                const dbTables = filterTermLower ? filteredDatabasesMap.tablesMap[db] || [] : getCachedTables(db);
                const loading = isTableLoading(db) && dbTables.length === 0;

                if (loading) {
                    nodes.push({ type: "loading", db });
                    continue;
                }

                for (const table of dbTables) {
                    nodes.push({ type: "table", db, table });
                }
            }
        }

        return nodes;
    }, [
        filterTermLower,
        filteredDatabasesMap,
        getCachedTables,
        isDatabaseEffectivelyExpanded,
        isMySql,
        isSqlite,
        isTableLoading,
    ]);

    const virtualizer = useVirtualizer({
        count: flattenedNodes.length,
        getScrollElement: () => virtualListRef.current,
        estimateSize: () => 28,
        overscan: 10,
    });

    const loadDatabases = useCallback(async () => {
        if (loadingDatabasesRef.current?.connectionId === connection.id && loadingDatabasesRef.current.loading) {
            return;
        }

        loadingDatabasesRef.current = { connectionId: connection.id, loading: true };
        setError(null);
        setIsLoadingDatabases(true);

        try {
            if (isSqlite) {
                const dbs = await fetchSqliteDatabases(connection.id);
                setDatabases(dbs);
            } else if (isRedis) {
                const { databases, keysCount } = await fetchRedisDatabases(connection.id);
                setDatabases(databases);
                setRedisKeysCount(keysCount);
            } else {
                const dbs = await fetchMysqlDatabases(connection.id, showSystemDatabases);
                setDatabases(dbs);
            }
        } catch (err: any) {
            console.error("Failed to load databases:", err);
            const errorMsg = String(err);
            setError(errorMsg);
            setDatabases(isRedis ? ["0"] : []);
            if (isRedis) {
                setRedisKeysCount(errorMsg.toLowerCase().includes("failed to connect") || errorMsg.toLowerCase().includes("connection refused") ? {} : { "0": 0 });
            }
        } finally {
            setIsLoadingDatabases(false);
            if (loadingDatabasesRef.current?.connectionId === connection.id) {
                loadingDatabasesRef.current.loading = false;
            }
        }
    }, [
        connection.id,
        isRedis,
        isSqlite,
        showSystemDatabases,
        fetchMysqlDatabases,
        fetchRedisDatabases,
        fetchSqliteDatabases,
    ]);

    const loadTables = useCallback(
        async (dbName: string, options?: { force?: boolean }) => {
            const force = options?.force ?? false;
            const cachedTables = getCachedTables(dbName);

            if (!force && cachedTables.length > 0) {
                return cachedTables;
            }

            if (isTableLoading(dbName)) {
                return cachedTables;
            }

            setTablesLoading(connection.id, dbName, true);
            let command = "";

            try {
                let tableList: TableInfo[] = [];

                if (isSqlite) {
                    command = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;";
                    const result = await invokeSqliteSql<SqlResult>({
                        connectionId: connection.id,
                        sql: command,
                    });
                    tableList = result.rows
                        .map((row) => ({ name: Object.values(row)[0] as string }))
                        .filter((item) => Boolean(item.name));
                } else {
                    command = `SHOW TABLE STATUS FROM \`${dbName}\``;
                    const result = await invokeSql<SqlResult>({
                        connectionId: connection.id,
                        sql: command,
                    });

                    tableList = result.rows
                        .map((row) => {
                            const nameKey = Object.keys(row).find((key) => key.toLowerCase() === "name") || Object.keys(row)[0];
                            const commentKey = Object.keys(row).find((key) => key.toLowerCase() === "comment");
                            const rowsKey = Object.keys(row).find((key) => key.toLowerCase() === "rows");

                            return {
                                name: row[nameKey] as string,
                                comment: commentKey ? (row[commentKey] as string) : undefined,
                                rowCount: rowsKey ? (row[rowsKey] as number) : undefined,
                            };
                        })
                        .filter((item) => Boolean(item.name));
                }

                setTablesCache(connection.id, dbName, tableList);
                return tableList;
            } catch (err) {
                console.error(`Failed to load tables for ${dbName}:`, err);
                return cachedTables;
            } finally {
                setTablesLoading(connection.id, dbName, false);
            }
        },
        [connection.id, getCachedTables, isSqlite, isTableLoading, setTablesCache, setTablesLoading],
    );

    const ensureExpandedAndLoaded = useCallback(async () => {
        setIsExpanded(true);
        setExpandedConnectionId(connection.id);

        if (supportsTree && databases.length === 0) {
            await loadDatabases();
        }
    }, [connection.id, databases.length, loadDatabases, setExpandedConnectionId, supportsTree]);

    const prefetchSignature = useMemo(
        () =>
            JSON.stringify({
                connectionId: connection.id,
                mysqlPrefetchDbCount,
                showSystemDatabases,
                recentDatabases,
            }),
        [connection.id, mysqlPrefetchDbCount, recentDatabases, showSystemDatabases],
    );

    const prefetchAllTables = useCallback(async (options?: { force?: boolean }) => {
        const force = options?.force ?? false;
        if (!isMySql || prefetchLoadingRef.current || databases.length === 0) {
            return;
        }

        if (!force && lastPrefetchSignatureRef.current === prefetchSignature) {
            return;
        }

        prefetchLoadingRef.current = true;

        let sql: string;
        if (mysqlPrefetchDbCount === "all" || recentDatabases.length === 0) {
            const systemDbFilter = showSystemDatabases
                ? ""
                : "WHERE TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')";
            sql = `
                SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_COMMENT, TABLE_ROWS
                FROM information_schema.TABLES
                ${systemDbFilter}
            `;
        } else {
            const dbsToQuery = recentDatabases.slice(0, mysqlPrefetchDbCount);
            if (dbsToQuery.length === 0) {
                prefetchLoadingRef.current = false;
                return;
            }

            const dbList = dbsToQuery.map((db) => `'${db.replace(/'/g, "''")}'`).join(",");
            sql = `
                SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_COMMENT, TABLE_ROWS
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA IN (${dbList})
            `;
        }

        try {
            const result = await invokeSql<SqlResult>({
                connectionId: connection.id,
                sql,
            });

            const newTables: Record<string, TableInfo[]> = {};
            result.rows.forEach((row) => {
                const schema = row["TABLE_SCHEMA"] as string;
                const name = row["TABLE_NAME"] as string;
                if (!schema || !name) return;

                if (!newTables[schema]) {
                    newTables[schema] = [];
                }
                newTables[schema].push({
                    name,
                    comment: row["TABLE_COMMENT"] as string,
                    rowCount: row["TABLE_ROWS"] !== null ? Number(row["TABLE_ROWS"]) : undefined
                });
            });

            Object.entries(newTables).forEach(([dbName, tableList]) => {
                if (force || getCachedTables(dbName).length === 0) {
                    setTablesCache(connection.id, dbName, tableList);
                }
            });

            lastPrefetchSignatureRef.current = prefetchSignature;
        } catch (err) {
            console.error("Failed to prefetch tables:", err);
        } finally {
            prefetchLoadingRef.current = false;
        }
    }, [
        connection.id,
        databases.length,
        getCachedTables,
        isMySql,
        mysqlPrefetchDbCount,
        prefetchSignature,
        recentDatabases,
        setTablesCache,
        showSystemDatabases,
    ]);

    const collapseConnection = useCallback(() => {
        setIsExpanded(false);
        if (globalExpandedId === connection.id) {
            setExpandedConnectionId(null);
        }
    }, [connection.id, globalExpandedId, setExpandedConnectionId]);



    useEffect(() => {
        if (globalExpandedId === connection.id) {
            if (!isExpanded) {
                setIsExpanded(true);
            }
            if (supportsTree && databases.length === 0) {
                void loadDatabases();
            }
        }
    }, [connection.id, databases.length, globalExpandedId, isExpanded, loadDatabases, supportsTree]);

    useEffect(() => {
        if ((isExpanded || isActive) && isMySql) {
            void prefetchAllTables();
        }
    }, [isActive, isExpanded, isMySql, prefetchAllTables]);




    const handleToggleExpand = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (isExpanded) {
            collapseConnection();
            return;
        }

        await ensureExpandedAndLoaded();
    };

    const handleSelect = async () => {
        onCommitSearchHistory?.();
        onSelect(connection);

        if (!isExpanded) {
            await ensureExpandedAndLoaded();
        }
    };

    const handleOpenDatabaseTab = useCallback(
        (dbName: string) => {
            if (isRedis) {
                addTab({
                    id: `redis-db-${connection.id}-${dbName}`,
                    title: `DB ${dbName} - ${connection.name}`,
                    type: "redis",
                    tabType: "redis-db",
                    connectionId: connection.id,
                    redisDbInfo: {
                        db: parseInt(dbName, 10),
                    },
                });
                return;
            }

            addTab({
                id: `db-tables-${connection.id}-${dbName}`,
                title: dbName,
                type: connection.db_type,
                tabType: "database-tables",
                connectionId: connection.id,
                databaseTablesInfo: {
                    dbName,
                },
            });
        },
        [addTab, connection.db_type, connection.id, connection.name, isRedis],
    );

    const toggleDatabaseExpand = async (dbName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onCommitSearchHistory?.();

        if (isMySql || isSqlite) {
            addRecentDatabase(connection.id, dbName);
        }

        handleOpenDatabaseTab(dbName);

        if (isRedis) {
            return;
        }

        const isCurrentlyExpanded = isDatabaseEffectivelyExpanded(dbName);

        if (filterTermLower) {
            // During search, record user's manual override
            searchExpandOverrides.current[dbName] = !isCurrentlyExpanded;
            // Also update expandedDatabases so React re-renders
            setExpandedDatabases((prev) => {
                const next = new Set(prev);
                if (isCurrentlyExpanded) {
                    next.delete(dbName);
                } else {
                    next.add(dbName);
                }
                return next;
            });
        } else {
            setExpandedDatabases((prev) => {
                const next = new Set(prev);
                if (next.has(dbName)) {
                    next.delete(dbName);
                } else {
                    next.add(dbName);
                }
                return next;
            });
        }

        if (!isCurrentlyExpanded && getCachedTables(dbName).length === 0) {
            await loadTables(dbName);
        }
    };

    const handleViewTableSchema = (dbName: string, tableName: string) => {
        addTab({
            id: `schema-${connection.id}-${dbName}-${tableName}`,
            title: `${tableName} - ${t("mysql.tableStructure")}`,
            type: connection.db_type,
            tabType: "table-schema",
            connectionId: connection.id,
            schemaInfo: {
                dbName,
                tableName,
            },
        });
    };

    const handleCreateTable = (dbName: string) => {
        setCreateTableDbName(dbName);
        setShowCreateTableDialog(true);
    };

    const handleDeleteTable = async (dbName: string, tableName: string) => {
        const confirmed = await confirm({
            title: t("common.confirmDeletion"),
            description: t("mysql.confirmDeleteTable", { table: tableName }),
            variant: "destructive",
        });
        if (!confirmed) return;

        try {
            if (isSqlite) {
                await invokeSqliteSql({
                    connectionId: connection.id,
                    sql: `DROP TABLE "${tableName}"`,
                });
            } else {
                await invokeSql({
                    connectionId: connection.id,
                    sql: `DROP TABLE \`${dbName}\`.\`${tableName}\``,
                });
            }
            await loadTables(dbName, { force: true });
            toast({
                title: t("common.success"),
                description: t("mysql.deleteTableSuccess", { table: tableName }),
                variant: "success",
            });
        } catch (err: any) {
            console.error("Failed to drop table:", err);
            toast({
                title: t("common.error"),
                description: String(err),
                variant: "destructive",
            });
        }
    };



    const handleNewQueryTab = (dbName: string, tableName?: string) => {
        const initialSql = tableName ? `SELECT * FROM \`${dbName}\`.\`${tableName}\`;` : `-- ${t("mysql.newQueryTab", "New Query")}`;

        addTab({
            id: `query-${connection.id}-${dbName}-${Date.now()}`,
            title: tableName ? `${tableName} - Query` : `${dbName} - Query`,
            type: connection.db_type,
            connectionId: connection.id,
            dbName,
            tableName: tableName || undefined,
            initialSql,
        });
    };

    if (!supportsTree) {
        if (filterTerm && !isMatch(connection.name)) return null;

        return (
            <div
                onClick={() => {
                    onCommitSearchHistory?.();
                    onSelect(connection);
                }}
                className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors mb-1 text-sm",
                    isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground",
                )}
            >
                <Server className={cn("h-4 w-4", connection.db_type === "memcached" ? "text-orange-500" : "text-red-500")} />
                <span className="truncate">
                    <HighlightText text={connection.name} highlight={filterTerm} />
                </span>
            </div>
        );
    }

    const filteredDatabases = filteredDatabasesMap.databases;
    const selfMatch = isMatch(connection.name);
    const hasMatchingChildren = filteredDatabases.length > 0;

    if (filterTerm && !selfMatch && !hasMatchingChildren) {
        return null;
    }

    return (
        <div className="mb-1 select-none">
            <div
                className={cn(
                    "flex items-center gap-1 px-2 py-2 rounded-md cursor-pointer transition-colors text-sm group",
                    isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground",
                )}
                onClick={handleSelect}
                onContextMenu={(e) => {
                    if (isMySql) {
                        e.preventDefault();
                        setContextMenu({ type: "connection", x: e.clientX, y: e.clientY });
                    }
                }}
            >
                <button
                    className="p-0.5 rounded-sm hover:bg-background/20 text-muted-foreground"
                    onClick={handleToggleExpand}
                >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>

                {isRedis ? (
                    <Server className="h-4 w-4 text-red-500 shrink-0" />
                ) : isSqlite ? (
                    <FileCode className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                    <Database className="h-4 w-4 text-blue-500 shrink-0" />
                )}

                <span className="truncate flex-1">
                    <HighlightText text={connection.name} highlight={filterTerm} />
                </span>

                {isExpanded && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            className="p-0.5 rounded-sm hover:bg-background/50 text-muted-foreground"
                            onClick={(e) => {
                                e.stopPropagation();
                                void loadDatabases().then(() => {
                                    if (isMySql) {
                                        void prefetchAllTables({ force: true });
                                    }
                                });
                            }}
                            title={t("common.refresh", "刷新")}
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        {(((isMySql || isSqlite) && expandedDatabases.size > 0) || isRedis) && (
                            <button
                                className="p-0.5 rounded-sm hover:bg-background/50 text-muted-foreground"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isMySql || isSqlite) {
                                        setExpandedDatabases(new Set());
                                    } else {
                                        collapseConnection();
                                    }
                                }}
                                title={t("common.collapseAll", "收起全部")}
                            >
                                <ChevronsDownUp className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                )}
            </div>

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
                                isRedis ? "max-h-[320px]" : "max-h-[600px]",
                            )}
                        >
                            <div
                                style={{
                                    height: `${virtualizer.getTotalSize()}px`,
                                    width: "100%",
                                    position: "relative",
                                }}
                            >
                                {virtualizer.getVirtualItems().map((virtualRow) => {
                                    const node = flattenedNodes[virtualRow.index];

                                    return (
                                        <div
                                            key={virtualRow.key}
                                            style={{
                                                position: "absolute",
                                                top: 0,
                                                left: 0,
                                                width: "100%",
                                                height: `${virtualRow.size}px`,
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            {node.type === "database" && (
                                                <div
                                                    className="flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground text-xs"
                                                    onClick={(e) => void toggleDatabaseExpand(node.db, e)}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        setContextMenu({ type: "database", db: node.db, x: e.clientX, y: e.clientY });
                                                    }}
                                                >
                                                    {(isMySql || isSqlite) && (
                                                        <button className="p-0.5">
                                                            {isDatabaseEffectivelyExpanded(node.db) ? (
                                                                <ChevronDown className="h-3 w-3" />
                                                            ) : (
                                                                <ChevronRight className="h-3 w-3" />
                                                            )}
                                                        </button>
                                                    )}

                                                    <Database className={cn("h-3 w-3 shrink-0", isRedis ? "text-red-500" : "text-yellow-500")} />

                                                    <span className="truncate flex-1">
                                                        <HighlightText text={isRedis ? `DB ${node.db}` : node.db} highlight={filterTerm} />
                                                    </span>

                                                    {isRedis && redisKeysCount[node.db] !== undefined && (
                                                        <span className="text-[10px] text-muted-foreground/70 ml-2">{redisKeysCount[node.db]}</span>
                                                    )}
                                                </div>
                                            )}

                                            {node.type === "loading" && (
                                                <div className="px-4 py-1 flex items-center gap-2 text-muted-foreground text-xs ml-4">
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    <span>Loading...</span>
                                                </div>
                                            )}

                                            {node.type === "table" && (
                                                <div
                                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground text-xs ml-6"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onCommitSearchHistory?.();
                                                        onSelectTable?.(connection, node.db, node.table.name);
                                                    }}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        setContextMenu({
                                                            type: "table",
                                                            db: node.db,
                                                            table: node.table.name,
                                                            x: e.clientX,
                                                            y: e.clientY,
                                                        });
                                                    }}
                                                    title={node.table.comment}
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


                </div>
            )}

            {contextMenu && (
                <div
                    className="fixed inset-0 z-50"
                    onClick={() => setContextMenu(null)}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu(null);
                    }}
                >
                    <div
                        className="absolute w-32 bg-popover border rounded-md shadow-lg py-1 z-50 transition-opacity"
                        style={{ 
                            left: contextMenu.x, 
                            top: contextMenu.y,
                            transform: `translate(${contextMenu.x + 140 > window.innerWidth ? '-100%' : '2px'}, ${contextMenu.y + 240 > window.innerHeight ? '-100%' : '2px'})`
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {contextMenu.type === "connection" && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                                {t("common.noActions", "No Actions")}
                            </div>
                        )}

                        {contextMenu.type === "database" && contextMenu.db && (
                            <>
                                {isRedis ? (
                                    <button
                                        className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                        onClick={() => {
                                            addTab({
                                                id: `redis-db-${connection.id}-${contextMenu.db}-${Date.now()}`,
                                                title: `DB ${contextMenu.db} - ${connection.name}`,
                                                type: "redis",
                                                tabType: "redis-db",
                                                connectionId: connection.id,
                                                redisDbInfo: {
                                                    db: parseInt(contextMenu.db!, 10),
                                                },
                                            });
                                            setContextMenu(null);
                                        }}
                                    >
                                        {t("redis.newTab", "新建标签页")}
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                            onClick={() => {
                                                handleOpenDatabaseTab(contextMenu.db!);
                                                setContextMenu(null);
                                            }}
                                        >
                                            {t("mysql.newQueryTab", "新建查询")}
                                        </button>
                                        <div className="h-px bg-border my-1" />
                                        <button
                                            className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                            onClick={() => {
                                                handleCreateTable(contextMenu.db!);
                                                setContextMenu(null);
                                            }}
                                        >
                                            {t("mysql.createTable")}
                                        </button>

                                    </>
                                )}
                            </>
                        )}

                        {contextMenu.type === "table" && contextMenu.table && contextMenu.db && (
                            <>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => {
                                        onSelectTable?.(connection, contextMenu.db!, contextMenu.table!);
                                        setContextMenu(null);
                                    }}
                                >
                                    {t("mysql.viewData")}
                                </button>
                                {isMySql && (
                                    <button
                                        className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                        onClick={() => {
                                            handleViewTableSchema(contextMenu.db!, contextMenu.table!);
                                            setContextMenu(null);
                                        }}
                                    >
                                        {t("mysql.viewSchema")}
                                    </button>
                                )}
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => {
                                        handleNewQueryTab(contextMenu.db!, contextMenu.table!);
                                        setContextMenu(null);
                                    }}
                                >
                                    {t("mysql.newQueryTab", "新建查询")}
                                </button>
                                <div className="h-px bg-border my-1" />
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => {
                                        handleCreateTable(contextMenu.db!);
                                        setContextMenu(null);
                                    }}
                                >
                                    {t("mysql.createTable")}
                                </button>
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap text-red-600"
                                    onClick={() => {
                                        void handleDeleteTable(contextMenu.db!, contextMenu.table!);
                                        setContextMenu(null);
                                    }}
                                >
                                    {t("mysql.deleteTable")}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {(isMySql || isSqlite) && (
                <CreateTableDialog
                    open={showCreateTableDialog}
                    onOpenChange={setShowCreateTableDialog}
                    connectionId={connection.id}
                    dbName={createTableDbName}
                    dbType={connection.db_type as "mysql" | "sqlite"}
                    onSuccess={() => {
                        if (createTableDbName) {
                            void loadTables(createTableDbName, { force: true });
                        }
                    }}
                />
            )}
        </div>
    );
}
