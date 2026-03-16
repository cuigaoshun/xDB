import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "@/hooks/useToast";
import { autoAddLimit } from "@/hooks/usePagination";
import { invokeSql } from "@/lib/api";
import type {
    ColumnInfo,
    EditableState,
    SchemaColumnMeta,
    SqlResult,
} from "@/types/sql";
import { DEBOUNCE_DELAY } from "@/constants/workspace";
import {
    extractSchemaMetadata,
    haveColumnsChanged,
    mergeSqlResultWithSchema,
    resolveEditableState,
} from "@/components/workspace/sql/utils/resultTable";

interface UseMysqlWorkspaceQueryOptions {
    tabId: string;
    connectionId: number;
    dbName?: string;
    tableName?: string;
    initialSql?: string;
    savedSql?: string;
    savedResult?: SqlResult;
    pageSize: number;
    t: TFunction;
    updateTab: (id: string, updates: Record<string, any>) => void;
    setEditorSqlValue: (sql: string) => void;
}

interface RunQueryOptions {
    knownKeys?: string[];
    isInitialOpen?: boolean;
    skipExecutedSqlUpdate?: boolean;
}

export function useMysqlWorkspaceQuery({
    tabId,
    connectionId,
    dbName,
    tableName,
    initialSql,
    savedSql,
    savedResult,
    pageSize,
    t,
    updateTab,
    setEditorSqlValue,
}: UseMysqlWorkspaceQueryOptions) {
    const initialEditorSql = useMemo(
        () => savedSql || initialSql || "SELECT * FROM users",
        [initialSql, savedSql],
    );

    const [executedSql, setExecutedSql] = useState(initialEditorSql);
    const [result, setResult] = useState<SqlResult | null>(savedResult || null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [showDDL, setShowDDL] = useState(false);
    const [ddl, setDdl] = useState("");
    const [isLoadingDDL, setIsLoadingDDL] = useState(false);
    const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);
    const [filterColumns, setFilterColumns] = useState<ColumnInfo[]>([]);
    const [isLoadingFilterColumns, setIsLoadingFilterColumns] = useState(false);
    const [editableState, setEditableState] = useState<EditableState>({
        isEditable: false,
        reason: "",
    });

    const schemaPromiseRef = useRef<Promise<string[]> | null>(null);
    const lastSchemaTableRef = useRef("");
    const schemaColumnsRef = useRef<SchemaColumnMeta[]>([]);
    const initialSqlExecuted = useRef(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            updateTab(tabId, { savedResult: result });
        }, DEBOUNCE_DELAY);

        return () => clearTimeout(timer);
    }, [result, tabId, updateTab]);

    const detectPrimaryKeys = useCallback(async (forceRefresh = false): Promise<string[]> => {
        if (!dbName || !tableName) {
            setPrimaryKeys([]);
            return [];
        }

        const currentTableKey = `${dbName}.${tableName}`;
        if (!forceRefresh && schemaPromiseRef.current && lastSchemaTableRef.current === currentTableKey) {
            return schemaPromiseRef.current;
        }

        lastSchemaTableRef.current = currentTableKey;
        schemaPromiseRef.current = (async () => {
            setIsLoadingFilterColumns(true);
            try {
                const sql = `SHOW FULL COLUMNS FROM \`${dbName}\`.\`${tableName}\``;
                const res = await invokeSql<SqlResult>({
                    connectionId,
                    sql,
                    dbName,
                });

                if (!res.rows || res.rows.length === 0) {
                    setPrimaryKeys([]);
                    return [];
                }

                const metadata = extractSchemaMetadata(res.rows);
                schemaColumnsRef.current = metadata.schemaColumns;
                setFilterColumns(metadata.columns);
                setPrimaryKeys(metadata.primaryKeys);

                return metadata.primaryKeys;
            } catch (detectError) {
                console.error("Failed to detect primary keys:", detectError);
                return [];
            } finally {
                setIsLoadingFilterColumns(false);
            }
        })();

        return schemaPromiseRef.current;
    }, [connectionId, dbName, tableName]);

    const runQuery = useCallback(async (query: string, options: RunQueryOptions = {}) => {
        if (!query.trim()) {
            return null;
        }

        if (!options.skipExecutedSqlUpdate) {
            setExecutedSql(query);
        }

        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const prefetchedKeys = dbName && tableName && schemaColumnsRef.current.length === 0
                ? await detectPrimaryKeys()
                : undefined;

            const rawData = await invokeSql<SqlResult>({
                connectionId,
                sql: query,
                dbName,
            });

            const mergedData = mergeSqlResultWithSchema(
                rawData,
                schemaColumnsRef.current,
                options.isInitialOpen,
            );

            if (!haveColumnsChanged(result?.columns, mergedData.columns) && result?.columns) {
                mergedData.columns = result.columns;
            }

            setResult(mergedData);
            setFilterColumns(mergedData.columns || []);

            const trimmedUpper = query.trim().replace(/^[\s;]+/, "").toUpperCase();
            const isNonSelectStatement =
                !trimmedUpper.startsWith("SELECT") &&
                !trimmedUpper.startsWith("SHOW") &&
                !trimmedUpper.startsWith("DESCRIBE") &&
                !trimmedUpper.startsWith("DESC") &&
                !trimmedUpper.startsWith("EXPLAIN");

            if (isNonSelectStatement && (!mergedData.columns || mergedData.columns.length === 0)) {
                const statementType = trimmedUpper.split(/\s+/)[0];
                const affectedInfo = mergedData.affected_rows > 0 ? `，影响行数: ${mergedData.affected_rows}` : "";
                const message = `${statementType} 语句执行成功${affectedInfo}`;
                setSuccessMessage(message);
                toast({
                    title: t("common.success", "执行成功"),
                    description: message,
                    duration: 3000,
                });
            } else {
                setSuccessMessage(null);
            }

            const keys = dbName && tableName
                ? (options.knownKeys || prefetchedKeys || await detectPrimaryKeys())
                : [];

            setEditableState(resolveEditableState(query, keys, Boolean(dbName && tableName), {
                noPrimaryKey: t("common.noPrimaryKeyEditable", "表没有主键，无法编辑"),
                multiTable: t("common.multiTableNotEditable", "多表查询不支持直接编辑，请使用 UPDATE 语句"),
                unsupported: t("common.queryNotEditable", "当前查询不支持编辑"),
            }));

            return mergedData;
        } catch (executeError: any) {
            console.error("Execute SQL failed:", executeError);
            setError(typeof executeError === "string" ? executeError : JSON.stringify(executeError));
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [connectionId, dbName, detectPrimaryKeys, result?.columns, t, tableName]);

    const refresh = useCallback(async (query = executedSql) => {
        return runQuery(query, { skipExecutedSqlUpdate: true });
    }, [executedSql, runQuery]);

    const runFilteredQuery = useCallback(async (whereClause: string, orderBy: string | undefined, nextPageSize: number) => {
        if (!dbName || !tableName) {
            return null;
        }

        let query = `SELECT * FROM \`${dbName}\`.\`${tableName}\``;
        if (whereClause) {
            query += ` WHERE ${whereClause}`;
        }

        if (orderBy) {
            const [field, direction = "ASC"] = orderBy.split(" ");
            query += ` ORDER BY \`${field}\` ${direction}`;
        }

        const baseQuery = `${query};`;
        setExecutedSql(baseQuery);
        return runQuery(autoAddLimit(baseQuery, nextPageSize, 0), { skipExecutedSqlUpdate: true });
    }, [dbName, runQuery, tableName]);

    const loadDDL = useCallback(async () => {
        if (!dbName || !tableName) {
            return;
        }

        setIsLoadingDDL(true);
        try {
            const res = await invokeSql<SqlResult>({
                connectionId,
                sql: `SHOW CREATE TABLE \`${dbName}\`.\`${tableName}\``,
            });

            if (res.rows.length === 0) {
                setDdl("-- No results returned for SHOW CREATE TABLE");
                return;
            }

            const row = res.rows[0];
            const ddlValue = Object.values(row).find((value) => (
                typeof value === "string" && (
                    value.trim().toUpperCase().startsWith("CREATE TABLE") ||
                    value.trim().toUpperCase().startsWith("CREATE VIEW")
                )
            ));

            if (ddlValue) {
                setDdl(ddlValue as string);
                return;
            }

            if (res.columns.length >= 2) {
                const ddlColumnName = res.columns[1].name;
                setDdl((row[ddlColumnName] as string) || "-- DDL not found in result row.");
                return;
            }

            setDdl(`-- DDL structure unrecognized: ${JSON.stringify(row, null, 2)}`);
        } catch (ddlError: any) {
            console.error("Failed to load DDL:", ddlError);
            setDdl(`-- Failed to load DDL: ${typeof ddlError === "string" ? ddlError : JSON.stringify(ddlError)}`);
        } finally {
            setIsLoadingDDL(false);
        }
    }, [connectionId, dbName, tableName]);

    const ensureTableColumns = useCallback(async () => {
        if (result?.columns?.length) {
            return result.columns;
        }

        if (!dbName || !tableName) {
            return [] as ColumnInfo[];
        }

        setIsLoading(true);
        try {
            const schemaSql = `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 0`;
            const schemaResult = await invokeSql<SqlResult>({
                connectionId,
                sql: schemaSql,
                dbName,
            });

            if (schemaResult.columns && schemaResult.columns.length > 0) {
                setResult(schemaResult);
                setFilterColumns(schemaResult.columns);
                return schemaResult.columns;
            }

            const describeResult = await invokeSql<SqlResult>({
                connectionId,
                sql: `DESCRIBE \`${dbName}\`.\`${tableName}\``,
                dbName,
            });

            const columns = describeResult.rows.map((row) => ({
                name: (row.Field || row.column_name || Object.values(row)[0]) as string,
                type_name: (row.Type || row.data_type || "text") as string,
            }));

            const nextResult: SqlResult = {
                columns,
                rows: [],
                affected_rows: 0,
            };
            setResult(nextResult);
            setFilterColumns(columns);
            return columns;
        } catch (schemaError) {
            throw schemaError;
        } finally {
            setIsLoading(false);
        }
    }, [connectionId, dbName, result?.columns, tableName]);

    useEffect(() => {
        if (!showDDL || !dbName || !tableName) {
            return;
        }

        loadDDL();
    }, [dbName, loadDDL, showDDL, tableName]);

    useEffect(() => {
        if (!initialSql || savedSql || initialSqlExecuted.current) {
            return;
        }

        initialSqlExecuted.current = true;

        const executeInitial = async () => {
            let baseSql = initialSql.trim();
            if (baseSql.endsWith(";")) {
                baseSql = baseSql.slice(0, -1).trim();
            }
            baseSql = baseSql.replace(/\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?$/i, "");

            const isJustComments = baseSql
                .trim()
                .split("\n")
                .every((line) => line.trim().startsWith("--") || line.trim().startsWith("#") || line.trim() === "");

            if (isJustComments) {
                setEditorSqlValue(`${baseSql};`);
                return;
            }

            let finalSql = baseSql;
            let keys: string[] = [];

            if (dbName && tableName) {
                keys = await detectPrimaryKeys();
                if (keys.length > 0) {
                    finalSql += ` ORDER BY \`${keys[0]}\` DESC`;
                }
            }

            finalSql += ` LIMIT ${pageSize};`;
            setEditorSqlValue(finalSql);
            setExecutedSql(finalSql);
            await runQuery(finalSql, { knownKeys: keys, isInitialOpen: true, skipExecutedSqlUpdate: true });
        };

        executeInitial();
    }, [
        dbName,
        detectPrimaryKeys,
        initialSql,
        pageSize,
        runQuery,
        savedSql,
        setEditorSqlValue,
        tableName,
    ]);

    return {
        ddl,
        editableState,
        ensureTableColumns,
        error,
        executedSql,
        filterColumns,
        isLoading,
        isLoadingDDL,
        isLoadingFilterColumns,
        loadDDL,
        primaryKeys,
        refresh,
        result,
        runFilteredQuery,
        runQuery,
        schemaColumnsRef,
        setDdl,
        setError,
        setExecutedSql,
        setResult,
        showDDL,
        successMessage,
        setShowDDL,
    };
}
