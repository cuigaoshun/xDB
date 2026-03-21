import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Binary, Calendar, Hash, Type, CheckCircle2, X } from "lucide-react";
import { format as formatSql } from "sql-formatter";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import * as xlsx from "xlsx";
import { toast } from "@/hooks/useToast.ts";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { FilterBuilder } from "@/components/workspace/mysql/FilterBuilder.tsx";
import { TextFormatterDialog } from "@/components/common/TextFormatterDialog.tsx";
import { RowViewerDialog } from "@/components/common/RowViewerDialog.tsx";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme.ts";
import { useAppStore } from "@/store/useAppStore.ts";
import { DEFAULT_PAGE_SIZE, DEBOUNCE_DELAY } from "@/constants/workspace";
import { autoAddLimit } from "@/hooks/usePagination";
import { useDDLPanelResize } from "@/hooks/useDDLPanelResize";
import type { SqlResult } from "@/types/sql";
import { buildFilteredRowEntries, buildUniqueColumnValueMap } from "@/components/workspace/sql/utils/resultTable";
import { splitSqlStatements } from "@/components/workspace/sql/utils/sql";
import { useMysqlWorkspaceQuery } from "./hooks/useMysqlWorkspaceQuery";
import { useMysqlRowEditing } from "./hooks/useMysqlRowEditing";
import { SqlWorkspaceToolbar } from "@/components/workspace/sql/components/SqlWorkspaceToolbar";
import { SqlQueryEditor } from "@/components/workspace/sql/components/SqlQueryEditor";
import { SqlResultTable } from "@/components/workspace/sql/components/SqlResultTable";
import { SqlPaginationBar } from "@/components/workspace/sql/components/SqlPaginationBar";
import { SqlDdlPanel } from "@/components/workspace/sql/components/SqlDdlPanel";

interface MysqlWorkspaceProps {
    tabId: string;
    name: string;
    connectionId: number;
    initialSql?: string;
    savedSql?: string;
    dbName?: string;
    tableName?: string;
    savedResult?: SqlResult;
}

