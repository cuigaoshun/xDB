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

const SYSTEM_DBS = new Set(["information_schema", "mysql", "performance_schema", "sys"]);
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

    const heightMap = useSettingsStore((state) => state.connectionListHeights);
    const setConnectionListHeight = useSettingsStore((state) => state.setConnectionListHeight);
    const resetConnectionListHeight = useSettingsStore((state) => state.resetConnectionListHeight);

    const [isResizing, setIsResizing] = useState(false);
    const [dragHeight, setDragHeight] = useState<number | undefined>(undefined);
    const resizingRef = useRef<{ startY: number; startHeight: number } | null>(null);
    const currentDragHeightRef = useRef<number | undefined>(undefined);

    const [showCreateTableDialog, setShowCreateTableDialog] = useState(false);
    const [createTableDbName, setCreateTableDbName] = useState<string>("");
    const [showCreateDatabaseDialog, setShowCreateDatabaseDialog] = useState(false);
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

    const storedHeight = heightMap[connection.id];
    const actualHeight = dragHeight ?? storedHeight;
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
            return { databases, tablesMap: {} as Record<string, TableInfo[]> };
        }

        const filteredDbs: string[] = [];
        const tablesMap: Record<string, TableInfo[]> = {};
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
                tablesMap[db] = dbMatch ? dbTables : matchedTables;

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

        return { databases: filteredDbs, tablesMap };
    }, [databases, filterTermLower, getCachedTables, isExactMatch]);

    const flattenedNodes = useMemo((): FlatTreeNode[] => {
        const nodes: FlatTreeNode[] = [];

        for (const db of filteredDatabasesMap.databases) {
            nodes.push({ type: "database", db });

            if (expandedDatabases.has(db) && (isMySql || isSqlite)) {
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
        expandedDatabases,
        filterTermLower,
        filteredDatabasesMap,
        getCachedTables,
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

        if (isSqlite) {
            setDatabases(["main"]);
            loadingDatabasesRef.current.loading = false;
            return;
        }

        if (isRedis) {
            try {
                interface PipelineResult {
                    outputs: any[];
                }

                const result = await invokeRedisPipeline<PipelineResult>({
                    connectionId: connection.id,
                    commands: [
                        { command: "INFO", args: ["keyspace"] },
                        { command: "CONFIG", args: ["GET", "databases"] },
                    ],
                    db: 0,
                });

                const [infoOutput, configOutput] = result.outputs;
                const parsedDbs: string[] = [];
                const newKeysCount: Record<string, number> = {};

                const parseInfo = (infoString: string) => {
                    const lines = infoString.split("\n");
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith("db")) continue;

                        const colonIdx = trimmed.indexOf(":");
                        if (colonIdx === -1) continue;

                        const dbStr = trimmed.substring(2, colonIdx);
                        const statsMatch = trimmed.match(/keys=(\d+)/);
                        if (!statsMatch) continue;

                        parsedDbs.push(dbStr);
                        newKeysCount[dbStr] = parseInt(statsMatch[1], 10);
                    }
                };

                let infoStr = "";
                if (typeof infoOutput === "string") {
                    infoStr = infoOutput;
                } else if (Array.isArray(infoOutput) && typeof infoOutput[0] === "string") {
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

                setDatabases([...parsedDbs, ...dbsWithoutKeys]);
                setRedisKeysCount(newKeysCount);
            } catch (err: any) {
                const errorMsg = String(err);
                if (errorMsg.toLowerCase().includes("failed to connect") || errorMsg.toLowerCase().includes("connection refused")) {
                    setError(errorMsg);
                    setDatabases([]);
                    setRedisKeysCount({});
                } else {
                    console.warn("Failed to fetch Redis info keyspace:", err);
                    setDatabases(["0"]);
                    setRedisKeysCount({ "0": 0 });
                }
            } finally {
                if (loadingDatabasesRef.current?.connectionId === connection.id) {
                    loadingDatabasesRef.current.loading = false;
                }
            }
            return;
        }

        setIsLoadingDatabases(true);
        try {
            const result = await invokeSql<SqlResult>({
                connectionId: connection.id,
                sql: "SHOW DATABASES",
            });

            const dbs = result.rows
                .map((row) => Object.values(row)[0] as string)
                .filter(Boolean)
                .filter((db) => showSystemDatabases || !SYSTEM_DBS.has(db.toLowerCase()));

            setDatabases(dbs);
        } catch (err) {
            console.error("Failed to load databases:", err);
            setError(String(err));
            setDatabases([]);
        } finally {
            setIsLoadingDatabases(false);
            if (loadingDatabasesRef.current?.connectionId === connection.id) {
                loadingDatabasesRef.current.loading = false;
            }
        }
    }, [connection.id, isRedis, isSqlite, showSystemDatabases]);

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

    const prefetchAllTables = useCallback(async () => {
        if (!isMySql || prefetchLoadingRef.current || databases.length === 0) {
            return;
        }

        if (lastPrefetchSignatureRef.current === prefetchSignature) {
            return;
        }

        prefetchLoadingRef.current = true;

        let sql: string;
        if (mysqlPrefetchDbCount === "all" || recentDatabases.length === 0) {
            const systemDbFilter = showSystemDatabases
                ? ""
                : "WHERE TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')";
            sql = `
                SELECT TABLE_SCHEMA, TABLE_NAME
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
                SELECT TABLE_SCHEMA, TABLE_NAME
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
                newTables[schema].push({ name });
            });

            Object.entries(newTables).forEach(([dbName, tableList]) => {
                if (getCachedTables(dbName).length === 0) {
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

    const handleResizeMove = useCallback((moveEvent: MouseEvent) => {
        if (!resizingRef.current) return;

        const deltaY = moveEvent.clientY - resizingRef.current.startY;
        const newHeight = Math.max(100, resizingRef.current.startHeight + deltaY);
        setDragHeight(newHeight);
        currentDragHeightRef.current = newHeight;
    }, []);

    const finishResize = useCallback(() => {
        if (currentDragHeightRef.current !== undefined) {
            setConnectionListHeight(connection.id, currentDragHeightRef.current);
        }

        setIsResizing(false);
        setDragHeight(undefined);
        resizingRef.current = null;
        currentDragHeightRef.current = undefined;
    }, [connection.id, setConnectionListHeight]);

    useEffect(() => {
        if (!isResizing) {
            return;
        }

        const handleMouseUp = () => finishResize();
        document.addEventListener("mousemove", handleResizeMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousemove", handleResizeMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [finishResize, handleResizeMove, isResizing]);

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

    useEffect(() => {
        if (filterTermLower && isMySql) {
            const dbsToExpand = filteredDatabasesMap.databases.filter((db) => {
                const hasMatchingTables = (filteredDatabasesMap.tablesMap[db] || []).length > 0;
                return hasMatchingTables && !expandedDatabases.has(db);
            });

            if (dbsToExpand.length > 0) {
                setExpandedDatabases((prev) => {
                    const next = new Set(prev);
                    dbsToExpand.forEach((db) => next.add(db));
                    return next;
                });
            }
        }
    }, [expandedDatabases, filterTermLower, filteredDatabasesMap, isMySql]);

    const handleResizeStart = (e: React.MouseEvent) => {
        if (filterTerm) return;

        e.preventDefault();
        e.stopPropagation();

        const currentRef = virtualListRef.current;
        const startHeight = actualHeight || (currentRef ? currentRef.offsetHeight : 300);

        setIsResizing(true);
        setDragHeight(startHeight);
        currentDragHeightRef.current = startHeight;
        resizingRef.current = { startY: e.clientY, startHeight };
    };

    const handleToggleExpand = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (isExpanded) {
            collapseConnection();
            return;
        }

        await ensureExpandedAndLoaded();
    };

    const handleSelect = async () => {
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

        if (isMySql || isSqlite) {
            addRecentDatabase(connection.id, dbName);
        }

        handleOpenDatabaseTab(dbName);

        if (isRedis) {
            return;
        }

        const isCurrentlyExpanded = expandedDatabases.has(dbName);
        if (!filterTermLower) {
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
            await invokeSql({
                connectionId: connection.id,
                sql: `DROP TABLE \`${dbName}\`.\`${tableName}\``,
            });
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

    const handleDeleteDatabase = async (dbName: string) => {
        const confirmed = await confirm({
            title: t("common.confirmDeletion"),
            description: t("mysql.confirmDeleteDatabase", { db: dbName }),
            variant: "destructive",
        });
        if (!confirmed) return;

        try {
            await invokeSql({
                connectionId: connection.id,
                sql: `DROP DATABASE \`${dbName}\``,
            });
            setExpandedDatabases((prev) => {
                const next = new Set(prev);
                next.delete(dbName);
                return next;
            });
            await loadDatabases();
            toast({
                title: t("common.success"),
                description: t("mysql.deleteDatabaseSuccess", { db: dbName }),
                variant: "success",
            });
        } catch (err: any) {
            console.error("Failed to drop database:", err);
            toast({
                title: t("common.error"),
                description: String(err),
                variant: "destructive",
            });
        }
    };

    const handleNewQueryTab = (dbName: string, tableName?: string) => {
        const initialSql = tableName ? `SELECT * FROM \`${dbName}\`.\`${tableName}\`;` : `-- ${t("mysql.newQueryTab", "新建查询")}`;

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
                onClick={() => onSelect(connection)}
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

                {isExpanded &&
                    (((isMySql || isSqlite) && expandedDatabases.size > 0) || isRedis) && (
                        <button
                            className="p-0.5 rounded-sm hover:bg-background/50 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
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
                                !actualHeight && (isMySql || isSqlite ? "max-h-[600px]" : "max-h-[320px]"),
                            )}
                            style={actualHeight ? { height: actualHeight } : undefined}
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
                                                    {(isMySql || isSqlite) && !filterTermLower && (
                                                        <button className="p-0.5">
                                                            {expandedDatabases.has(node.db) ? (
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
                                    title={t("common.resetHeight", "恢复默认高度")}
                                >
                                    <RotateCcw className="w-3 h-3" />
                                </button>
                            )}
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
                        className="absolute w-32 bg-popover border rounded-md shadow-md py-1 z-50"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {contextMenu.type === "connection" && (
                            <button
                                className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                onClick={() => {
                                    setShowCreateDatabaseDialog(true);
                                    setContextMenu(null);
                                }}
                            >
                                {t("mysql.createDatabase")}
                            </button>
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
                                                handleNewQueryTab(contextMenu.db!);
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
                                        <div className="h-px bg-border my-1" />
                                        <button
                                            className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                            onClick={() => {
                                                setShowCreateDatabaseDialog(true);
                                                setContextMenu(null);
                                            }}
                                        >
                                            {t("mysql.createDatabase")}
                                        </button>
                                        <button
                                            className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap text-red-600"
                                            onClick={() => {
                                                void handleDeleteDatabase(contextMenu.db!);
                                                setContextMenu(null);
                                            }}
                                        >
                                            {t("mysql.deleteDatabase")}
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
                                <button
                                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent whitespace-nowrap"
                                    onClick={() => {
                                        handleViewTableSchema(contextMenu.db!, contextMenu.table!);
                                        setContextMenu(null);
                                    }}
                                >
                                    {t("mysql.viewSchema")}
                                </button>
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

            {isMySql && (
                <CreateTableDialog
                    open={showCreateTableDialog}
                    onOpenChange={setShowCreateTableDialog}
                    connectionId={connection.id}
                    dbName={createTableDbName}
                    onSuccess={() => {
                        if (createTableDbName) {
                            void loadTables(createTableDbName, { force: true });
                        }
                    }}
                />
            )}

            {isMySql && (
                <CreateDatabaseDialog
                    open={showCreateDatabaseDialog}
                    onOpenChange={setShowCreateDatabaseDialog}
                    connectionId={connection.id}
                    onSuccess={() => {
                        void loadDatabases();
                    }}
                />
            )}
        </div>
    );
}
