import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Binary, Calendar, Hash, Type, CheckCircle2, X } from "lucide-react";
import { format as formatSql } from "sql-formatter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { FilterBuilder } from "@/components/workspace/mysql/FilterBuilder.tsx";
import { TextFormatterDialog } from "@/components/common/TextFormatterDialog.tsx";
import { RowViewerDialog } from "@/components/common/RowViewerDialog.tsx";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme.ts";
import { useAppStore } from "@/store/useAppStore.ts";
import { confirm, toast } from "@/hooks/useToast.ts";
import type { EditableState, EditingCell, SchemaColumnMeta, SqlResult } from "@/types/sql.ts";
import { DEFAULT_PAGE_SIZE, DEBOUNCE_DELAY } from "@/constants/workspace.ts";
import { autoAddLimit } from "@/hooks/usePagination.ts";
import { useDDLPanelResize } from "@/hooks/useDDLPanelResize.ts";
import { invokeSqliteSql } from "@/lib/api.ts";
import {
    buildFilteredRowEntries,
    buildUniqueColumnValueMap,
    extractSchemaMetadata,
    haveColumnsChanged,
    mergeSqlResultWithSchema,
    resolveEditableState,
} from "@/components/workspace/sql/utils/resultTable.ts";
import { SqlWorkspaceToolbar } from "@/components/workspace/sql/components/SqlWorkspaceToolbar.tsx";
import { SqlQueryEditor } from "@/components/workspace/sql/components/SqlQueryEditor.tsx";
import { SqlResultTable } from "@/components/workspace/sql/components/SqlResultTable.tsx";
import { SqlPaginationBar } from "@/components/workspace/sql/components/SqlPaginationBar.tsx";
import { SqlDdlPanel } from "@/components/workspace/sql/components/SqlDdlPanel.tsx";

interface SqliteWorkspaceProps {
    tabId: string;
    name: string;
    connectionId: number;
    initialSql?: string;
    savedSql?: string;
    dbName?: string;
    tableName?: string;
    savedResult?: SqlResult;
}

type RowViewerMode = "view" | "edit" | "create";
type ViewingRowSource = "existing" | "new";