export function MysqlWorkspace({
    tabId,
    name,
    connectionId,
    initialSql,
    savedSql,
    dbName,
    tableName,
    savedResult,
}: MysqlWorkspaceProps) {
    const { t } = useTranslation();
    const isDark = useIsDarkTheme();
    const updateTab = useAppStore((state) => state.updateTab);
    const addTab = useAppStore((state) => state.addTab);
    const connection = useAppStore((state) => state.connections.find((item) => item.id === connectionId));

    const connectionName = connection?.name || name;
    const defaultSqlRef = useRef(savedSql || initialSql || `-- ${t("common.sqlPlaceholder", "Enter your SQL query here...")}`);
    const editorRef = useRef<any>(null);
    const sqlSyncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const [currentPage, setCurrentPage] = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));
    const [inlineFilters, setInlineFilters] = useState<Record<string, string>>({});

    const [formatterOpen, setFormatterOpen] = useState(false);
    const [formatterContent, setFormatterContent] = useState("");
    const [formatterReadOnly, setFormatterReadOnly] = useState(false);
    const [formatterOnSave, setFormatterOnSave] = useState<((val: string) => Promise<void>) | undefined>(undefined);
    const [formatterTitle, setFormatterTitle] = useState("");

    const setEditorSqlValue = useCallback((sql: string) => {
        if (editorRef.current) {
            editorRef.current.setValue(sql);
        } else {
            defaultSqlRef.current = sql;
        }
    }, []);

    const {
        ddl,
        editableState,
        ensureTableColumns,
        error,
        executedSql,
        filterColumns,
        isLoading,
        isLoadingDDL,
        isLoadingFilterColumns,
        primaryKeys,
        refresh,
        result,
        runFilteredQuery,
        runQuery,
        runBatchQueries,
        schemaColumnsRef,
        setError,
        setResult,
        showDDL,
        successMessage,
        setShowDDL,
    } = useMysqlWorkspaceQuery({
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
    });

    const rowEditing = useMysqlRowEditing({
        connectionId,
        dbName,
        tableName,
        executedSql,
        primaryKeys,
        result,
        setError,
        setResult,
        ensureTableColumns,
        refresh,
        t,
    });

    const filteredRowEntries = useMemo(
        () => (result ? buildFilteredRowEntries(result.rows, inlineFilters) : []),
        [inlineFilters, result],
    );

    const hasActiveInlineFilters = useMemo(
        () => Object.values(inlineFilters).some((value) => value.trim() !== ""),
        [inlineFilters],
    );

    const uniqueColumnValueMap = useMemo(
        () => (result ? buildUniqueColumnValueMap(result.columns, result.rows) : {}),
        [result],
    );

    const isTableDataView = useMemo(() => {
        const sql = savedSql || initialSql || "";
        return Boolean(tableName) && sql.trim().toUpperCase().startsWith("SELECT * FROM");
    }, [tableName, savedSql, initialSql]);

    const editorDefaultSize = isTableDataView ? 30 : 50;
    const resultDefaultSize = isTableDataView ? 70 : 50;

    const ddlPanelRef = useDDLPanelResize(ddl, showDDL, isLoadingDDL);

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

        const sqlToExecute = getEditorSql();
        if (!sqlToExecute.trim()) {
            return;
        }

        setCurrentPage(0);

        const trimmedUpper = sqlToExecute.trim().toUpperCase();
        const isQuery =
            trimmedUpper.startsWith("SELECT") ||
            trimmedUpper.startsWith("SHOW") ||
            trimmedUpper.startsWith("DESCRIBE") ||
            trimmedUpper.startsWith("DESC") ||
            trimmedUpper.startsWith("EXPLAIN") ||
            trimmedUpper.startsWith("WITH");

        if (isQuery) {
            let finalSql = sqlToExecute;
            if (finalSql.endsWith(";")) {
                finalSql = finalSql.slice(0, -1).trim();
            }
            finalSql += ";";
            await runQuery(finalSql);
        } else {
            const statements = splitSqlStatements(sqlToExecute);
            if (statements.length > 1) {
                await runBatchQueries(statements);
            } else {
                let finalSql = sqlToExecute;
                if (finalSql.endsWith(";")) {
                    finalSql = finalSql.slice(0, -1).trim();
                }
                finalSql += ";";
                await runQuery(finalSql);
            }
        }
    }, [pageSizeInput, runQuery, runBatchQueries]);

    const handleFormatSql = useCallback(() => {
        try {
            if (!editorRef.current) {
                return;
            }

            const selection = editorRef.current.getSelection();

            if (selection && !selection.isEmpty()) {
                const selectedText = editorRef.current.getModel().getValueInRange(selection);
                if (selectedText.trim()) {
                    const formattedSelection = formatSql(selectedText, { language: "mysql" });
                    editorRef.current.executeEdits(null, [{
                        range: selection,
                        text: formattedSelection,
                        forceMoveMarkers: true,
                    }]);
                    return;
                }
            }

            const model = editorRef.current.getModel();
            const formattedSql = formatSql(editorRef.current.getValue(), { language: "mysql" });
            editorRef.current.executeEdits(null, [{
                range: model.getFullModelRange(),
                text: formattedSql,
                forceMoveMarkers: true,
            }]);
        } catch (formatError: any) {
            setError(formatError?.message || String(formatError));
        }
    }, [setError]);

    const handlePageChange = useCallback(async (nextPage: number) => {
        setCurrentPage(nextPage);
        await runQuery(autoAddLimit(executedSql, pageSize, nextPage * pageSize), {
            skipExecutedSqlUpdate: true,
        });
    }, [executedSql, pageSize, runQuery]);

    const handleFilterExecute = useCallback(async (whereClause: string, orderBy?: string) => {
        const nextPageSize = parseInt(pageSizeInput, 10);
        const effectivePageSize = !isNaN(nextPageSize) && nextPageSize > 0 ? nextPageSize : pageSize;

        if (effectivePageSize !== pageSize) {
            setPageSize(effectivePageSize);
        }

        setCurrentPage(0);
        await runFilteredQuery(whereClause, orderBy, effectivePageSize);
    }, [pageSize, pageSizeInput, runFilteredQuery]);

    const handleOpenSchemaTab = useCallback(() => {
        if (!dbName || !tableName || !connection) {
            return;
        }

        const schemaTabId = `schema-${connection.id}-${dbName}-${tableName}`;
        addTab({
            id: schemaTabId,
            title: `${tableName} - ${t("mysql.tableStructure")}`,
            type: connection.db_type,
            tabType: "table-schema",
            connectionId: connection.id,
            schemaInfo: {
                dbName,
                tableName,
            },
        });
    }, [addTab, connection, dbName, t, tableName]);

    const handleExportData = useCallback(async (format: 'csv' | 'excel' | 'json') => {
        if (!result || result.rows.length === 0) {
            toast({
                title: t("common.error"),
                description: t("common.noResults"),
                variant: "destructive",
            });
            return;
        }

        try {
            const defaultFilename = `${tableName || 'export'}_${new Date().getTime()}`;
            
            let filters: any[] = [];
            let extension = '';
            
            if (format === 'csv') {
                filters = [{ name: 'CSV', extensions: ['csv'] }];
                extension = 'csv';
            } else if (format === 'excel') {
                filters = [{ name: 'Excel', extensions: ['xlsx'] }];
                extension = 'xlsx';
            } else {
                filters = [{ name: 'JSON', extensions: ['json'] }];
                extension = 'json';
            }

            const filePath = await save({
                defaultPath: `${defaultFilename}.${extension}`,
                filters,
            });

            if (!filePath) return;

            if (format === 'json') {
                const jsonContent = JSON.stringify(result.rows, null, 2);
                await writeTextFile(filePath, jsonContent);
            } else {
                const ws = xlsx.utils.json_to_sheet(result.rows);
                if (format === 'csv') {
                    const csvContent = xlsx.utils.sheet_to_csv(ws);
                    await writeTextFile(filePath, '\ufeff' + csvContent);
                } else {
                    const wb = xlsx.utils.book_new();
                    xlsx.utils.book_append_sheet(wb, ws, "Data");
                    const excelBuffer = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
                    const uint8Array = excelBuffer instanceof Uint8Array ? excelBuffer : new Uint8Array(excelBuffer);
                    await writeFile(filePath, uint8Array);
                }
            }

            toast({
                title: t("common.success"),
                description: t("common.exportSuccess", "Export successful"),
            });
        } catch (err: any) {
            console.error("Export failed:", err);
            toast({
                title: t("common.error"),
                description: err.message || t("common.exportFailed", "Export failed"),
                variant: "destructive",
            });
        }
    }, [result, t, tableName]);

    const handleOpenFormatter = useCallback((rowIdx: number, colName: string, value: any) => {
        const content = value === null || value === undefined
            ? ""
            : typeof value === "object"
                ? JSON.stringify(value)
                : String(value);

        setFormatterContent(content);
        setFormatterTitle(`Format value: ${colName}`);
        setFormatterReadOnly(!editableState.isEditable);

        if (editableState.isEditable && dbName && tableName) {
            setFormatterOnSave(() => async (newValue: string) => {
                await rowEditing.updateExistingCellValue(rowIdx, colName, newValue);
            });
        } else {
            setFormatterOnSave(undefined);
        }

        setFormatterOpen(true);
    }, [dbName, editableState.isEditable, rowEditing, tableName]);

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
                selectedCount={rowEditing.selectedRowIndices.length}
                newRowsCount={rowEditing.newRows.length}
                showDDL={showDDL}
                onExecute={handleExecute}
                onFormatSql={handleFormatSql}
                onAddRow={rowEditing.handleAddNewRow}
                onCopyRows={rowEditing.handleCopyRow}
                onDeleteRows={rowEditing.handleRowDelete}
                onSubmitChanges={rowEditing.handleSubmitChanges}
                onCancelChanges={rowEditing.handleCancelChanges}
                onOpenSchemaTab={handleOpenSchemaTab}
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
                                <ResizablePanel defaultSize={editorDefaultSize} minSize={10}>
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
                                        <ResizablePanel defaultSize={resultDefaultSize} minSize={10}>
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
                                                                        {t("common.affectedRows", "Affected Rows")}: {result.affected_rows}
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
                                                            newRows={rowEditing.newRows}
                                                            editingCell={rowEditing.editingCell}
                                                            editValue={rowEditing.editValue}
                                                            filteredRowEntries={filteredRowEntries}
                                                            hasActiveInlineFilters={hasActiveInlineFilters}
                                                            inlineFilters={inlineFilters}
                                                            uniqueColumnValueMap={uniqueColumnValueMap}
                                                            selectedRowIndices={rowEditing.selectedRowIndices}
                                                            selectedRowIndexSet={rowEditing.selectedRowIndexSet}
                                                            onEditValueChange={rowEditing.setEditValue}
                                                            onCellEdit={rowEditing.handleCellEdit}
                                                            onCellSubmit={rowEditing.handleCellSubmit}
                                                            onCellCancel={rowEditing.handleCellCancel}
                                                            onOpenExistingRow={rowEditing.openExistingRowViewer}
                                                            onOpenNewRow={rowEditing.openNewBufferedRowViewer}
                                                            onDeleteNewRow={rowEditing.removeNewRow}
                                                            onCopySingleRow={rowEditing.handleCopySingleRow}
                                                            onDeleteSingleRow={rowEditing.handleDeleteSingleRow}
                                                            onToggleRowSelection={rowEditing.toggleRowSelection}
                                                            onSelectAllRows={rowEditing.selectAllRows}
                                                            onClearSelection={rowEditing.clearSelection}
                                                            onInlineFilterChange={(columnName, value) => {
                                                                setInlineFilters((previousFilters) => ({
                                                                    ...previousFilters,
                                                                    [columnName]: value,
                                                                }));
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
                                                                onExportData={handleExportData}
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
                            <SqlDdlPanel
                                ddl={ddl}
                                isDark={isDark}
                                isLoading={isLoadingDDL}
                                panelRef={ddlPanelRef}
                            />
                        </>
                    )}
                </ResizablePanelGroup>
            </div>

            <TextFormatterDialog
                open={formatterOpen}
                onOpenChange={setFormatterOpen}
                content={formatterContent}
                title={formatterTitle}
                readonly={formatterReadOnly}
                onSave={formatterOnSave}
            />

            <RowViewerDialog
                open={rowEditing.rowViewerOpen}
                onOpenChange={rowEditing.setRowViewerOpen}
                row={rowEditing.viewingRow}
                columns={result?.columns || []}
                title={
                    rowEditing.rowViewerMode === "create" && rowEditing.viewingRowIndex === -1
                        ? t("common.addRow", "Add Row")
                        : ((editableState.isEditable || rowEditing.rowViewerMode === "create")
                            ? t("common.editRow", "Edit Row")
                            : t("common.viewRow", "View Row"))
                }
                submitLabel={
                    rowEditing.rowViewerMode === "create" && rowEditing.viewingRowIndex === -1
                        ? t("common.add", "Add")
                        : t("common.save", "Save")
                }
                editable={editableState.isEditable || rowEditing.rowViewerMode === "create"}
                onSave={rowEditing.handleRowViewerSave}
            />
        </div>
    );
}
