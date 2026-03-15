import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Play, Loader2, FileCode, Hash, Type, Calendar, Binary, Trash2, Plus, Copy, Check, X, ChevronLeft, ChevronRight, Filter, Pencil, Wand2, Eye, MousePointerClick, Database, AlignLeft, CheckCircle2 } from "lucide-react";
import { format as formatSql } from "sql-formatter";
import { FilterBuilder } from "@/components/workspace/mysql/FilterBuilder.tsx";
import { TextFormatterDialog } from "@/components/common/TextFormatterDialog.tsx";
import { RowViewerDialog } from "@/components/common/RowViewerDialog.tsx";
import Editor from "@monaco-editor/react";
import { Input } from "@/components/ui/input.tsx";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from "@/components/ui/context-menu.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { cn, transparentTheme } from "@/lib/utils.ts";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme.ts";
import { useAppStore } from "@/store/useAppStore.ts";
import { confirm, toast } from "@/hooks/useToast.ts";
import type { ColumnInfo, SqlResult } from "@/types/sql";
import { DEFAULT_PAGE_SIZE, DEBOUNCE_DELAY } from "@/constants/workspace";
import { autoAddLimit } from "@/hooks/usePagination";
import { useDDLPanelResize } from "@/hooks/useDDLPanelResize";
import { invokeSql } from "@/lib/api.ts";

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