function escapeSqliteIdentifier(identifier: string) {
    return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function toSqliteLiteral(value: any) {
    if (value === null || value === undefined) {
        return "NULL";
    }
    const rawValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `'${rawValue.replace(/'/g, "''")}'`;
}

function normalizeSqliteValue(value: any) {
    return value === "" ? null : value;
}

export function SqliteWorkspace({
    tabId,
    name,
    connectionId,
    initialSql,
    savedSql,
    dbName,
    tableName,
    savedResult,
}: SqliteWorkspaceProps) {
    const { t } = useTranslation();
    const isDark = useIsDarkTheme();
    const updateTab = useAppStore((state) => state.updateTab);
    const connection = useAppStore((state) => state.connections.find((item) => item.id === connectionId));

    const connectionName = connection?.name || name;
    const defaultSqlRef = useRef(savedSql || initialSql || `-- ${t("common.sqlPlaceholder", "Enter your SQL query here...")}`);
    const editorRef = useRef<any>(null);
    const sqlSyncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const schemaColumnsRef = useRef<SchemaColumnMeta[]>([]);
    const initialSqlExecuted = useRef(false);

    const [result, setResult] = useState<SqlResult | null>(savedResult || null);
    const [executedSql, setExecutedSql] = useState(savedSql || initialSql || `-- ${t("common.sqlPlaceholder", "Enter your SQL query here...")}`);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));
    const [inlineFilters, setInlineFilters] = useState<Record<string, string>>({});
    const [showDDL, setShowDDL] = useState(false);
    const [ddl, setDdl] = useState("");
    const [isLoadingDDL, setIsLoadingDDL] = useState(false);
    const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);
    const [filterColumns, setFilterColumns] = useState(result?.columns || []);
    const [isLoadingFilterColumns, setIsLoadingFilterColumns] = useState(false);
    const [editableState, setEditableState] = useState<EditableState>({ isEditable: false, reason: "" });
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const [editValue, setEditValue] = useState("");
    const [newRows, setNewRows] = useState<Record<string, any>[]>([]);
    const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);
    const [rowViewerOpen, setRowViewerOpen] = useState(false);
    const [rowViewerMode, setRowViewerMode] = useState<RowViewerMode>("view");
    const [viewingRowSource, setViewingRowSource] = useState<ViewingRowSource>("existing");
    const [viewingRow, setViewingRow] = useState<Record<string, any> | null>(null);
    const [viewingRowIndex, setViewingRowIndex] = useState(-1);
    const [formatterOpen, setFormatterOpen] = useState(false);
    const [formatterContent, setFormatterContent] = useState("");
    const [formatterReadOnly, setFormatterReadOnly] = useState(false);
    const [formatterOnSave, setFormatterOnSave] = useState<((val: string) => Promise<void>) | undefined>(undefined);
    const [formatterTitle, setFormatterTitle] = useState("");

    const selectedRowIndexSet = useMemo(() => new Set(selectedRowIndices), [selectedRowIndices]);
    const filteredRowEntries = useMemo(() => (result ? buildFilteredRowEntries(result.rows, inlineFilters) : []), [inlineFilters, result]);
    const hasActiveInlineFilters = useMemo(() => Object.values(inlineFilters).some((value) => value.trim() !== ""), [inlineFilters]);
    const uniqueColumnValueMap = useMemo(() => (result ? buildUniqueColumnValueMap(result.columns, result.rows) : {}), [result]);
    const ddlPanelRef = useDDLPanelResize(ddl, showDDL, isLoadingDDL);
    const noPrimaryKeyMessage = t("common.noPrimaryKey", "Cannot update/delete: Table has no primary key");

    const setEditorSqlValue = useCallback((sql: string) => {
        if (editorRef.current) {
            editorRef.current.setValue(sql);
        } else {
            defaultSqlRef.current = sql;
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            updateTab(tabId, { savedResult: result });
        }, DEBOUNCE_DELAY);
        return () => clearTimeout(timer);
    }, [result, tabId, updateTab]);

    const detectPrimaryKeys = useCallback(async () => {
        if (!tableName) {
            setPrimaryKeys([]);
            setFilterColumns([]);
            schemaColumnsRef.current = [];
            return [];
        }
        setIsLoadingFilterColumns(true);
        try {
            const schemaResult = await invokeSqliteSql<SqlResult>({
                connectionId,
                sql: `PRAGMA table_info(${toSqliteLiteral(tableName)})`,
            });
            const metadata = extractSchemaMetadata(
                schemaResult.rows.map((row) => ({
                    Field: row.name,
                    Type: row.type,
                    Key: Number(row.pk) > 0 ? "PRI" : "",
                    Comment: "",
                })),
            );
            schemaColumnsRef.current = metadata.schemaColumns;
            setFilterColumns(metadata.columns);
            setPrimaryKeys(metadata.primaryKeys);
            return metadata.primaryKeys;
        } catch (schemaError) {
            console.error("Failed to detect SQLite primary keys:", schemaError);
            setPrimaryKeys([]);
            return [];
        } finally {
            setIsLoadingFilterColumns(false);
        }
    }, [connectionId, tableName]);

    const buildWhereClause = useCallback((row: Record<string, any>) => {
        if (primaryKeys.length === 0) {
            throw new Error(noPrimaryKeyMessage);
        }
        return primaryKeys.map((key) => {
            const value = row[key];
            return value === null || value === undefined
                ? `${escapeSqliteIdentifier(key)} IS NULL`
                : `${escapeSqliteIdentifier(key)} = ${toSqliteLiteral(value)}`;
        }).join(" AND ");
    }, [noPrimaryKeyMessage, primaryKeys]);

    const runQuery = useCallback(async (query: string, options?: { skipExecutedSqlUpdate?: boolean; isInitialOpen?: boolean; knownKeys?: string[] }) => {
        if (!query.trim()) {
            return null;
        }
        if (!options?.skipExecutedSqlUpdate) {
            setExecutedSql(query);
        }
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const prefetchedKeys = tableName && schemaColumnsRef.current.length === 0
                ? await detectPrimaryKeys()
                : undefined;
            const rawData = await invokeSqliteSql<SqlResult>({ connectionId, sql: query });
            const mergedData = mergeSqlResultWithSchema(rawData, schemaColumnsRef.current, options?.isInitialOpen);
            if (!haveColumnsChanged(result?.columns, mergedData.columns) && result?.columns) {
                mergedData.columns = result.columns;
            }
            setResult(mergedData);
            if (mergedData.columns.length > 0) {
                setFilterColumns(mergedData.columns);
            }
            const trimmedUpper = query.trim().replace(/^[\s;]+/, "").toUpperCase();
            const isNonSelectStatement =
                !trimmedUpper.startsWith("SELECT") &&
                !trimmedUpper.startsWith("PRAGMA") &&
                !trimmedUpper.startsWith("EXPLAIN");
            if (isNonSelectStatement && mergedData.columns.length === 0) {
                const statementType = trimmedUpper.split(/\s+/)[0];
                const affectedInfo = mergedData.affected_rows > 0 ? `，影响行数: ${mergedData.affected_rows}` : "";
                const message = `${statementType} 语句执行成功${affectedInfo}`;
                setSuccessMessage(message);
                toast({
                    title: t("common.success", "Success"),
                    description: message,
                    duration: 3000,
                });
            }
            const keys = tableName ? (options?.knownKeys || prefetchedKeys || await detectPrimaryKeys()) : [];
            setEditableState(resolveEditableState(query, keys, Boolean(tableName), {
                noPrimaryKey: t("common.noPrimaryKeyEditable", "Table has no primary key, cannot edit"),
                multiTable: t("common.multiTableNotEditable", "Multi-table query cannot be edited directly, please use UPDATE statement"),
                unsupported: t("common.queryNotEditable", "Current query is not editable"),
            }));
            return mergedData;
        } catch (queryError: any) {
            console.error("Execute SQLite SQL failed:", queryError);
            setError(typeof queryError === "string" ? queryError : JSON.stringify(queryError));
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [connectionId, detectPrimaryKeys, result?.columns, t, tableName]);

    const refresh = useCallback(async (query = executedSql) => {
        return runQuery(query, { skipExecutedSqlUpdate: true });
    }, [executedSql, runQuery]);

    const ensureTableColumns = useCallback(async () => {
        if (result?.columns?.length) {
            return result.columns;
        }
        if (!tableName) {
            return [];
        }
        const schemaResult = await invokeSqliteSql<SqlResult>({
            connectionId,
            sql: `PRAGMA table_info(${toSqliteLiteral(tableName)})`,
        });
        const columns = schemaResult.rows.map((row) => ({
            name: String(row.name),
            type_name: String(row.type || "text"),
        }));
        setResult({ columns, rows: [], affected_rows: 0 });
        setFilterColumns(columns);
        return columns;
    }, [connectionId, result?.columns, tableName]);

    const loadDDL = useCallback(async () => {
        if (!tableName) {
            return;
        }
        setIsLoadingDDL(true);
        try {
            const ddlResult = await invokeSqliteSql<SqlResult>({
                connectionId,
                sql: `SELECT sql FROM sqlite_master WHERE type='table' AND name=${toSqliteLiteral(tableName)}`,
            });
            if (ddlResult.rows.length === 0) {
                setDdl("-- No results returned for table DDL");
                return;
            }
            setDdl(ddlResult.rows[0].sql ? String(ddlResult.rows[0].sql) : "-- No DDL found");
        } catch (ddlError: any) {
            console.error("Failed to load SQLite DDL:", ddlError);
            setDdl(`-- Failed to load DDL: ${typeof ddlError === "string" ? ddlError : JSON.stringify(ddlError)}`);
        } finally {
            setIsLoadingDDL(false);
        }
    }, [connectionId, tableName]);

    useEffect(() => {
        if (tableName) {
            detectPrimaryKeys();
        }
    }, [detectPrimaryKeys, tableName]);

    useEffect(() => {
        if (showDDL && tableName) {
            loadDDL();
        }
    }, [loadDDL, showDDL, tableName]);

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
            const isJustComments = baseSql.trim().split("\n").every((line) => line.trim().startsWith("--") || line.trim() === "");
            if (isJustComments) {
                setEditorSqlValue(`${baseSql};`);
                return;
            }
            let finalSql = baseSql;
            let keys: string[] = [];
            if (tableName) {
                keys = await detectPrimaryKeys();
                if (keys.length > 0) {
                    finalSql += ` ORDER BY ${escapeSqliteIdentifier(keys[0])} DESC`;
                }
            }
            finalSql += ` LIMIT ${pageSize};`;
            setEditorSqlValue(finalSql);
            setExecutedSql(finalSql);
            await runQuery(finalSql, { skipExecutedSqlUpdate: true, isInitialOpen: true, knownKeys: keys });
        };
        executeInitial();
    }, [detectPrimaryKeys, initialSql, pageSize, runQuery, savedSql, setEditorSqlValue, tableName]);

    const handleEditorSqlChange = useCallback((sql: string) => {
        if (sqlSyncTimer.current) {
            clearTimeout(sqlSyncTimer.current);
        }
        sqlSyncTimer.current = setTimeout(() => {
            updateTab(tabId, { currentSql: sql });
        }, DEBOUNCE_DELAY);
    }, [tabId, updateTab]);

    const getEditorSql = () => {
        if (editorRef.current) {
            const selection = editorRef.current.getSelection();
            if (selection && !selection.isEmpty()) {
                const selectedText = editorRef.current.getModel().getValueInRange(selection);
                if (selectedText.trim()) {
                    return selectedText.trim();
                }
            }
            return editorRef.current.getValue().trim();
        }
        return defaultSqlRef.current.trim();
    };

    const handleExecute = useCallback(async () => {
        const nextPageSize = parseInt(pageSizeInput, 10);
        if (!isNaN(nextPageSize) && nextPageSize > 0) {
            setPageSize(nextPageSize);
        }
        let sqlToExecute = getEditorSql();
        if (!sqlToExecute) {
            return;
        }
        if (sqlToExecute.endsWith(";")) {
            sqlToExecute = sqlToExecute.slice(0, -1).trim();
        }
        setCurrentPage(0);
        await runQuery(`${sqlToExecute};`);
    }, [pageSizeInput, runQuery]);

    const handleFormatSql = useCallback(() => {
        try {
            if (!editorRef.current) {
                return;
            }
            const selection = editorRef.current.getSelection();
            if (selection && !selection.isEmpty()) {
                const selectedText = editorRef.current.getModel().getValueInRange(selection);
                if (selectedText.trim()) {
                    const formattedSelection = formatSql(selectedText, { language: "sqlite" });
                    editorRef.current.executeEdits(null, [{
                        range: selection,
                        text: formattedSelection,
                        forceMoveMarkers: true,
                    }]);
                    return;
                }
            }
            const model = editorRef.current.getModel();
            const formatted = formatSql(editorRef.current.getValue(), { language: "sqlite" });
            editorRef.current.executeEdits(null, [{
                range: model.getFullModelRange(),
                text: formatted,
                forceMoveMarkers: true,
            }]);
        } catch (formatError: any) {
            setError(formatError?.message || String(formatError));
        }
    }, []);

    const handlePageChange = useCallback(async (nextPage: number) => {
        setCurrentPage(nextPage);
        await runQuery(autoAddLimit(executedSql, pageSize, nextPage * pageSize), {
            skipExecutedSqlUpdate: true,
        });
    }, [executedSql, pageSize, runQuery]);

    const handleFilterExecute = useCallback(async (whereClause: string, orderBy?: string) => {
        if (!tableName) {
            return;
        }
        const nextPageSize = parseInt(pageSizeInput, 10);
        const effectivePageSize = !isNaN(nextPageSize) && nextPageSize > 0 ? nextPageSize : pageSize;
        if (effectivePageSize !== pageSize) {
            setPageSize(effectivePageSize);
        }
        let query = `SELECT * FROM ${escapeSqliteIdentifier(tableName)}`;
        if (whereClause) {
            query += ` WHERE ${whereClause}`;
        }
        if (orderBy) {
            const [field, direction = "ASC"] = orderBy.split(" ");
            query += ` ORDER BY ${escapeSqliteIdentifier(field)} ${direction}`;
        }
        const baseQuery = `${query};`;
        setExecutedSql(baseQuery);
        setCurrentPage(0);
        await runQuery(autoAddLimit(baseQuery, effectivePageSize, 0), { skipExecutedSqlUpdate: true });
    }, [pageSize, pageSizeInput, runQuery, tableName]);

    const updateExistingRowLocally = useCallback((rowIdx: number, nextRow: Record<string, any>) => {
        setResult((previousResult) => {
            if (!previousResult) {
                return previousResult;
            }
            const updatedRows = [...previousResult.rows];
            updatedRows[rowIdx] = nextRow;
            return { ...previousResult, rows: updatedRows };
        });
    }, []);

    const updateExistingCellValue = useCallback(async (rowIdx: number, colName: string, value: any) => {
        if (!result || !tableName) {
            return;
        }
        const originalRow = result.rows[rowIdx];
        const nextRow = { ...originalRow, [colName]: normalizeSqliteValue(value) };
        const updates = Object.keys(nextRow).filter((key) => normalizeSqliteValue(nextRow[key]) !== normalizeSqliteValue(originalRow[key]));
        if (updates.length === 0) {
            return;
        }
        const updateSql = `UPDATE ${escapeSqliteIdentifier(tableName)} SET ${updates
            .map((key) => `${escapeSqliteIdentifier(key)} = ${toSqliteLiteral(normalizeSqliteValue(nextRow[key]))}`)
            .join(", ")} WHERE ${buildWhereClause(originalRow)}`;
        await invokeSqliteSql({ connectionId, sql: updateSql });
        updateExistingRowLocally(rowIdx, nextRow);
    }, [buildWhereClause, connectionId, result, tableName, updateExistingRowLocally]);

    const handleCellEdit = useCallback((rowIdx: number, colName: string, currentValue: any, isNewRow: boolean) => {
        setEditingCell({ rowIdx, colName, isNewRow });
        setEditValue(currentValue === null ? "" : typeof currentValue === "object" ? JSON.stringify(currentValue) : String(currentValue));
    }, []);

    const handleCellCancel = useCallback(() => {
        setEditingCell(null);
        setEditValue("");
    }, []);

    const handleCellSubmit = useCallback(async () => {
        if (!editingCell) {
            return;
        }
        const { rowIdx, colName, isNewRow } = editingCell;
        if (isNewRow) {
            setNewRows((previousRows) => {
                const nextRows = [...previousRows];
                nextRows[rowIdx] = { ...nextRows[rowIdx], [colName]: normalizeSqliteValue(editValue) };
                return nextRows;
            });
            setEditingCell(null);
            return;
        }
        try {
            await updateExistingCellValue(rowIdx, colName, editValue);
            setEditingCell(null);
        } catch (updateError: any) {
            setError(typeof updateError === "string" ? updateError : JSON.stringify(updateError));
        }
    }, [editValue, editingCell, updateExistingCellValue]);

    const openExistingRowViewer = useCallback((row: Record<string, any>, rowIdx: number) => {
        setViewingRow(row);
        setViewingRowIndex(rowIdx);
        setViewingRowSource("existing");
        setRowViewerMode("view");
        setRowViewerOpen(true);
    }, []);

    const openNewBufferedRowViewer = useCallback((row: Record<string, any>, rowIdx: number) => {
        setViewingRow(row);
        setViewingRowIndex(rowIdx);
        setViewingRowSource("new");
        setRowViewerMode("create");
        setRowViewerOpen(true);
    }, []);

    const handleAddNewRow = useCallback(async () => {
        try {
            const columns = await ensureTableColumns();
            if (columns.length === 0) {
                setError(t("common.noColumnsFound", "No columns found, cannot add row"));
                return;
            }
            const emptyRow = columns.reduce<Record<string, any>>((row, column) => {
                row[column.name] = null;
                return row;
            }, {});
            setViewingRow(emptyRow);
            setViewingRowIndex(-1);
            setViewingRowSource("new");
            setRowViewerMode("create");
            setRowViewerOpen(true);
        } catch (schemaError: any) {
            setError(schemaError?.message || String(schemaError));
        }
    }, [ensureTableColumns, t]);

    const handleCopySingleRow = useCallback((rowIdx: number) => {
        if (!result) {
            return;
        }
        const copiedRow = { ...result.rows[rowIdx] };
        primaryKeys.forEach((key) => {
            copiedRow[key] = null;
        });
        const nextIndex = newRows.length;
        setNewRows((previousRows) => [...previousRows, copiedRow]);
        openNewBufferedRowViewer(copiedRow, nextIndex);
    }, [newRows.length, openNewBufferedRowViewer, primaryKeys, result]);

    const handleCopyRow = useCallback(() => {
        if (!result || selectedRowIndices.length === 0) {
            return;
        }
        if (selectedRowIndices.length === 1) {
            handleCopySingleRow(selectedRowIndices[0]);
            return;
        }
        const copiedRows = selectedRowIndices.map((rowIdx) => {
            const copiedRow = { ...result.rows[rowIdx] };
            primaryKeys.forEach((key) => {
                copiedRow[key] = null;
            });
            return copiedRow;
        });
        setNewRows((previousRows) => [...previousRows, ...copiedRows]);
    }, [handleCopySingleRow, primaryKeys, result, selectedRowIndices]);

    const handleDeleteSingleRow = useCallback(async (rowIdx: number) => {
        if (!result || !tableName) {
            return;
        }
        const confirmed = await confirm({
            title: t("common.confirmDeletion"),
            description: t("common.confirmDeleteRow"),
            variant: "destructive",
        });
        if (!confirmed) {
            return;
        }
        try {
            await invokeSqliteSql({
                connectionId,
                sql: `DELETE FROM ${escapeSqliteIdentifier(tableName)} WHERE ${buildWhereClause(result.rows[rowIdx])}`,
            });
            setResult((previousResult) => {
                if (!previousResult) {
                    return previousResult;
                }
                const updatedRows = previousResult.rows.filter((_, index) => index !== rowIdx);
                return { ...previousResult, rows: updatedRows };
            });
            setSelectedRowIndices((previousIndices) => (
                previousIndices.filter((index) => index !== rowIdx).map((index) => (index > rowIdx ? index - 1 : index))
            ));
        } catch (deleteError: any) {
            setError(typeof deleteError === "string" ? deleteError : JSON.stringify(deleteError));
        }
    }, [buildWhereClause, connectionId, result, t, tableName]);

    const handleRowDelete = useCallback(async () => {
        if (!result || !tableName || selectedRowIndices.length === 0) {
            return;
        }
        const confirmed = await confirm({
            title: t("common.confirmDeletion"),
            description: t("common.confirmDeleteRows", { count: selectedRowIndices.length }),
            variant: "destructive",
        });
        if (!confirmed) {
            return;
        }
        try {
            await Promise.allSettled(selectedRowIndices.map((rowIdx) => invokeSqliteSql({
                connectionId,
                sql: `DELETE FROM ${escapeSqliteIdentifier(tableName)} WHERE ${buildWhereClause(result.rows[rowIdx])}`,
            })));
            await refresh(executedSql);
            setSelectedRowIndices([]);
        } catch (deleteError: any) {
            setError(typeof deleteError === "string" ? deleteError : JSON.stringify(deleteError));
        }
    }, [buildWhereClause, connectionId, executedSql, refresh, result, selectedRowIndices, t, tableName]);

    const handleSubmitChanges = useCallback(async () => {
        if (!tableName || newRows.length === 0) {
            return;
        }
        const failedRows: Record<string, any>[] = [];
        const insertSqlList = newRows.map((row) => {
            const fields = Object.keys(row).filter((key) => row[key] !== null && row[key] !== "");
            if (fields.length === 0) {
                return null;
            }
            return `INSERT INTO ${escapeSqliteIdentifier(tableName)} (${fields.map(escapeSqliteIdentifier).join(", ")}) VALUES (${fields.map((key) => toSqliteLiteral(row[key])).join(", ")})`;
        });
        const settled = await Promise.allSettled(insertSqlList.map((insertSql, index) => {
            if (!insertSql) {
                failedRows.push(newRows[index]);
                return Promise.reject(new Error("Empty row"));
            }
            return invokeSqliteSql({ connectionId, sql: insertSql });
        }));
        settled.forEach((item, index) => {
            if (item.status === "rejected" && insertSqlList[index]) {
                failedRows.push(newRows[index]);
            }
        });
        setNewRows(failedRows);
        if (newRows.length > failedRows.length) {
            await refresh(executedSql);
        }
        if (failedRows.length > 0) {
            setError(t("common.someRowsFailed", "Some rows failed to submit, please check data."));
        }
    }, [connectionId, executedSql, newRows, refresh, t, tableName]);

    const handleCancelChanges = useCallback(async () => {
        const confirmed = await confirm({
            title: t("common.confirmDeletion"),
            description: t("common.confirmCancelChanges"),
            variant: "default",
        });
        if (confirmed) {
            setNewRows([]);
        }
    }, [t]);

    const handleRowViewerSave = useCallback(async (editedRow: Record<string, any>) => {
        if (!tableName || !result) {
            return;
        }
        if (viewingRowSource === "new" && viewingRowIndex >= 0) {
            setNewRows((previousRows) => {
                const nextRows = [...previousRows];
                nextRows[viewingRowIndex] = editedRow;
                return nextRows;
            });
            return;
        }
        if (rowViewerMode === "create") {
            const fields = Object.keys(editedRow).filter((key) => editedRow[key] !== null && editedRow[key] !== "");
            if (fields.length === 0) {
                toast({
                    title: t("common.error", "Error"),
                    description: t("common.atLeastOneField", "Please fill in at least one field"),
                    variant: "destructive",
                });
                throw new Error("Empty row");
            }
            const insertSql = `INSERT INTO ${escapeSqliteIdentifier(tableName)} (${fields.map(escapeSqliteIdentifier).join(", ")}) VALUES (${fields.map((key) => toSqliteLiteral(editedRow[key])).join(", ")})`;
            await invokeSqliteSql({ connectionId, sql: insertSql });
            toast({
                title: t("common.success", "Success"),
                description: t("common.insertSuccess", "Inserted successfully"),
            });
            await refresh(executedSql);
            return;
        }
        if (viewingRowIndex < 0) {
            return;
        }
        const originalRow = result.rows[viewingRowIndex];
        const updates = Object.keys(editedRow).filter((key) => normalizeSqliteValue(editedRow[key]) !== normalizeSqliteValue(originalRow[key]));
        if (updates.length === 0) {
            return;
        }
        const updateSql = `UPDATE ${escapeSqliteIdentifier(tableName)} SET ${updates
            .map((key) => `${escapeSqliteIdentifier(key)} = ${toSqliteLiteral(normalizeSqliteValue(editedRow[key]))}`)
            .join(", ")} WHERE ${buildWhereClause(originalRow)}`;
        await invokeSqliteSql({ connectionId, sql: updateSql });
        updateExistingRowLocally(viewingRowIndex, editedRow);
    }, [
        buildWhereClause,
        connectionId,
        executedSql,
        refresh,
        result,
        rowViewerMode,
        t,
        tableName,
        updateExistingRowLocally,
        viewingRowIndex,
        viewingRowSource,
    ]);

    const handleOpenFormatter = useCallback((rowIdx: number, colName: string, value: any) => {
        const content = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
        setFormatterContent(content);
        setFormatterTitle(`${t("common.formatValue")}: ${colName}`);
        setFormatterReadOnly(!editableState.isEditable);
        if (editableState.isEditable && tableName) {
            setFormatterOnSave(() => async (newValue: string) => {
                await updateExistingCellValue(rowIdx, colName, newValue);
            });
        } else {
            setFormatterOnSave(undefined);
        }
        setFormatterOpen(true);
    }, [editableState.isEditable, tableName, updateExistingCellValue]);

    const renderColumnTypeIcon = useCallback((typeName: string) => {
        const upperType = typeName.toUpperCase();
        if (upperType.includes("INT") || upperType.includes("FLOAT") || upperType.includes("DOUBLE") || upperType.includes("DECIMAL") || upperType.includes("BOOL")) {
            return <Hash className="h-3 w-3 text-blue-500" />;
        }
        if (upperType.includes("CHAR") || upperType.includes("TEXT") || upperType.includes("ENUM")) {
            return <Type className="h-3 w-3 text-orange-500" />;
        }
        if (upperType.includes("DATE") || upperType.includes("TIME")) {
            return <Calendar className="h-3 w-3 text-green-500" />;
        }
        if (upperType.includes("BLOB") || upperType.includes("BINARY")) {
            return <Binary className="h-3 w-3 text-purple-500" />;
        }
        return <Type className="h-3 w-3 text-gray-500" />;
    }, []);

    return (
        <div className="h-full flex flex-col bg-background">
            <SqlWorkspaceToolbar
                connection={connection}
                connectionName={connectionName}
                dbName={dbName}
                tableName={tableName}
                isLoading={isLoading}
                isEditable={editableState.isEditable}
                editDisabledReason={editableState.reason}
                selectedCount={selectedRowIndices.length}
                newRowsCount={newRows.length}
                showDDL={showDDL}
                showSchemaButton={false}
                onExecute={handleExecute}
                onFormatSql={handleFormatSql}
                onAddRow={handleAddNewRow}
                onCopyRows={handleCopyRow}
                onDeleteRows={handleRowDelete}
                onSubmitChanges={handleSubmitChanges}
                onCancelChanges={handleCancelChanges}
                onOpenSchemaTab={() => undefined}
                onToggleDDL={() => setShowDDL(!showDDL)}
            />

            {tableName && (filterColumns.length > 0 || isLoadingFilterColumns) && (
                <div className="px-4 py-1 bg-muted/20 border-b">
                    <FilterBuilder
                        columns={filterColumns}
                        primaryKeys={primaryKeys}
                        onChange={() => undefined}
                        onExecute={handleFilterExecute}
                    />
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                <ResizablePanelGroup direction="vertical">
                    <ResizablePanel defaultSize={showDDL ? 60 : 100} minSize={30}>
                        <div className="h-full flex flex-col">
                            <ResizablePanelGroup direction="vertical">
                                <ResizablePanel defaultSize={70} minSize={10}>
                                    <SqlQueryEditor
                                        connectionId={connectionId}
                                        dbName={dbName}
                                        defaultValue={defaultSqlRef.current}
                                        isDark={isDark}
                                        schemaColumnsRef={schemaColumnsRef}
                                        onEditorMount={(editor) => {
                                            editorRef.current = editor;
                                            if (defaultSqlRef.current) {
                                                editor.setValue(defaultSqlRef.current);
                                            }
                                        }}
                                        onSqlChange={handleEditorSqlChange}
                                        onExecute={handleExecute}
                                    />
                                </ResizablePanel>

                                {(result || error || isLoading) && (
                                    <>
                                        <ResizableHandle withHandle />
                                        <ResizablePanel defaultSize={30} minSize={10}>
                                            <div className="flex-1 h-full min-h-0 pb-1 overflow-hidden flex flex-col pt-1">
                                                {error && (
                                                    <div className="p-4 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm font-mono whitespace-pre-wrap flex items-start justify-between gap-2 overflow-auto mx-2">
                                                        <span>Error: {error}</span>
                                                        <button
                                                            onClick={() => setError(null)}
                                                            className="text-red-400 hover:text-red-600 flex-shrink-0"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                )}

                                                {result && result.columns.length === 0 && successMessage && (
                                                    <div className="h-full flex items-center justify-center">
                                                        <div className="flex flex-col items-center gap-3 text-center p-8">
                                                            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3">
                                                                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <p className="text-base font-medium text-foreground">{successMessage}</p>
                                                                {result.affected_rows > 0 && (
                                                                    <p className="text-sm text-muted-foreground">
                                                                        影响行数: {result.affected_rows}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {result && (result.columns.length > 0 || (!successMessage && !isLoading)) && (
                                                    <div className="h-full min-h-0 flex flex-col">
                                                        <SqlResultTable
                                                            result={result}
                                                            isEditable={editableState.isEditable}
                                                            newRows={newRows}
                                                            editingCell={editingCell}
                                                            editValue={editValue}
                                                            filteredRowEntries={filteredRowEntries}
                                                            hasActiveInlineFilters={hasActiveInlineFilters}
                                                            inlineFilters={inlineFilters}
                                                            uniqueColumnValueMap={uniqueColumnValueMap}
                                                            selectedRowIndices={selectedRowIndices}
                                                            selectedRowIndexSet={selectedRowIndexSet}
                                                            onEditValueChange={setEditValue}
                                                            onCellEdit={handleCellEdit}
                                                            onCellSubmit={handleCellSubmit}
                                                            onCellCancel={handleCellCancel}
                                                            onOpenExistingRow={openExistingRowViewer}
                                                            onOpenNewRow={openNewBufferedRowViewer}
                                                            onDeleteNewRow={(rowIdx) => setNewRows((prev) => prev.filter((_, i) => i !== rowIdx))}
                                                            onCopySingleRow={handleCopySingleRow}
                                                            onDeleteSingleRow={handleDeleteSingleRow}
                                                            onToggleRowSelection={(rowIdx) => {
                                                                setSelectedRowIndices((prev) => 
                                                                    prev.includes(rowIdx) ? prev.filter(i => i !== rowIdx) : [...prev, rowIdx]
                                                                );
                                                            }}
                                                            onSelectAllRows={() => setSelectedRowIndices(result.rows.map((_, i) => i))}
                                                            onClearSelection={() => setSelectedRowIndices([])}
                                                            onInlineFilterChange={(columnName, value) => {
                                                                setInlineFilters((prev) => ({ ...prev, [columnName]: value }));
                                                            }}
                                                            onOpenFormatter={handleOpenFormatter}
                                                            renderColumnTypeIcon={renderColumnTypeIcon}
                                                        />

                                                        {result.rows.length > 0 && (
                                                            <SqlPaginationBar
                                                                currentPage={currentPage}
                                                                pageSize={pageSize}
                                                                pageSizeInput={pageSizeInput}
                                                                totalRows={result.rows.length}
                                                                filteredRows={filteredRowEntries.length}
                                                                affectedRows={result.affected_rows}
                                                                hasActiveInlineFilters={hasActiveInlineFilters}
                                                                isEditable={editableState.isEditable}
                                                                editDisabledReason={editableState.reason}
                                                                onPageChange={handlePageChange}
                                                                onPageSizeInputChange={setPageSizeInput}
                                                                onExportData={async () => {}}
                                                            />
                                                        )}
                                                    </div>
                                                )}

                                                {isLoading && (
                                                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm gap-2">
                                                        <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                                        {t("common.running", "Running...")}
                                                    </div>
                                                )}
                                            </div>
                                        </ResizablePanel>
                                    </>
                                )}
                            </ResizablePanelGroup>
                        </div>
                    </ResizablePanel>
                    {showDDL && (
                        <>
                            <ResizableHandle withHandle />
                            <SqlDdlPanel ddl={ddl} isDark={isDark} isLoading={isLoadingDDL} panelRef={ddlPanelRef} />
                        </>
                    )}
                </ResizablePanelGroup>
            </div>

            <TextFormatterDialog open={formatterOpen} onOpenChange={setFormatterOpen} content={formatterContent} title={formatterTitle} readonly={formatterReadOnly} onSave={formatterOnSave} />
            <RowViewerDialog
                open={rowViewerOpen}
                onOpenChange={setRowViewerOpen}
                row={viewingRow}
                columns={result?.columns || []}
                title={rowViewerMode === "create" && viewingRowIndex === -1 ? t("common.addRow") : (editableState.isEditable || rowViewerMode === "create" ? t("common.editRow") : t("common.viewRow"))}
                submitLabel={rowViewerMode === "create" && viewingRowIndex === -1 ? t("common.add") : t("common.save")}
                editable={editableState.isEditable || rowViewerMode === "create"}
                onSave={handleRowViewerSave}
            />
        </div>
    );
}
