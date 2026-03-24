import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { confirm, toast } from "@/hooks/useToast";
import { invokeSql } from "@/lib/api";
import type { ColumnInfo, EditingCell, SqlResult } from "@/types/sql";
import {
    buildDeleteSql,
    buildInsertSql,
    buildUpdateSql,
    normalizeEditableValue,
} from "../utils/sqlBuilders";

type RowViewerMode = "view" | "edit" | "create";
type ViewingRowSource = "existing" | "new";

interface UseMysqlRowEditingOptions {
    connectionId: number;
    dbName?: string;
    tableName?: string;
    executedSql: string;
    primaryKeys: string[];
    result: SqlResult | null;
    setError: (message: string | null) => void;
    setResult: Dispatch<SetStateAction<SqlResult | null>>;
    ensureTableColumns: () => Promise<ColumnInfo[]>;
    refresh: (query?: string) => Promise<SqlResult | null>;
    t: TFunction;
}

export function useMysqlRowEditing({
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
}: UseMysqlRowEditingOptions) {
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
    const [editValue, setEditValue] = useState("");
    const [newRows, setNewRows] = useState<Record<string, any>[]>([]);
    const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);
    const [rowViewerOpen, setRowViewerOpen] = useState(false);
    const [rowViewerMode, setRowViewerMode] = useState<RowViewerMode>("view");
    const [viewingRowSource, setViewingRowSource] = useState<ViewingRowSource>("existing");
    const [viewingRow, setViewingRow] = useState<Record<string, any> | null>(null);
    const [viewingRowIndex, setViewingRowIndex] = useState(-1);

    const selectedRowIndexSet = useMemo(() => new Set(selectedRowIndices), [selectedRowIndices]);
    const noPrimaryKeyMessage = t("common.noPrimaryKey", "Cannot update/delete: table has no primary key");

    const updateExistingRowLocally = useCallback((rowIndex: number, nextRow: Record<string, any>) => {
        setResult((previousResult) => {
            if (!previousResult) {
                return previousResult;
            }

            const updatedRows = [...previousResult.rows];
            updatedRows[rowIndex] = nextRow;
            return { ...previousResult, rows: updatedRows };
        });
    }, [setResult]);

    const handleCellEdit = useCallback((rowIdx: number, colName: string, currentValue: any, isNewRow: boolean) => {
        setEditingCell({ rowIdx, colName, isNewRow });
        setEditValue(
            currentValue === null
                ? ""
                : typeof currentValue === "object"
                    ? JSON.stringify(currentValue)
                    : String(currentValue),
        );
    }, []);

    const handleCellCancel = useCallback(() => {
        setEditingCell(null);
        setEditValue("");
    }, []);

    const updateExistingCellValue = useCallback(async (rowIdx: number, colName: string, value: any) => {
        if (!result || !dbName || !tableName) {
            return;
        }

        const originalRow = result.rows[rowIdx];
        const nextRow = {
            ...originalRow,
            [colName]: normalizeEditableValue(value),
        };

        const updateSql = buildUpdateSql(
            dbName,
            tableName,
            originalRow,
            nextRow,
            primaryKeys,
            noPrimaryKeyMessage,
        );

        if (!updateSql) {
            return;
        }

        await invokeSql({
            connectionId,
            sql: updateSql,
            dbName,
        });

        updateExistingRowLocally(rowIdx, nextRow);
    }, [
        connectionId,
        dbName,
        noPrimaryKeyMessage,
        primaryKeys,
        result,
        tableName,
        updateExistingRowLocally,
    ]);

    const handleCellSubmit = useCallback(async () => {
        if (!editingCell) {
            return;
        }

        const { rowIdx, colName, isNewRow } = editingCell;

        if (isNewRow) {
            setNewRows((previousRows) => {
                const nextRows = [...previousRows];
                nextRows[rowIdx] = {
                    ...nextRows[rowIdx],
                    [colName]: normalizeEditableValue(editValue),
                };
                return nextRows;
            });
            setEditingCell(null);
            return;
        }

        try {
            await updateExistingCellValue(rowIdx, colName, editValue);
            setEditingCell(null);
        } catch (submitError: any) {
            console.error("Update failed:", submitError);
            setError(typeof submitError === "string" ? submitError : JSON.stringify(submitError));
        }
    }, [editValue, editingCell, setError, updateExistingCellValue]);

    const openExistingRowViewer = useCallback((row: Record<string, any>, rowIndex: number) => {
        setViewingRow(row);
        setViewingRowIndex(rowIndex);
        setViewingRowSource("existing");
        setRowViewerMode("view");
        setRowViewerOpen(true);
    }, []);

    const openNewBufferedRowViewer = useCallback((row: Record<string, any>, rowIndex: number) => {
        setViewingRow(row);
        setViewingRowIndex(rowIndex);
        setViewingRowSource("new");
        setRowViewerMode("create");
        setRowViewerOpen(true);
    }, []);

    const handleAddNewRow = useCallback(async () => {
        try {
            const columns = await ensureTableColumns();
            if (columns.length === 0) {
                setError(t("common.noColumnsFound", "Table column information not found, cannot add row"));
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
            console.error("Failed to fetch table structure for adding row:", schemaError);
            setError(
                t("common.fetchSchemaFailed", "Failed to fetch table structure ")
                + (schemaError?.message || String(schemaError)),
            );
        }
    }, [ensureTableColumns, setError, t]);

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
        if (!result || !dbName || !tableName) {
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
            const deleteSql = buildDeleteSql(
                dbName,
                tableName,
                result.rows[rowIdx],
                primaryKeys,
                noPrimaryKeyMessage,
            );

            await invokeSql({
                connectionId,
                sql: deleteSql,
                dbName,
            });

            setResult((previousResult) => {
                if (!previousResult) {
                    return previousResult;
                }

                const updatedRows = previousResult.rows.filter((_, index) => index !== rowIdx);
                return { ...previousResult, rows: updatedRows };
            });

            setSelectedRowIndices((previousIndices) => (
                previousIndices
                    .filter((index) => index !== rowIdx)
                    .map((index) => (index > rowIdx ? index - 1 : index))
            ));
        } catch (deleteError: any) {
            console.error("Delete failed:", deleteError);
            setError(typeof deleteError === "string" ? deleteError : JSON.stringify(deleteError));
        }
    }, [
        connectionId,
        dbName,
        noPrimaryKeyMessage,
        primaryKeys,
        result,
        setError,
        setResult,
        t,
        tableName,
    ]);

    const handleRowDelete = useCallback(async () => {
        if (!result || !dbName || !tableName || selectedRowIndices.length === 0) {
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
            const deletions = selectedRowIndices.map((rowIdx) => invokeSql({
                connectionId,
                sql: buildDeleteSql(dbName, tableName, result.rows[rowIdx], primaryKeys, noPrimaryKeyMessage),
                dbName,
            }));

            const settled = await Promise.allSettled(deletions);
            const failedCount = settled.filter((item) => item.status === "rejected").length;

            if (failedCount > 0) {
                setError(t("common.someRowsFailed", "Some rows failed to submit, please check your data."));
            }

            await refresh(executedSql);
            setSelectedRowIndices([]);
        } catch (deleteError: any) {
            console.error("Delete failed:", deleteError);
            setError(typeof deleteError === "string" ? deleteError : JSON.stringify(deleteError));
        }
    }, [
        connectionId,
        dbName,
        executedSql,
        noPrimaryKeyMessage,
        primaryKeys,
        refresh,
        result,
        selectedRowIndices,
        setError,
        t,
        tableName,
    ]);

    const handleSubmitChanges = useCallback(async () => {
        if (!dbName || !tableName || !result || newRows.length === 0) {
            return;
        }

        const insertSqlList = newRows.map((row) => buildInsertSql(dbName, tableName, row));
        const failedRows: Record<string, any>[] = [];
        let successCount = 0;

        const settled = await Promise.allSettled(
            insertSqlList.map((insertSql, index) => {
                if (!insertSql) {
                    failedRows.push(newRows[index]);
                    return Promise.reject(new Error("Empty row"));
                }

                return invokeSql({
                    connectionId,
                    sql: insertSql,
                    dbName,
                });
            }),
        );

        settled.forEach((item, index) => {
            if (item.status === "fulfilled") {
                successCount += 1;
                return;
            }

            if (insertSqlList[index]) {
                failedRows.push(newRows[index]);
            }
        });

        setNewRows(failedRows);

        if (successCount > 0) {
            await refresh(executedSql);
        }

        if (failedRows.length > 0) {
            setError(t("common.someRowsFailed", "部分行提交失败，请检查数据。"));
        }
    }, [
        connectionId,
        dbName,
        executedSql,
        newRows,
        refresh,
        result,
        setError,
        t,
        tableName,
    ]);

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

    const removeNewRow = useCallback((rowIdx: number) => {
        setNewRows((previousRows) => previousRows.filter((_, index) => index !== rowIdx));
    }, []);

    const toggleRowSelection = useCallback((rowIdx: number) => {
        setSelectedRowIndices((previousIndices) => (
            previousIndices.includes(rowIdx)
                ? previousIndices.filter((index) => index !== rowIdx)
                : [...previousIndices, rowIdx]
        ));
    }, []);

    const selectAllRows = useCallback((rowIndices: number[]) => {
        setSelectedRowIndices(rowIndices);
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedRowIndices([]);
    }, []);

    const handleRowViewerSave = useCallback(async (editedRow: Record<string, any>) => {
        if (!result || !dbName || !tableName) {
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
            const insertSql = buildInsertSql(dbName, tableName, editedRow);
            if (!insertSql) {
                toast({
                    title: t("common.error", "Error"),
                    description: t("common.atLeastOneField", "Please fill in at least one field"),
                    variant: "destructive",
                });
                throw new Error("Empty row");
            }

            await invokeSql({
                connectionId,
                sql: insertSql,
                dbName,
            });

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
        const updateSql = buildUpdateSql(
            dbName,
            tableName,
            originalRow,
            editedRow,
            primaryKeys,
            noPrimaryKeyMessage,
        );

        if (!updateSql) {
            return;
        }

        try {
            await invokeSql({
                connectionId,
                sql: updateSql,
                dbName,
            });

            updateExistingRowLocally(viewingRowIndex, editedRow);
        } catch (updateError: any) {
            console.error("Update failed:", updateError);
            setError(typeof updateError === "string" ? updateError : JSON.stringify(updateError));
            throw updateError;
        }
    }, [
        connectionId,
        dbName,
        executedSql,
        noPrimaryKeyMessage,
        primaryKeys,
        refresh,
        result,
        rowViewerMode,
        setError,
        t,
        tableName,
        updateExistingRowLocally,
        viewingRowIndex,
        viewingRowSource,
    ]);

    return {
        editValue,
        editingCell,
        handleAddNewRow,
        handleCancelChanges,
        handleCellCancel,
        handleCellEdit,
        handleCellSubmit,
        handleCopyRow,
        handleCopySingleRow,
        handleDeleteSingleRow,
        handleRowDelete,
        handleRowViewerSave,
        handleSubmitChanges,
        newRows,
        openExistingRowViewer,
        openNewBufferedRowViewer,
        removeNewRow,
        rowViewerMode,
        rowViewerOpen,
        selectedRowIndexSet,
        selectedRowIndices,
        setEditValue,
        setRowViewerOpen,
        toggleRowSelection,
        clearSelection,
        selectAllRows,
        updateExistingCellValue,
        viewingRow,
        viewingRowIndex,
        viewingRowSource,
    };
}