export function MysqlWorkspace({ tabId, name, connectionId, initialSql, savedSql, dbName, tableName, savedResult }: MysqlWorkspaceProps) {
    const { t } = useTranslation();
    const isDark = useIsDarkTheme();
    const updateTab = useAppStore(state => state.updateTab);
    const addTab = useAppStore(state => state.addTab);

    const defaultSqlRef = useRef(savedSql || initialSql || "SELECT * FROM users");
    const sqlSyncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    //用于存储当前实际执行的SQL（不含分页），用于翻页时保持上下文，与编辑器中的 sql 分离
    const [executedSql, setExecutedSql] = useState(savedSql || initialSql || "SELECT * FROM users");
    const [result, setResult] = useState<SqlResult | null>(savedResult || null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // 编辑状态
    const [editingCell, setEditingCell] = useState<{ rowIdx: number, colName: string, isNewRow: boolean } | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [, setOriginalRows] = useState<Record<string, any>[]>([]);

    // 格式化查看状态
    const [formatterOpen, setFormatterOpen] = useState(false);
    const [formatterContent, setFormatterContent] = useState('');
    const [formatterReadOnly, setFormatterReadOnly] = useState(false);
    const [formatterOnSave, setFormatterOnSave] = useState<((val: string) => void) | undefined>(undefined);
    const [formatterTitle, setFormatterTitle] = useState('');

    // 行查看对话框状态
    const [rowViewerOpen, setRowViewerOpen] = useState(false);
    const [rowViewerMode, setRowViewerMode] = useState<'view' | 'edit' | 'create'>('view');
    const [viewingRowSource, setViewingRowSource] = useState<'existing' | 'new'>('existing');
    const [viewingRow, setViewingRow] = useState<Record<string, any> | null>(null);
    const [viewingRowIndex, setViewingRowIndex] = useState<number>(-1);


    // 分页状态
    const [currentPage, setCurrentPage] = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));

    // 主键信息
    const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);

    // 编辑控制状态
    const [isEditable, setIsEditable] = useState(false);
    const [editDisabledReason, setEditDisabledReason] = useState<string>('');

    // 判断是否为单表查询
    const isSingleTableQuery = (sql: string): boolean => {
        const trimmedSql = sql.trim().toUpperCase();

        // 只处理 SELECT 语句
        if (!trimmedSql.startsWith('SELECT')) {
            return false;
        }

        // 检测是否包含 JOIN 关键字
        const joinKeywords = ['JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'OUTER JOIN', 'CROSS JOIN'];
        if (joinKeywords.some(keyword => trimmedSql.includes(keyword))) {
            return false;
        }

        // 检测 FROM 子句中是否有多个表(逗号分隔)
        const fromMatch = trimmedSql.match(/FROM\s+(.+?)(?:WHERE|GROUP|ORDER|LIMIT|$)/i);
        if (fromMatch) {
            const fromClause = fromMatch[1].trim();
            // 简单检测:如果有逗号,可能是多表
            if (fromClause.includes(',')) {
                return false;
            }
        }

        return true;
    };

    // Sync SQL changes to global store (debounced)
    useEffect(() => {
        const timer = setTimeout(() => {
            updateTab(tabId, { savedResult: result });
        }, DEBOUNCE_DELAY);
        return () => clearTimeout(timer);
    }, [result, tabId, updateTab]);

    const [showDDL, setShowDDL] = useState(false);
    const [ddl, setDdl] = useState<string>("");
    const [isLoadingDDL, setIsLoadingDDL] = useState(false);
    const ddlPanelRef = useDDLPanelResize(ddl, showDDL, isLoadingDDL);

    // Table schema and primary keys cache to prevent redundant SQL calls
    const schemaPromiseRef = useRef<Promise<string[]> | null>(null);
    const lastSchemaTableRef = useRef<string>("");

    // Filter related state
    const [, setWhereClause] = useState("");
    const [filterColumns, setFilterColumns] = useState<ColumnInfo[]>([]);
    const [isLoadingFilterColumns, setIsLoadingFilterColumns] = useState(false);

    // Inline filter state (local filtering on fetched data)
    const [inlineFilters, setInlineFilters] = useState<Record<string, string>>({});


    const initialSqlExecuted = useRef(false);

    // If initialSql is provided (e.g. when opening a table), update state and run it
    // If initialSql is provided (e.g. when opening a table), update state and run it
    useEffect(() => {
        if (initialSql && !savedSql && !initialSqlExecuted.current) {
            initialSqlExecuted.current = true;
            const executeInitial = async () => {
                let baseSql = initialSql.trim();
                // Handle semicolon and existing limit removal
                if (baseSql.endsWith(';')) baseSql = baseSql.slice(0, -1).trim();
                baseSql = baseSql.replace(/\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?$/i, '');

                // Check if it's just comments
                const isJustComments = baseSql.trim().split('\n').every(line => line.trim().startsWith('--') || line.trim().startsWith('#') || line.trim() === '');
                if (isJustComments) {
                    if (editorRef.current) {
                        editorRef.current.setValue(baseSql + ';');
                    } else {
                        defaultSqlRef.current = baseSql + ';';
                    }
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

                // Add LIMIT
                finalSql += ` LIMIT ${pageSize}`;
                finalSql += ';';

                if (editorRef.current) {
                    editorRef.current.setValue(finalSql);
                } else {
                    defaultSqlRef.current = finalSql;
                }
                setExecutedSql(finalSql);
                executeSql(finalSql, keys, true);
            };

            executeInitial();
        }
    }, [initialSql]);

    // Load DDL when panel is opened or table changes
    useEffect(() => {
        if (showDDL && dbName && tableName) {
            loadDDL();
        }
    }, [showDDL, dbName, tableName]);



    // 检测表的主键，返回主键数组。同时获取列信息用于自动补全和筛选。
    const detectPrimaryKeys = async (forceRefresh: boolean = false): Promise<string[]> => {
        if (!dbName || !tableName) {
            setPrimaryKeys([]);
            return [];
        }

        const currentTableKey = `${dbName}.${tableName}`;

        // Return cached promise if it belongs to the same table
        if (!forceRefresh && schemaPromiseRef.current && lastSchemaTableRef.current === currentTableKey) {
            return schemaPromiseRef.current;
        }

        // If not forcing refresh and we already have state for this table, we could return resolved.
        // But for consistency and simplicity during initial race, the ref is the source of truth.

        lastSchemaTableRef.current = currentTableKey;
        schemaPromiseRef.current = (async () => {
            setIsLoadingFilterColumns(true);
            try {
                // Using SHOW FULL COLUMNS which provides everything: PK, type, comments
                const sql = `SHOW FULL COLUMNS FROM \`${dbName}\`.\`${tableName}\``;
                const res = await invokeSql<SqlResult>({
                    connectionId,
                    sql,
                    dbName
                });

                if (res.rows && res.rows.length > 0) {
                    // 1. Extract columns for filters and auto-add rows
                    const cols: ColumnInfo[] = res.rows.map(row => ({
                        name: (row.Field || row.field || Object.values(row)[0]) as string,
                        type_name: (row.Type || row.type || Object.values(row)[1] || 'text') as string,
                        comment: (row.Comment || row.comment || '') as string
                    }));
                    setFilterColumns(cols);

                    // 2. Extract columns with comments for Monaco autocomplete
                    columnsWithCommentRef.current = res.rows.map(row => ({
                        name: (row.Field || row.field || Object.values(row)[0]) as string,
                        type: (row.Type || row.type || Object.values(row)[1] || 'text') as string,
                        comment: (row.Comment || row.comment || '') as string,
                    }));

                    // 3. Extract primary keys
                    const keys = res.rows
                        .filter(row => (row.Key || row.key || '').toString().toUpperCase() === 'PRI')
                        .map(row => (row.Field || row.field || Object.values(row)[0]) as string);

                    setPrimaryKeys(keys);
                    return keys;
                }
                return [];
            } catch (err) {
                console.error("Failed to detect primary keys:", err);
                return [];
            } finally {
                setIsLoadingFilterColumns(false);
            }
        })();

        return schemaPromiseRef.current;
    };

    // 生成 WHERE 子句（基于主键）
    const generateWhereClause = (row: Record<string, any>): string => {
        if (primaryKeys.length === 0) {
            throw new Error(t('common.noPrimaryKey', '无法更新/删除：表没有主键'));
        }

        const conditions = primaryKeys.map(key => {
            const value = row[key];
            if (value === null || value === undefined) {
                return `\`${key}\` IS NULL`;
            }
            // 转义单引号
            const escapedValue = String(value).replace(/'/g, "''");
            return `\`${key}\` = '${escapedValue}'`;
        });

        return conditions.join(' AND ');
    };

    // 处理单元格编辑
    const handleCellEdit = (rowIdx: number, colName: string, currentValue: any, isNewRow: boolean) => {
        setEditingCell({ rowIdx, colName, isNewRow });
        setEditValue(currentValue === null ? '' : (typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue)));
    };

    // 提交单元格编辑
    const handleCellSubmit = async () => {
        if (!editingCell) return;

        const { rowIdx, colName, isNewRow } = editingCell;

        if (isNewRow) {
            // 更新新增行的数据
            const updatedNewRows = [...newRows];
            updatedNewRows[rowIdx] = {
                ...updatedNewRows[rowIdx],
                [colName]: editValue === '' ? null : editValue
            };
            setNewRows(updatedNewRows);
            setEditingCell(null);
            return;
        }

        // 更新现有行
        if (!result || !dbName || !tableName) return;

        const row = result.rows[rowIdx];
        const oldValue = row[colName];
        const newValue = editValue === '' ? null : editValue;

        // 如果值没有变化，直接取消
        if (oldValue === newValue) {
            setEditingCell(null);
            return;
        }

        try {
            const whereClause = generateWhereClause(row);
            const valueStr = newValue === null ? 'NULL' : `'${String(newValue).replace(/'/g, "''")}'`;
            const updateSql = `UPDATE \`${dbName}\`.\`${tableName}\` SET \`${colName}\` = ${valueStr} WHERE ${whereClause}`;

            await invokeSql({
                connectionId,
                sql: updateSql,
                dbName
            });
            // 更新本地数据
            const updatedRows = [...result.rows];
            updatedRows[rowIdx] = { ...updatedRows[rowIdx], [colName]: newValue };
            setResult({ ...result, rows: updatedRows });
            setOriginalRows(updatedRows);

            setEditingCell(null);
        } catch (err: any) {
            console.error("Update failed:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));
        }
    };

    // 取消单元格编辑
    const handleCellCancel = () => {
        setEditingCell(null);
        setEditValue('');
    };



    // 新增行状态
    const [newRows, setNewRows] = useState<Record<string, any>[]>([]);
    const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);
    // 添加新行
    // 添加新行
    const handleAddNewRow = async () => {
        let cols = result?.columns;

        // 如果没有列信息且有表名，尝试抓取一次结构
        if ((!cols || cols.length === 0) && dbName && tableName) {
            setIsLoading(true);
            try {
                // 优先尝试从 INFORMATION_SCHEMA 获取以保证跨 SQL 模式兼容性，或者简单的 LIMIT 0
                const schemaSql = `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 0`;
                const res = await invokeSql<SqlResult>({
                    connectionId,
                    sql: schemaSql,
                    dbName
                });

                if (res.columns && res.columns.length > 0) {
                    cols = res.columns;
                    setResult(res);
                } else {
                    // 如果 LIMIT 0 不行（极少见），尝试 DESCRIBE
                    const describeRes = await invokeSql<SqlResult>({
                        connectionId,
                        sql: `DESCRIBE \`${dbName}\`.\`${tableName}\``,
                        dbName
                    });
                    // DESCRIBE 返回的是行，我们需要转换成 columns 结构
                    if (describeRes.rows && describeRes.rows.length > 0) {
                        cols = describeRes.rows.map(r => ({
                            name: (r.Field || r.column_name || Object.values(r)[0]) as string,
                            type_name: (r.Type || r.data_type || 'text') as string
                        }));
                        const mockResult: SqlResult = {
                            columns: cols,
                            rows: [],
                            affected_rows: 0
                        };
                        setResult(mockResult);
                    }
                }
            } catch (err: any) {
                console.error("Failed to fetch table structure for adding row:", err);
                setError(t('common.fetchSchemaFailed', '无法获取表结构信息: ') + (err.message || String(err)));
                setIsLoading(false);
                return;
            }
            setIsLoading(false);
        }

        if (cols && cols.length > 0) {
            const emptyRow: Record<string, any> = {};
            cols.forEach(col => {
                emptyRow[col.name] = null;
            });

            setViewingRow(emptyRow);
            setRowViewerMode('create');
            setViewingRowSource('new');
            setViewingRowIndex(-1);
            setRowViewerOpen(true);
        } else {
            setError(t('common.noColumnsFound', '未找到表的列信息，无法新增行'));
        }
    };




    // 复制选中的行
    const handleCopyRow = () => {
        if (!result || selectedRowIndices.length === 0) return;

        // 如果只选中了一行，使用弹窗编辑模式
        if (selectedRowIndices.length === 1) {
            handleCopySingleRow(selectedRowIndices[0]);
            return;
        }

        const copiedRows: Record<string, any>[] = [];

        selectedRowIndices.forEach(rowIdx => {
            const rowToCopy = result.rows[rowIdx];
            const copiedRow = { ...rowToCopy };

            // 清空主键字段（让数据库自动生成）
            primaryKeys.forEach(key => {
                copiedRow[key] = null;
            });

            copiedRows.push(copiedRow);
        });

        setNewRows([...newRows, ...copiedRows]);
    };

    // 删除选中的行
    const handleRowDelete = async () => {
        if (!result || !dbName || !tableName || selectedRowIndices.length === 0) return;

        const confirmed = await confirm({
            title: t('common.confirmDeletion'),
            description: t('common.confirmDeleteRows', { count: selectedRowIndices.length }),
            variant: 'destructive'
        });
        if (!confirmed) return;

        try {
            // 批量删除
            for (const rowIdx of selectedRowIndices) {
                const row = result.rows[rowIdx];
                const whereClause = generateWhereClause(row);
                const deleteSql = `DELETE FROM \`${dbName}\`.\`${tableName}\` WHERE ${whereClause}`;

                await invokeSql({
                    connectionId,
                    sql: deleteSql,
                    dbName
                });
            }

            // 更新本地数据
            const updatedRows = result.rows.filter((_, idx) => !selectedRowIndices.includes(idx));
            setResult({ ...result, rows: updatedRows });
            setOriginalRows(updatedRows);
            setSelectedRowIndices([]);
        } catch (err: any) {
            console.error("Delete failed:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));
        }
    };

    // 复制单行
    const handleCopySingleRow = (rowIdx: number) => {
        if (!result) return;

        const rowToCopy = result.rows[rowIdx];
        const copiedRow = { ...rowToCopy };

        // 清空主键字段（让数据库自动生成）
        primaryKeys.forEach(key => {
            copiedRow[key] = null;
        });

        // 先加入到 newRows
        const nextIndex = newRows.length;
        setNewRows([...newRows, copiedRow]);

        // 然后打开编辑框，指向 newRows 中的该行
        setViewingRow(copiedRow);
        setRowViewerMode('create');
        setViewingRowSource('new');
        setViewingRowIndex(nextIndex);
        setRowViewerOpen(true);
    };

    // 删除单行
    const handleDeleteSingleRow = async (rowIdx: number) => {
        if (!result || !dbName || !tableName) return;

        const confirmed = await confirm({
            title: t('common.confirmDeletion'),
            description: t('common.confirmDeleteRow'),
            variant: 'destructive'
        });
        if (!confirmed) return;

        try {
            const row = result.rows[rowIdx];
            const whereClause = generateWhereClause(row);
            const deleteSql = `DELETE FROM \`${dbName}\`.\`${tableName}\` WHERE ${whereClause}`;

            await invokeSql({
                connectionId,
                sql: deleteSql,
                dbName
            });
            // 更新本地数据
            const updatedRows = result.rows.filter((_, idx) => idx !== rowIdx);
            setResult({ ...result, rows: updatedRows });
            setOriginalRows(updatedRows);
            // 如果删除的行在选中列表中，也移除
            setSelectedRowIndices(selectedRowIndices.filter(idx => idx !== rowIdx).map(idx => idx > rowIdx ? idx - 1 : idx));
        } catch (err: any) {
            console.error("Delete failed:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));
        }
    };

    // 提交所有新增行
    const handleSubmitChanges = async () => {
        if (!dbName || !tableName || !result || newRows.length === 0) return;

        const failedRows = [];
        let successCount = 0;

        setIsLoading(true);

        // 倒序处理
        for (let i = 0; i < newRows.length; i++) {
            const row = newRows[i];
            const fields: string[] = [];
            const values: string[] = [];

            Object.entries(row).forEach(([key, value]) => {
                if (value !== null && value !== '') {
                    fields.push(`\`${key}\``);
                    const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                    const escapedValue = strValue.replace(/'/g, "''");
                    values.push(`'${escapedValue}'`);
                }
            });

            if (fields.length === 0) {
                failedRows.push(row);
                continue;
            }

            const insertSql = `INSERT INTO \`${dbName}\`.\`${tableName}\` (${fields.join(', ')}) VALUES (${values.join(', ')})`;

            try {
                await invokeSql({
                    connectionId,
                    sql: insertSql,
                    dbName
                });
                successCount++;
            } catch (err: any) {
                console.error("Insert failed:", err);
                failedRows.push(row);
                setError(t('common.someRowsFailed', '有 {{count}} 行提交失败，请检查数据。错误信息: {{error}}', {
                    count: failedRows.length,
                    error: err.message || err // 这里会显示错误的具体信息
                }));
            }
        }

        setNewRows(failedRows);
        setIsLoading(false);

    };

    // 取消所有修改（清空新增行）
    const handleCancelChanges = async () => {
        const confirmed = await confirm({
            title: t('common.confirmDeletion'),
            description: t('common.confirmCancelChanges'),
            variant: 'default'
        });
        if (confirmed) {
            setNewRows([]);
        }
    };

    // 处理分页变化
    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        // 重新执行查询
        const processedSql = autoAddLimit(executedSql, pageSize, newPage * pageSize);
        executeSql(processedSql);
    };

    // 处理页面大小变化


    const loadDDL = async () => {
        if (!dbName || !tableName) return;

        setIsLoadingDDL(true);
        const sql = `SHOW CREATE TABLE \`${dbName}\`.\`${tableName}\``;

        try {
            // Use execute_sql to get create table statement
            const res = await invokeSql<SqlResult>({
                connectionId,
                sql
            });

            if (res.rows.length > 0) {
                const row = res.rows[0];

                // Strategy 1: Search for value starting with CREATE TABLE/VIEW
                // This is the most robust way as it ignores column names
                const values = Object.values(row);
                const ddlValue = values.find(v =>
                    typeof v === 'string' && (
                        v.trim().toUpperCase().startsWith('CREATE TABLE') ||
                        v.trim().toUpperCase().startsWith('CREATE VIEW')
                    )
                );

                if (ddlValue) {
                    setDdl(ddlValue as string);
                } else {
                    // Fallback: try second column if exists
                    if (res.columns.length >= 2) {
                        const ddlColName = res.columns[1].name;
                        if (row[ddlColName]) {
                            setDdl(row[ddlColName] as string);
                        } else {
                            setDdl("-- DDL not found in result row.");
                        }
                    } else {
                        setDdl("-- DDL structure unrecognized: " + JSON.stringify(row, null, 2));
                    }
                }
            } else {
                setDdl("-- No results returned for SHOW CREATE TABLE");
            }
        } catch (err: any) {
            console.error("Failed to load DDL:", err);
            setDdl(`-- Failed to load DDL: ${typeof err === 'string' ? err : JSON.stringify(err)}`);
        } finally {
            setIsLoadingDDL(false);
        }
    };

    const executeSql = async (query: string, knownKeys?: string[], isInitialOpen?: boolean) => {
        if (!query.trim()) return;

        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const data = await invokeSql<SqlResult>({
                connectionId,
                sql: query,
                dbName
            });

            if (isInitialOpen && (!data.rows || data.rows.length === 0) && (!data.columns || data.columns.length === 0) && dbName && tableName) {
                if (columnsWithCommentRef.current && columnsWithCommentRef.current.length > 0) {
                    data.columns = columnsWithCommentRef.current.map(col => ({
                        name: col.name,
                        type_name: col.type,
                        comment: col.comment
                    }));
                }
            }

            // Merge comments from columnsWithCommentRef if available
            if (data.columns && columnsWithCommentRef.current.length > 0) {
                data.columns.forEach(col => {
                    const match = columnsWithCommentRef.current.find(c => c.name === col.name);
                    if (match && match.comment) {
                        col.comment = match.comment;
                    }
                });
            }

            // Check if columns changed
            let columnsChanged = true;
            if (result?.columns && data.columns && result.columns.length === data.columns.length) {
                columnsChanged = !result.columns.every((col, i) =>
                    col.name === data.columns[i].name && col.type_name === data.columns[i].type_name
                );
            }

            if (!columnsChanged && result?.columns) {
                // Keep the old columns reference to prevent useEffect from resetting column widths
                data.columns = result.columns;
            }

            setResult(data);
            setOriginalRows(data.rows);

            // 对于非查询语句（DDL/DML），如果没有返回列信息, 显示成功提示
            const trimmedUpper = query.trim().replace(/^[\s;]+/, '').toUpperCase();
            const isNonSelectStatement = !trimmedUpper.startsWith('SELECT') && !trimmedUpper.startsWith('SHOW') && !trimmedUpper.startsWith('DESCRIBE') && !trimmedUpper.startsWith('DESC') && !trimmedUpper.startsWith('EXPLAIN');
            if (isNonSelectStatement && (!data.columns || data.columns.length === 0)) {
                const stmtType = trimmedUpper.split(/\s+/)[0]; // ALTER, CREATE, DROP, INSERT, UPDATE, DELETE, etc.
                const affectedInfo = data.affected_rows > 0 ? `，影响行数: ${data.affected_rows}` : '';
                setSuccessMessage(`${stmtType} 语句执行成功${affectedInfo}`);
                toast({
                    title: t('common.success', '执行成功'),
                    description: `${stmtType} 语句执行成功${affectedInfo}`,
                    duration: 3000
                });
            } else {
                setSuccessMessage(null);
            }
            // 更新筛选器的列信息
            if (data.columns && data.columns.length > 0) {
                setFilterColumns(data.columns);
            }
            // 如果是表查询,检测主键
            if (dbName && tableName) {
                const keys = knownKeys || await detectPrimaryKeys();

                // 直接使用返回的主键数组判断是否可编辑
                if (keys.length > 0 && isSingleTableQuery(query)) {
                    setIsEditable(true);
                    setEditDisabledReason('');
                } else if (keys.length === 0) {
                    setIsEditable(false);
                    setEditDisabledReason('表没有主键,无法编辑');
                } else {
                    setIsEditable(false);
                    setEditDisabledReason('多表查询不支持直接编辑,请使用 UPDATE 语句');
                }
            } else if (!isSingleTableQuery(query)) {
                setIsEditable(false);
                setEditDisabledReason('多表查询不支持直接编辑,请使用 UPDATE 语句');
            } else {
                setIsEditable(false);
                setEditDisabledReason('当前查询不支持编辑');
            }
        } catch (err: any) {
            console.error("Execute SQL failed:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));
        } finally {
            setIsLoading(false);
        }
    };

    const editorRef = useRef<any>(null);
    const completionDisposableRef = useRef<any>(null);
    // Store columns with comment for autocomplete (populated by SHOW FULL COLUMNS)
    const columnsWithCommentRef = useRef<Array<{ name: string; type: string; comment: string }>>([]);

    // Cleanup completion provider on unmount
    useEffect(() => {
        return () => {
            if (completionDisposableRef.current) {
                completionDisposableRef.current.dispose();
                completionDisposableRef.current = null;
            }
        };
    }, []);

    const handleExecute = () => {
        // Update page size from input map
        const newPageSize = parseInt(pageSizeInput);

        if (!isNaN(newPageSize) && newPageSize > 0) {
            setPageSize(newPageSize);
        }

        let sqlToExecute = '';

        if (editorRef.current) {
            const selection = editorRef.current.getSelection();
            if (selection && !selection.isEmpty()) {
                const selectedText = editorRef.current.getModel().getValueInRange(selection);
                if (selectedText.trim()) {
                    sqlToExecute = selectedText.trim();
                }
            }
            if (!sqlToExecute) {
                sqlToExecute = editorRef.current.getValue().trim();
            }
        } else {
            sqlToExecute = defaultSqlRef.current.trim();
        }

        if (sqlToExecute) {
            if (sqlToExecute.endsWith(';')) {
                sqlToExecute = sqlToExecute.slice(0, -1).trim();
            }
            sqlToExecute += ';';
        }

        if (!sqlToExecute) return;

        setExecutedSql(sqlToExecute);
        setCurrentPage(0);
        executeSql(sqlToExecute);
    };

    const handleFormatSql = () => {
        try {
            if (editorRef.current) {
                const selection = editorRef.current.getSelection();
                if (selection && !selection.isEmpty()) {
                    const selectedText = editorRef.current.getModel().getValueInRange(selection);
                    if (selectedText.trim()) {
                        const formattedSelected = formatSql(selectedText, { language: 'mysql' });
                        editorRef.current.executeEdits(null, [{
                            range: selection,
                            text: formattedSelected,
                            forceMoveMarkers: true
                        }]);
                        return;
                    }
                }
                const currentSql = editorRef.current.getValue();
                const formatted = formatSql(currentSql, { language: 'mysql' });
                const model = editorRef.current.getModel();
                editorRef.current.executeEdits(null, [{
                    range: model.getFullModelRange(),
                    text: formatted,
                    forceMoveMarkers: true
                }]);
            }
        } catch (e: any) {
            toast({
                title: t('common.formatFailed', '格式化失败'),
                description: e.message || String(e),
                variant: 'destructive',
                duration: 3000
            });
        }
    };

    const getColumnTypeIcon = (typeName: string) => {
        const type = typeName.toUpperCase();
        if (type.includes("INT") || type.includes("FLOAT") || type.includes("DOUBLE") || type.includes("DECIMAL") || type.includes("BOOL")) {
            return <Hash className="h-3 w-3 text-blue-500" />;
        }
        if (type.includes("CHAR") || type.includes("TEXT") || type.includes("ENUM")) {
            return <Type className="h-3 w-3 text-orange-500" />;
        }
        if (type.includes("DATE") || type.includes("TIME")) {
            return <Calendar className="h-3 w-3 text-green-500" />;
        }
        if (type.includes("BLOB") || type.includes("BINARY")) {
            return <Binary className="h-3 w-3 text-purple-500" />;
        }
        return <Type className="h-3 w-3 text-gray-500" />;
    };

    // Compute filtered rows based on inline filters (memoized)
    const filteredRows = useMemo(() => {
        if (!result) return [];
        const activeFilters = Object.entries(inlineFilters).filter(([_, value]) => value.trim() !== '');
        if (activeFilters.length === 0) return result.rows;

        return result.rows.filter(row => {
            return activeFilters.every(([colName, filterValue]) => {
                const cellValue = row[colName];
                if (cellValue === null || cellValue === undefined) {
                    return filterValue.toLowerCase() === 'null';
                }
                const strValue = typeof cellValue === 'object' ? JSON.stringify(cellValue) : String(cellValue);
                return strValue.toLowerCase().includes(filterValue.toLowerCase());
            });
        });
    }, [result, inlineFilters]);

    const hasActiveInlineFilters = useMemo(() =>
        Object.values(inlineFilters).some(v => v.trim() !== ''),
        [inlineFilters]
    );





    const connection = useAppStore(state => state.connections.find(c => c.id === connectionId));
    const connectionName = connection?.name || name;

    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
    const resizingRef = useRef<{ colName: string, startX: number, startWidth: number, colIndex: number, startTotalWidth: number } | null>(null);
    const parentRef = useRef<HTMLDivElement>(null); // 滚动容器 ref
    const tableContainerRef = useRef<HTMLDivElement>(null);



    useEffect(() => {
        if (!result?.columns) {
            setColumnWidths({});
            return;
        }
        const widths: Record<string, number> = {};
        result.columns.forEach(col => {
            const type = col.type_name.toUpperCase();

            // Calculate width based on name and type length
            const nameWidth = col.name.length * 8.5 + 12;
            const typeWidth = col.type_name.length * 8.5 + 12; // type name + icon space

            let width = Math.max(110, nameWidth, typeWidth);

            if (type.includes("DATE") || type.includes("TIME") || type.includes("TIMESTAMP")) {
                width = Math.max(150, width);
            }

            widths[col.name] = width;
        });
        setColumnWidths(widths);
    }, [result?.columns]);

    const handleResizeStart = (e: React.MouseEvent, colName: string, colIndex: number) => {
        e.preventDefault();
        e.stopPropagation();
        const startWidth = columnWidths[colName] || 120;
        const currentTotalWidth = totalTableWidth;
        resizingRef.current = { colName, startX: e.clientX, startWidth, colIndex, startTotalWidth: currentTotalWidth };

        const handleResizeMove = (e: MouseEvent) => {
            if (!resizingRef.current || !tableContainerRef.current) return;
            const { startX, startWidth, colIndex, startTotalWidth } = resizingRef.current;
            const diff = e.clientX - startX;
            const newWidth = Math.max(80, startWidth + diff); // Min width 80

            // Directly update CSS variables for performance
            tableContainerRef.current.style.setProperty(`--col-width-${colIndex}`, `${newWidth}px`);

            // Also update total width
            const newTotalWidth = startTotalWidth + (newWidth - startWidth);
            tableContainerRef.current.style.setProperty('--table-total-width', `${newTotalWidth}px`);
        };

        const handleResizeEnd = (e: MouseEvent) => {
            if (!resizingRef.current) return;
            const { colName, startX, startWidth } = resizingRef.current;
            const diff = e.clientX - startX;
            const newWidth = Math.max(80, startWidth + diff);

            resizingRef.current = null;
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
            document.body.style.cursor = '';

            setColumnWidths(prev => ({
                ...prev,
                [colName]: newWidth
            }));
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = 'col-resize';
    };

    const totalTableWidth = useMemo(() => {
        if (!result?.columns) return 0;
        const colsWidth = result.columns.reduce((acc, col) => acc + (columnWidths[col.name] || 120), 0);
        return colsWidth + (selectedRowIndices.length > 0 ? 50 : 0);
    }, [result?.columns, columnWidths, selectedRowIndices.length]);

    const tableCssVars = useMemo(() => {
        const vars: Record<string, string> = {
            '--table-total-width': `${totalTableWidth}px`
        };
        result?.columns.forEach((col, i) => {
            vars[`--col-width-${i}`] = `${columnWidths[col.name] || 120}px`;
        });
        return vars as React.CSSProperties;
    }, [columnWidths, totalTableWidth, result?.columns]);

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Toolbar */}
            <div className="p-2 flex gap-2 items-center bg-muted/30 justify-between">
                <div className="flex gap-2 items-center">
                    {/* 连接信息 */}
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/50 rounded">
                        <span className="text-sm font-semibold text-foreground whitespace-nowrap">{connectionName}</span>
                        {dbName && (
                            <>
                                <div className="h-3 w-[1px] bg-border mx-1"></div>
                                <span className="text-sm text-muted-foreground whitespace-nowrap">{dbName}</span>
                            </>
                        )}
                        {tableName && (
                            <>
                                <div className="h-3 w-[1px] bg-border mx-1"></div>
                                <span className="text-sm text-muted-foreground whitespace-nowrap">{tableName}</span>
                            </>
                        )}
                    </div>

                    <div className="h-4 w-[1px] bg-border mx-2"></div>

                    {/* 运行按钮 */}
                    <Button
                        size="sm"
                        onClick={handleExecute}
                        disabled={isLoading}
                        className="bg-green-600 hover:bg-green-700 text-white gap-1"
                        title={t('common.run', '执行')}
                    >
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {t('common.run', '执行')}
                    </Button>

                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleFormatSql}
                        disabled={isLoading}
                        className="gap-1"
                        title={t('common.formatSql', '美化')}
                    >
                        <AlignLeft className="h-3.5 w-3.5" />
                        {t('common.formatSql', '美化')}
                    </Button>

                    {/* 数据操作按钮 */}
                    {tableName && (
                        <>
                            <div className="h-4 w-[1px] bg-border mx-2"></div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleAddNewRow}
                                disabled={!isEditable}
                                className="gap-1.5"
                                title={!isEditable ? editDisabledReason : t('common.add', '新增')}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                {t('common.add', '新增')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCopyRow}
                                disabled={!isEditable || selectedRowIndices.length === 0}
                                title={!isEditable ? editDisabledReason : t('common.duplicate', '复制') + ` ${selectedRowIndices.length} ` + t('common.items', '条')}
                                className="gap-1.5"
                            >
                                <Copy className="h-3.5 w-3.5" />
                                {t('common.duplicate', '复制')} {selectedRowIndices.length > 0 && `(${selectedRowIndices.length})`}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleRowDelete}
                                disabled={!isEditable || selectedRowIndices.length === 0}
                                className="gap-1.5 text-red-600 hover:text-red-700"
                                title={!isEditable ? editDisabledReason : t('common.delete', '删除') + ` ${selectedRowIndices.length} ` + t('common.items', '条')}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t('common.delete', '删除')} {selectedRowIndices.length > 0 && `(${selectedRowIndices.length})`}
                            </Button>

                            {newRows.length > 0 && (
                                <>
                                    <div className="h-4 w-[1px] bg-border mx-2"></div>
                                    <Button
                                        size="sm"
                                        onClick={handleSubmitChanges}
                                        disabled={isLoading}
                                        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                        {t('common.submitChanges', '提交修改')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleCancelChanges}
                                        disabled={isLoading}
                                        className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                        {t('common.cancel', '取消')}
                                    </Button>
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className="flex gap-2 items-center">
                    {tableName && (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    if (!dbName || !tableName || !connection) return;
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
                                }}
                                title={t('mysql.viewSchema')}
                            >
                                <Database className="h-4 w-4 mr-1" />
                                {t('mysql.structure', 'Structure')}
                            </Button>
                            <Button
                                variant={showDDL ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setShowDDL(!showDDL)}
                                title="Show DDL"
                                className={cn(showDDL && "bg-muted")}
                            >
                                <FileCode className="h-4 w-4 mr-1" />
                                {t('mysql.viewDDL', 'DDL')}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* 筛选器 - 有表名时始终显示 */}
            {tableName && (filterColumns.length > 0 || isLoadingFilterColumns) && (
                <div className="px-4 py-1 bg-muted/20 border-b">
                    <FilterBuilder
                        columns={filterColumns}
                        primaryKeys={primaryKeys}
                        onChange={setWhereClause}
                        onExecute={(clause, orderBy) => {
                            if (!dbName || !tableName) return;

                            // Update page size from input map
                            const newPageSize = parseInt(pageSizeInput);
                            let currentSize = pageSize;
                            if (!isNaN(newPageSize) && newPageSize > 0) {
                                setPageSize(newPageSize);
                                currentSize = newPageSize;
                            }

                            let query = `SELECT * FROM \`${dbName}\`.\`${tableName}\``;
                            if (clause) {
                                query += ` WHERE ${clause}`;
                            }
                            if (orderBy) {
                                query += ` ORDER BY \`${orderBy.split(' ')[0]}\` ${orderBy.split(' ')[1]}`;
                            }
                            // 仅更新执行用的 SQL，不修改编辑器中的 SQL
                            setExecutedSql(query + ';');
                            const processedSql = autoAddLimit(query + ';', currentSize, 0);
                            setCurrentPage(0);
                            executeSql(processedSql);
                        }}
                    />
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                <ResizablePanelGroup direction="vertical">
                    <ResizablePanel defaultSize={showDDL ? 60 : 100} minSize={30}>
                        <div className="h-full flex flex-col">
                            {/* Query Area */}
                            <div className="h-1/3 py-1 bg-background border-b z-10 relative">
                                <Editor
                                    height="100%"
                                    language="mysql"
                                    theme={isDark ? "vs-dark" : "light"}
                                    defaultValue={defaultSqlRef.current}
                                    onMount={(editor, monaco) => {
                                        editorRef.current = editor;
                                        editor.onDidChangeModelContent(() => {
                                            if (sqlSyncTimer.current) {
                                                clearTimeout(sqlSyncTimer.current);
                                            }
                                            sqlSyncTimer.current = setTimeout(() => {
                                                updateTab(tabId, { currentSql: editor.getValue() });
                                            }, DEBOUNCE_DELAY);
                                        });

                                        // Register autocomplete provider once on mount
                                        // Uses existing data: columnsWithCommentRef (from SHOW FULL COLUMNS) + tablesCache (from store)
                                        completionDisposableRef.current = monaco.languages.registerCompletionItemProvider('mysql', {
                                            provideCompletionItems: (model: any, position: any) => {
                                                if (editorRef.current && model !== editorRef.current.getModel()) {
                                                    return { suggestions: [] };
                                                }
                                                const word = model.getWordUntilPosition(position);
                                                const range = {
                                                    startLineNumber: position.lineNumber,
                                                    endLineNumber: position.lineNumber,
                                                    startColumn: word.startColumn,
                                                    endColumn: word.endColumn,
                                                };
                                                const suggestions: any[] = [];

                                                // 0. MySQL keywords
                                                const keywords = [
                                                    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
                                                    'LIKE', 'BETWEEN', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
                                                    'AS', 'ON', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'CROSS',
                                                    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
                                                    'CREATE', 'ALTER', 'DROP', 'TABLE', 'DATABASE', 'INDEX', 'VIEW',
                                                    'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
                                                    'ASC', 'DESC', 'DISTINCT', 'ALL', 'UNION', 'EXCEPT', 'INTERSECT',
                                                    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'IF', 'IFNULL', 'COALESCE',
                                                    'CONCAT', 'SUBSTRING', 'LENGTH', 'TRIM', 'UPPER', 'LOWER',
                                                    'NOW', 'DATE', 'TIME', 'YEAR', 'MONTH', 'DAY',
                                                    'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT',
                                                    'AUTO_INCREMENT', 'DEFAULT', 'NOT NULL', 'UNIQUE', 'CHECK',
                                                    'VARCHAR', 'INT', 'BIGINT', 'TINYINT', 'SMALLINT', 'MEDIUMINT',
                                                    'FLOAT', 'DOUBLE', 'DECIMAL', 'CHAR', 'TEXT', 'BLOB',
                                                    'DATE', 'DATETIME', 'TIMESTAMP', 'BOOLEAN', 'ENUM', 'JSON',
                                                    'SHOW', 'DESCRIBE', 'EXPLAIN', 'USE', 'TRUNCATE',
                                                    'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION',
                                                    'GRANT', 'REVOKE', 'FLUSH', 'REPLACE',
                                                ];
                                                keywords.forEach(kw => {
                                                    suggestions.push({
                                                        label: kw,
                                                        kind: monaco.languages.CompletionItemKind.Keyword,
                                                        insertText: kw,
                                                        range,
                                                    });
                                                });

                                                // 1. Current table's columns (from SHOW FULL COLUMNS, stored in ref)
                                                columnsWithCommentRef.current.forEach(col => {
                                                    suggestions.push({
                                                        label: col.name,
                                                        kind: monaco.languages.CompletionItemKind.Field,
                                                        insertText: col.name,
                                                        detail: col.comment || undefined,
                                                        range,
                                                    });
                                                });

                                                // 2. Current database's tables (from store tablesCache)
                                                if (dbName) {
                                                    const cachedTables = useAppStore.getState().getTablesCache(connectionId, dbName);
                                                    if (cachedTables) {
                                                        cachedTables.forEach(t => {
                                                            suggestions.push({
                                                                label: t.name,
                                                                kind: monaco.languages.CompletionItemKind.Struct,
                                                                insertText: t.name,
                                                                range,
                                                            });
                                                        });
                                                    }
                                                }

                                                return { suggestions };
                                            },
                                        });
                                    }}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        wordWrap: 'on',
                                        lineNumbers: 'on',
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                        contextmenu: false,
                                    }}
                                />
                            </div>

                            {/* Result Area */}
                            <div className="flex-1 pb-1 overflow-hidden">
                                {error && (
                                    <div className="p-4 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm font-mono whitespace-pre-wrap flex items-start justify-between gap-2">
                                        <span>Error: {error}</span>
                                        <button
                                            onClick={() => setError(null)}
                                            className="text-red-400 hover:text-red-600 flex-shrink-0"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}

                                {result && result.columns && result.columns.length === 0 && successMessage && (
                                    <div className="h-full flex items-center justify-center">
                                        <div className="flex flex-col items-center gap-3 text-center p-8">
                                            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3">
                                                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-base font-medium text-foreground">{successMessage}</p>
                                                {result.affected_rows > 0 && (
                                                    <p className="text-sm text-muted-foreground">
                                                        {t('common.affectedRows', 'Affected Rows')}: {result.affected_rows}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {result && (result.columns && result.columns.length > 0 || !successMessage) && (
                                    <div className="h-full flex flex-col gap-0">
                                        {/* 单一滚动容器：同时处理横向和纵向滚动，滚动条在可视区域边缘 */}
                                        <div
                                            ref={parentRef}
                                            className="border rounded-md bg-background flex-1 overflow-auto"
                                            style={{
                                                WebkitOverflowScrolling: 'touch',
                                                transform: 'translateZ(0)'
                                            }}
                                        >
                                            {/* 表格宽度容器 */}
                                            <div
                                                ref={tableContainerRef}
                                                style={{
                                                    minWidth: `var(--table-total-width)`,
                                                    ...tableCssVars
                                                }}
                                            >
                                                <Table className="table-fixed" containerClassName="overflow-visible">
                                                    <colgroup>
                                                        {selectedRowIndices.length > 0 && <col style={{ width: '50px' }} />}
                                                        {result.columns.map((_, i) => (
                                                            <col key={i} style={{ width: `var(--col-width-${i})` }} />
                                                        ))}
                                                    </colgroup>
                                                    <TableHeader className="sticky top-0 bg-muted z-10">
                                                        <TableRow>
                                                            {/* 复选框列 - 只在有选中行时显示 */}
                                                            {selectedRowIndices.length > 0 && (
                                                                <TableHead className="w-[50px] min-w-[50px] p-0">
                                                                    <div className="flex items-center justify-center h-full w-full">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="cursor-pointer"
                                                                            checked={filteredRows.length > 0 && filteredRows.every(row => selectedRowIndices.includes(result.rows.indexOf(row)))}
                                                                            onChange={(e) => {
                                                                                if (e.target.checked) {
                                                                                    // 全选
                                                                                    const allIndices = filteredRows.map(row => result.rows.indexOf(row));
                                                                                    setSelectedRowIndices(allIndices);
                                                                                } else {
                                                                                    // 取消全选
                                                                                    setSelectedRowIndices([]);
                                                                                }
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </TableHead>
                                                            )}
                                                            {result.columns.map((col, i) => (
                                                                <TableHead
                                                                    key={i}
                                                                    className="whitespace-nowrap p-0"
                                                                >
                                                                    <div className={cn("flex items-center justify-between relative group h-full w-full", i === 0 && "px-2")}>
                                                                        <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0 truncate pr-2">
                                                                            <span className="font-semibold text-foreground truncate" title={col.name}>{col.name}</span>
                                                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                                                {getColumnTypeIcon(col.type_name)}
                                                                                <span className="lowercase truncate">({col.type_name})</span>
                                                                            </div>
                                                                        </div>
                                                                        {/* 筛选下拉菜单 */}
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    className={cn(
                                                                                        "absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 transition-all opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 bg-background/90 shadow-sm border border-border/50",
                                                                                        inlineFilters[col.name] && "text-blue-600 opacity-100"
                                                                                    )}
                                                                                >
                                                                                    <Filter className="h-3 w-3" />
                                                                                </Button>
                                                                            </DropdownMenuTrigger>
                                                                            <DropdownMenuContent align="end" className="w-48 max-h-60 overflow-auto">
                                                                                <DropdownMenuItem
                                                                                    onClick={() => setInlineFilters(prev => ({ ...prev, [col.name]: '' }))}
                                                                                    className="text-xs"
                                                                                >
                                                                                    (清除筛选)
                                                                                </DropdownMenuItem>
                                                                                <DropdownMenuSeparator />
                                                                                {(() => {
                                                                                    const uniqueValues = [...new Set(
                                                                                        result.rows.map(r => {
                                                                                            const v = r[col.name];
                                                                                            return v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                                                                                        })
                                                                                    )].slice(0, 50);
                                                                                    return uniqueValues.map((val, idx) => (
                                                                                        <DropdownMenuItem
                                                                                            key={idx}
                                                                                            onClick={() => setInlineFilters(prev => ({ ...prev, [col.name]: val }))}
                                                                                            className={cn(
                                                                                                "text-xs truncate",
                                                                                                inlineFilters[col.name] === val && "bg-accent"
                                                                                            )}
                                                                                        >
                                                                                            {val.length > 30 ? val.substring(0, 30) + '...' : val}
                                                                                        </DropdownMenuItem>
                                                                                    ));
                                                                                })()}
                                                                            </DropdownMenuContent>
                                                                        </DropdownMenu>

                                                                        {/* Resize Handle */}
                                                                        <div
                                                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors"
                                                                            onMouseDown={(e) => handleResizeStart(e, col.name, i)}
                                                                        />
                                                                    </div>
                                                                </TableHead>
                                                            ))}
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {/* 新增行 */}
                                                        {newRows.map((row, rowIdx) => (
                                                            <TableRow key={`new-${rowIdx}`} className="bg-blue-50/50 dark:bg-blue-950/20">
                                                                {/* 新增行的复选框列 - 只在有选中行时显示 */}
                                                                {selectedRowIndices.length > 0 && (
                                                                    <TableCell className="w-[50px] min-w-[50px]">
                                                                    </TableCell>
                                                                )}
                                                                {result.columns.map((col, colIdx) => (
                                                                    <TableCell
                                                                        key={colIdx}
                                                                        className="whitespace-nowrap"
                                                                    >
                                                                        {editingCell?.rowIdx === rowIdx && editingCell?.colName === col.name && editingCell?.isNewRow ? (
                                                                            <div className="relative w-full">
                                                                                <Input
                                                                                    value={editValue}
                                                                                    onChange={(e) => setEditValue(e.target.value)}
                                                                                    className="h-7 text-xs w-full pr-14"
                                                                                    autoFocus
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter') handleCellSubmit();
                                                                                        if (e.key === 'Escape') handleCellCancel();
                                                                                    }}
                                                                                />
                                                                                <div className="absolute right-0 top-0 h-full flex items-center gap-0.5 pr-1">
                                                                                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={handleCellSubmit}>
                                                                                        <Check className="h-3 w-3 text-green-600" />
                                                                                    </Button>
                                                                                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={handleCellCancel}>
                                                                                        <X className="h-3 w-3 text-red-600" />
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <ContextMenu>
                                                                                <ContextMenuTrigger asChild>
                                                                                    <div className="truncate cursor-context-menu">
                                                                                        {row[col.name] === null || row[col.name] === '' ? (
                                                                                            <span className="text-muted-foreground italic">NULL</span>
                                                                                        ) : (
                                                                                            typeof row[col.name] === 'object' ? JSON.stringify(row[col.name]) : String(row[col.name])
                                                                                        )}
                                                                                    </div>
                                                                                </ContextMenuTrigger>
                                                                                <ContextMenuContent>
                                                                                    <ContextMenuItem onClick={() => handleCellEdit(rowIdx, col.name, row[col.name], true)}>
                                                                                        <Pencil className="h-3 w-3 mr-2" />
                                                                                        {t('common.edit', '编辑')}
                                                                                    </ContextMenuItem>
                                                                                    <ContextMenuItem onClick={() => {
                                                                                        setViewingRow(row);
                                                                                        setViewingRowIndex(rowIdx);
                                                                                        setViewingRowSource('new');
                                                                                        setRowViewerMode('create');
                                                                                        setRowViewerOpen(true);
                                                                                    }}>
                                                                                        <Pencil className="h-3 w-3 mr-2" />
                                                                                        {t('common.editRow', '编辑行')}
                                                                                    </ContextMenuItem>
                                                                                    <ContextMenuSeparator />
                                                                                    <ContextMenuItem onClick={() => {
                                                                                        const updatedNewRows = [...newRows];
                                                                                        updatedNewRows.splice(rowIdx, 1);
                                                                                        setNewRows(updatedNewRows);
                                                                                    }} className="text-red-600 focus:text-red-600">
                                                                                        <Trash2 className="h-3 w-3 mr-2" />
                                                                                        {t('common.deleteRow', '删除行')}
                                                                                    </ContextMenuItem>
                                                                                </ContextMenuContent>
                                                                            </ContextMenu>
                                                                        )}
                                                                    </TableCell>
                                                                ))}

                                                            </TableRow>
                                                        ))}

                                                        {/* 现有行 */}
                                                        {filteredRows.map((row, virtualRowIdx) => {
                                                            // 找到原始行索引用于编辑操作
                                                            const originalRowIdx = result.rows.indexOf(row);
                                                            const isRowSelected = selectedRowIndices.includes(originalRowIdx);

                                                            return (
                                                                <TableRow
                                                                    key={virtualRowIdx}
                                                                    className="hover:bg-muted/50"
                                                                >
                                                                    {/* 复选框列 - 只在有选中行时显示 */}
                                                                    {selectedRowIndices.length > 0 && (
                                                                        <TableCell className="w-[50px] min-w-[50px] text-center">
                                                                            <input
                                                                                type="checkbox"
                                                                                className="cursor-pointer"
                                                                                checked={isRowSelected}
                                                                                onChange={(e) => {
                                                                                    if (e.target.checked) {
                                                                                        setSelectedRowIndices([...selectedRowIndices, originalRowIdx]);
                                                                                    } else {
                                                                                        setSelectedRowIndices(selectedRowIndices.filter(idx => idx !== originalRowIdx));
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </TableCell>
                                                                    )}
                                                                    {result.columns.map((col, colIdx) => (
                                                                        <TableCell
                                                                            key={colIdx}
                                                                            className="p-0 whitespace-nowrap"
                                                                        >
                                                                            {editingCell?.rowIdx === originalRowIdx && editingCell?.colName === col.name && !editingCell?.isNewRow ? (
                                                                                <div className="relative w-full px-2 py-1">
                                                                                    <Input
                                                                                        value={editValue}
                                                                                        onChange={(e) => setEditValue(e.target.value)}
                                                                                        className="h-7 text-xs w-full pr-14"
                                                                                        autoFocus
                                                                                        onKeyDown={(e) => {
                                                                                            if (e.key === 'Enter') handleCellSubmit();
                                                                                            if (e.key === 'Escape') handleCellCancel();
                                                                                        }}
                                                                                    />
                                                                                    <div className="absolute right-0 top-0 h-full flex items-center gap-0.5 pr-1">
                                                                                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={handleCellSubmit}>
                                                                                            <Check className="h-3 w-3 text-green-600" />
                                                                                        </Button>
                                                                                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={handleCellCancel}>
                                                                                            <X className="h-3 w-3 text-red-600" />
                                                                                        </Button>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <ContextMenu>
                                                                                    <ContextMenuTrigger asChild>
                                                                                        <div className={cn("py-2 cursor-context-menu min-h-[36px] flex items-center pr-2", colIdx === 0 && "pl-2")}>
                                                                                            {row[col.name] === null ? (
                                                                                                <span className="text-muted-foreground italic truncate">NULL</span>
                                                                                            ) : (
                                                                                                <span className="flex-1 truncate">{typeof row[col.name] === 'object' && row[col.name] !== null ? JSON.stringify(row[col.name]) : String(row[col.name])}</span>
                                                                                            )}
                                                                                        </div>
                                                                                    </ContextMenuTrigger>
                                                                                    <ContextMenuContent>
                                                                                        {/* 编辑 */}
                                                                                        {isEditable && (
                                                                                            <ContextMenuItem onClick={() => handleCellEdit(originalRowIdx, col.name, row[col.name], false)}>
                                                                                                <Pencil className="h-3 w-3 mr-2" />
                                                                                                {t('common.edit', '编辑')}
                                                                                            </ContextMenuItem>
                                                                                        )}

                                                                                        {/* 查看/编辑行 */}
                                                                                        <ContextMenuItem
                                                                                            onClick={() => {
                                                                                                setViewingRow(row);
                                                                                                setViewingRowIndex(originalRowIdx);
                                                                                                setViewingRowSource('existing');
                                                                                                setRowViewerMode('view');
                                                                                                setRowViewerOpen(true);
                                                                                            }}
                                                                                        >
                                                                                            {isEditable ? <Pencil className="h-3 w-3 mr-2" /> : <Eye className="h-3 w-3 mr-2" />}
                                                                                            {isEditable ? t('common.editRow', '编辑行') : t('common.viewRow', '查看行')}
                                                                                        </ContextMenuItem>

                                                                                        {/* 格式化 */}
                                                                                        <ContextMenuItem
                                                                                            onClick={() => {
                                                                                                const content = typeof row[col.name] === 'object' && row[col.name] !== null ? JSON.stringify(row[col.name]) : String(row[col.name]);
                                                                                                setFormatterContent(content);
                                                                                                setFormatterTitle(`Format value: ${col.name}`);
                                                                                                setFormatterReadOnly(!isEditable);

                                                                                                if (isEditable) {
                                                                                                    setFormatterOnSave(() => async (newValue: string) => {
                                                                                                        const whereClause = generateWhereClause(row);
                                                                                                        const valueStr = newValue === null ? 'NULL' : `'${String(newValue).replace(/'/g, "''")}'`;
                                                                                                        const updateSql = `UPDATE \`${dbName}\`.\`${tableName}\` SET \`${col.name}\` = ${valueStr} WHERE ${whereClause}`;
                                                                                                        try {
                                                                                                            await invokeSql({ connectionId, sql: updateSql });
                                                                                                            // Update local data
                                                                                                            const updatedRows = [...result.rows];
                                                                                                            updatedRows[originalRowIdx] = { ...updatedRows[originalRowIdx], [col.name]: newValue };
                                                                                                            setResult({ ...result, rows: updatedRows });
                                                                                                            setOriginalRows(updatedRows);
                                                                                                        } catch (err: any) {
                                                                                                            console.error("Update failed:", err);
                                                                                                        }
                                                                                                    });
                                                                                                } else {
                                                                                                    setFormatterOnSave(undefined);
                                                                                                }

                                                                                                setFormatterOpen(true);
                                                                                            }}
                                                                                        >
                                                                                            <Wand2 className="h-3 w-3 mr-2" />
                                                                                            {t('common.viewFormatted', '格式化/完整内容')}
                                                                                        </ContextMenuItem>

                                                                                        <ContextMenuSeparator />

                                                                                        {/* 选中 */}
                                                                                        <ContextMenuItem
                                                                                            onClick={() => {
                                                                                                if (isRowSelected) {
                                                                                                    setSelectedRowIndices(selectedRowIndices.filter(idx => idx !== originalRowIdx));
                                                                                                } else {
                                                                                                    setSelectedRowIndices([...selectedRowIndices, originalRowIdx]);
                                                                                                }
                                                                                            }}
                                                                                        >
                                                                                            <MousePointerClick className="h-3 w-3 mr-2" />
                                                                                            {isRowSelected ? t('common.deselect', '取消选中') : t('common.select', '选中')}
                                                                                        </ContextMenuItem>

                                                                                        {/* 复制行 */}
                                                                                        {isEditable && (
                                                                                            <ContextMenuItem onClick={() => handleCopySingleRow(originalRowIdx)}>
                                                                                                <Copy className="h-3 w-3 mr-2" />
                                                                                                {t('common.duplicateRow', '复制行')}
                                                                                            </ContextMenuItem>
                                                                                        )}

                                                                                        {/* 删除行 */}
                                                                                        {isEditable && (
                                                                                            <ContextMenuItem
                                                                                                onClick={() => handleDeleteSingleRow(originalRowIdx)}
                                                                                                className="text-red-600 focus:text-red-600"
                                                                                            >
                                                                                                <Trash2 className="h-3 w-3 mr-2" />
                                                                                                {t('common.deleteRow', '删除行')}
                                                                                            </ContextMenuItem>
                                                                                        )}
                                                                                    </ContextMenuContent>
                                                                                </ContextMenu>
                                                                            )}
                                                                        </TableCell>
                                                                    ))}
                                                                </TableRow>
                                                            );
                                                        })}

                                                        {filteredRows.length === 0 && newRows.length === 0 && (
                                                            <TableRow>
                                                                <TableCell colSpan={selectedRowIndices.length > 0 ? (result.columns.length || 1) + 1 : (result.columns.length || 1)} className="text-center h-24 text-muted-foreground">
                                                                    {hasActiveInlineFilters ? t('common.noFilterResults', '无匹配结果') : t('common.noResults', 'No results')}
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>

                                        {/* 分页控件 */}
                                        {result.rows.length > 0 && (
                                            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                                {hasActiveInlineFilters ? (
                                                    <span>{filteredRows.length} / {result.rows.length} {t('common.rowsReturned', 'rows returned')}</span>
                                                ) : (
                                                    <span>{result.rows.length} {t('common.rowsReturned', 'rows returned')}</span>
                                                )}
                                                {result.affected_rows > 0 && <span>| {t('common.affectedRows', 'Affected Rows')}: {result.affected_rows}</span>}
                                                {!isEditable && editDisabledReason && (
                                                    <span className="text-yellow-600 dark:text-yellow-400">
                                                        ⚠️ {editDisabledReason}
                                                    </span>
                                                )}
                                                <div className="h-4 w-[1px] bg-border"></div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handlePageChange(currentPage - 1)}
                                                    disabled={currentPage === 0}
                                                    className="h-6 text-xs"
                                                >
                                                    <ChevronLeft className="h-3 w-3" />
                                                </Button>
                                                <span>{t('common.page', '页')} {currentPage + 1}</span>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handlePageChange(currentPage + 1)}
                                                    disabled={result.rows.length < pageSize}
                                                    className="h-6 text-xs"
                                                >
                                                    <ChevronRight className="h-3 w-3" />
                                                </Button>
                                                <div className="h-4 w-[1px] bg-border"></div>
                                                <span>Limit:</span>
                                                <Input
                                                    type="number"
                                                    value={pageSizeInput}
                                                    onChange={(e) => setPageSizeInput(e.target.value)}
                                                    min="1"
                                                    className="w-20 h-6 text-xs"
                                                />

                                            </div>
                                        )}
                                    </div>
                                )}

                                {!result && !error && !isLoading && (
                                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                        {t('common.noResults')}
                                    </div>
                                )}
                            </div>
                        </div>
                    </ResizablePanel>



                    {showDDL && (
                        <>
                            <ResizableHandle withHandle />
                            <ResizablePanel ref={ddlPanelRef} defaultSize={20} minSize={10} maxSize={80}>
                                <div className="h-full flex flex-col bg-background border-t">
                                    <div className="flex-1 overflow-auto bg-background">
                                        {isLoadingDDL ? (
                                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                Loading...
                                            </div>
                                        ) : (
                                            <SyntaxHighlighter
                                                language="sql"
                                                style={transparentTheme(isDark ? vscDarkPlus : vs)}
                                                customStyle={{ margin: 0, height: '100%', borderRadius: 0, fontSize: '14px', backgroundColor: 'transparent' }}
                                                wrapLongLines={true}
                                            >
                                                {ddl}
                                            </SyntaxHighlighter>
                                        )}
                                    </div>
                                </div>
                            </ResizablePanel>
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
                open={rowViewerOpen}
                onOpenChange={setRowViewerOpen}
                row={viewingRow}
                columns={result?.columns || []}
                title={
                    (rowViewerMode === 'create' && viewingRowIndex === -1)
                        ? t('common.addRow', '新增行')
                        : (isEditable || rowViewerMode === 'create' ? t('common.editRow', '编辑行') : t('common.viewRow', '查看行数据'))
                }
                submitLabel={
                    (rowViewerMode === 'create' && viewingRowIndex === -1)
                        ? t('common.add', '新增')
                        : t('common.save', '保存')
                }
                editable={isEditable || rowViewerMode === 'create'}
                onSave={async (editedRow) => {
                    if (!result || !dbName || !tableName) return;

                    // Case: Editing a row in newRows (buffer)
                    if (viewingRowSource === 'new' && viewingRowIndex >= 0) {
                        const updatedNewRows = [...newRows];
                        updatedNewRows[viewingRowIndex] = editedRow;
                        setNewRows(updatedNewRows);
                        return;
                    }

                    if (rowViewerMode === 'create') {
                        // INSERT Logic
                        const fields: string[] = [];
                        const values: string[] = [];

                        Object.entries(editedRow).forEach(([key, value]) => {
                            if (value !== null && value !== '') {
                                fields.push(`\`${key}\``);
                                const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                                const escapedValue = strValue.replace(/'/g, "''");
                                values.push(`'${escapedValue}'`);
                            }
                        });

                        if (fields.length === 0) {
                            toast({
                                title: t('common.error', 'Error'),
                                description: t('common.atLeastOneField', 'Please fill in at least one field'),
                                variant: 'destructive',
                            });
                            throw new Error("Empty row");
                        }

                        const insertSql = `INSERT INTO \`${dbName}\`.\`${tableName}\` (${fields.join(', ')}) VALUES (${values.join(', ')})`;

                        try {
                            await invokeSql({
                                connectionId,
                                sql: insertSql,
                                dbName
                            });
                            toast({
                                title: t('common.success', 'Success'),
                                description: t('common.insertSuccess', 'Inserted successfully'),
                            });

                            // Refresh data
                            executeSql(executedSql);
                        } catch (err: any) {
                            throw err; // Propagate to dialog to keep it open
                        }

                    } else {
                        // UPDATE Logic
                        if (viewingRowIndex < 0) return;
                        const originalRow = result.rows[viewingRowIndex];

                        try {
                            const whereClause = generateWhereClause(originalRow);

                            // 构建 UPDATE 语句
                            const updates: string[] = [];
                            Object.keys(editedRow).forEach(key => {
                                const newValue = editedRow[key];
                                const oldValue = originalRow[key];

                                // 只更新变化的字段
                                if (newValue !== oldValue) {
                                    const valueStr = newValue === null || newValue === '' ? 'NULL' : `'${String(newValue).replace(/'/g, "''")}'`;
                                    updates.push(`\`${key}\` = ${valueStr}`);
                                }
                            });

                            if (updates.length === 0) {
                                // 没有变化，直接返回
                                return;
                            }

                            const updateSql = `UPDATE \`${dbName}\`.\`${tableName}\` SET ${updates.join(', ')} WHERE ${whereClause}`;

                            await invokeSql({
                                connectionId,
                                sql: updateSql,
                                dbName
                            });
                            // 更新本地数据
                            const updatedRows = [...result.rows];
                            updatedRows[viewingRowIndex] = editedRow;
                            setResult({ ...result, rows: updatedRows });
                            setOriginalRows(updatedRows);
                        } catch (err: any) {
                            console.error("Update failed:", err);
                            setError(typeof err === 'string' ? err : JSON.stringify(err));
                            throw err;
                        }
                    }
                }}
            />
        </div >
    );
}
