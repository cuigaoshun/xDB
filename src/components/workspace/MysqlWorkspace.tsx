import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Play, Loader2, FileCode, Hash, Type, Calendar, Binary, Trash2, Plus, Copy, Check, X, ChevronLeft, ChevronRight, Filter, Pencil, Wand2, Eye } from "lucide-react";
import { FilterBuilder } from "@/components/workspace/FilterBuilder";
import { TextFormatterDialog } from "@/components/common/TextFormatterDialog";
import { RowViewerDialog } from "@/components/common/RowViewerDialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn, transparentTheme } from "@/lib/utils";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import { useAppStore } from "@/store/useAppStore";
import { addCommandToConsole } from "@/components/ui/CommandConsole";
import { confirm } from "@/hooks/use-toast";

interface ColumnInfo {
    name: string;
    type_name: string;
}

interface SqlResult {
    columns: ColumnInfo[];
    rows: Record<string, any>[];
    affected_rows: number;
}

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

    const [sql, setSql] = useState(savedSql || initialSql || "SELECT * FROM users");
    const [result, setResult] = useState<SqlResult | null>(savedResult || null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
    const [viewingRow, setViewingRow] = useState<Record<string, any> | null>(null);


    // 分页状态
    const [currentPage, setCurrentPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [pageSizeInput, setPageSizeInput] = useState("50");

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
            updateTab(tabId, { currentSql: sql, savedResult: result });
        }, 500);
        return () => clearTimeout(timer);
    }, [sql, result, tabId, updateTab]);

    // DDL related state
    const [showDDL, setShowDDL] = useState(false);
    const [ddl, setDdl] = useState<string>("");
    const [isLoadingDDL, setIsLoadingDDL] = useState(false);

    // Filter related state
    const [showFilter, setShowFilter] = useState(!!tableName); // 有表名时默认打开筛选器
    const [, setWhereClause] = useState("");
    const [filterColumns, setFilterColumns] = useState<ColumnInfo[]>([]);
    const [isLoadingFilterColumns, setIsLoadingFilterColumns] = useState(false);

    // Inline filter state (local filtering on fetched data)
    const [inlineFilters, setInlineFilters] = useState<Record<string, string>>({});


    const initialSqlExecuted = useRef(false);

    // If initialSql is provided (e.g. when opening a table), update state and run it
    useEffect(() => {
        if (initialSql && !savedSql && !initialSqlExecuted.current) {
            // 移除可能存在的默认 LIMIT 子句（主要用于显示）
            let displaySql = initialSql.trim();
            if (displaySql.endsWith(';')) {
                displaySql = displaySql.slice(0, -1).trim();
            }
            const limitRegex = /\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?$/i;
            displaySql = displaySql.replace(limitRegex, '');
            displaySql += ';';

            setSql(displaySql);

            // 如果只是注释，不自动执行
            const isJustComments = displaySql.trim().split('\n').every(line => line.trim().startsWith('--') || line.trim().startsWith('#') || line.trim() === '');
            if (isJustComments) {
                initialSqlExecuted.current = true;
                return;
            }

            // 先检测主键，然后应用排序和分页
            const executeInitialQuery = async () => {
                if (dbName && tableName) {
                    // 先检测主键
                    const keys = await detectPrimaryKeys();

                    // 构建带排序的 SQL
                    let queryToExecute = displaySql.trim();
                    if (queryToExecute.endsWith(';')) {
                        queryToExecute = queryToExecute.slice(0, -1).trim();
                    }

                    // 如果有主键，添加 ORDER BY 子句（主键倒序）
                    if (keys.length > 0) {
                        queryToExecute += ` ORDER BY \`${keys[0]}\` DESC`;
                    }

                    // 应用分页限制
                    const processedSql = autoAddLimit(queryToExecute, pageSize, 0);
                    executeSql(processedSql);
                } else {
                    // 没有表名，直接执行原始查询
                    const processedSql = autoAddLimit(displaySql, pageSize, 0);
                    executeSql(processedSql);
                }
            };

            executeInitialQuery();
            initialSqlExecuted.current = true;
        }
    }, [initialSql]);

    // Load DDL when panel is opened or table changes
    useEffect(() => {
        if (showDDL && dbName && tableName) {
            loadDDL();
        }
    }, [showDDL, dbName, tableName]);

    // Load filter columns when filter is opened and columns are not loaded
    useEffect(() => {
        if (showFilter && filterColumns.length === 0 && dbName && tableName && !isLoadingFilterColumns) {
            setIsLoadingFilterColumns(true);
            const loadColumns = async () => {
                try {
                    const schemaSql = `SHOW COLUMNS FROM \`${dbName}\`.\`${tableName}\``;
                    const res = await invoke<SqlResult>("execute_sql", {
                        connectionId,
                        sql: schemaSql,
                        dbName
                    });
                    if (res.rows && res.rows.length > 0) {
                        const cols: ColumnInfo[] = res.rows.map(row => ({
                            name: (row.Field || row.field || Object.values(row)[0]) as string,
                            type_name: (row.Type || row.type || Object.values(row)[1] || 'text') as string
                        }));
                        setFilterColumns(cols);
                    }
                } catch (err) {
                    console.error("Failed to fetch columns for filter:", err);
                } finally {
                    setIsLoadingFilterColumns(false);
                }
            };
            loadColumns();
        }
    }, [showFilter, dbName, tableName]);

    // 辅助函数：自动为 SELECT 语句添加 LIMIT 和 OFFSET
    const autoAddLimit = (query: string, limit: number, offset: number): string => {
        let trimmedQuery = query.trim();
        if (trimmedQuery.endsWith(';')) {
            trimmedQuery = trimmedQuery.slice(0, -1).trim();
        }
        const upperQuery = trimmedQuery.toUpperCase();

        // 只处理 SELECT 语句
        if (!upperQuery.startsWith('SELECT')) {
            return query;
        }

        // 如果已经有 LIMIT，先移除它
        let processedQuery = trimmedQuery;
        const limitRegex = /\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?$/i;
        processedQuery = processedQuery.replace(limitRegex, '');

        // 添加新的 LIMIT 和 OFFSET
        return offset > 0
            ? `${processedQuery} LIMIT ${limit} OFFSET ${offset}; `
            : `${processedQuery} LIMIT ${limit}; `;
    };

    // 检测表的主键，返回主键数组
    const detectPrimaryKeys = async (): Promise<string[]> => {
        if (!dbName || !tableName) {
            setPrimaryKeys([]);
            return [];
        }

        try {
            const sql = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = '${tableName}' AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`;
            const res = await invoke<SqlResult>("execute_sql", {
                connectionId,
                sql
            });

            const keys = res.rows.map(row => row.COLUMN_NAME as string);
            setPrimaryKeys(keys);
            return keys;
        } catch (err) {
            console.error("Failed to detect primary keys:", err);
            setPrimaryKeys([]);
            return [];
        }
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

            const startTime = Date.now();
            await invoke("execute_sql", {
                connectionId,
                sql: updateSql,
                dbName
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: updateSql,
                duration: Date.now() - startTime,
                success: true
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

            addCommandToConsole({
                databaseType: 'mysql',
                command: `UPDATE \`${dbName}\`.\`${tableName}\` SET \`${colName}\` = ...`,
                duration: 0,
                success: false,
                error: typeof err === 'string' ? err : JSON.stringify(err)
            });
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
                const res = await invoke<SqlResult>("execute_sql", {
                    connectionId,
                    sql: schemaSql,
                    dbName
                });

                if (res.columns && res.columns.length > 0) {
                    cols = res.columns;
                    setResult(res);
                } else {
                    // 如果 LIMIT 0 不行（极少见），尝试 DESCRIBE
                    const describeRes = await invoke<SqlResult>("execute_sql", {
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

            setNewRows(prev => {
                const updated = [...prev, emptyRow];
                // 开启编辑模式：最后一行，第一列
                setTimeout(() => {
                    handleCellEdit(updated.length - 1, cols![0].name, null, true);
                }, 0);
                return updated;
            });
        } else {
            setError(t('common.noColumnsFound', '未找到表的列信息，无法新增行'));
        }
    };




    // 复制选中的行
    const handleCopyRow = () => {
        if (!result || selectedRowIndices.length === 0) return;

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

                const startTime = Date.now();
                await invoke("execute_sql", {
                    connectionId,
                    sql: deleteSql,
                    dbName
                });

                addCommandToConsole({
                    databaseType: 'mysql',
                    command: deleteSql,
                    duration: Date.now() - startTime,
                    success: true
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

            addCommandToConsole({
                databaseType: 'mysql',
                command: `DELETE FROM \`${dbName}\`.\`${tableName}\` WHERE ...`,
                duration: 0,
                success: false,
                error: typeof err === 'string' ? err : JSON.stringify(err)
            });
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

        setNewRows([...newRows, copiedRow]);
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

            const startTime = Date.now();
            await invoke("execute_sql", {
                connectionId,
                sql: deleteSql,
                dbName
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: deleteSql,
                duration: Date.now() - startTime,
                success: true
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

            addCommandToConsole({
                databaseType: 'mysql',
                command: `DELETE FROM \`${dbName}\`.\`${tableName}\` WHERE ...`,
                duration: 0,
                success: false,
                error: typeof err === 'string' ? err : JSON.stringify(err)
            });
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
                    const escapedValue = String(value).replace(/'/g, "''");
                    values.push(`'${escapedValue}'`);
                }
            });

            if (fields.length === 0) {
                failedRows.push(row);
                continue;
            }

            const insertSql = `INSERT INTO \`${dbName}\`.\`${tableName}\` (${fields.join(', ')}) VALUES (${values.join(', ')})`;

            try {
                const startTime = Date.now();
                await invoke("execute_sql", {
                    connectionId,
                    sql: insertSql,
                    dbName
                });

                addCommandToConsole({
                    databaseType: 'mysql',
                    command: insertSql,
                    duration: Date.now() - startTime,
                    success: true
                });
                successCount++;
            } catch (err: any) {
                console.error("Insert failed:", err);
                failedRows.push(row);

                addCommandToConsole({
                    databaseType: 'mysql',
                    command: insertSql,
                    duration: 0,
                    success: false,
                    error: typeof err === 'string' ? err : JSON.stringify(err)
                });
            }
        }

        setNewRows(failedRows);
        setIsLoading(false);

        if (successCount > 0) {
            handleExecute(); // 刷新数据
        }

        if (failedRows.length > 0) {
            setError(t('common.someRowsFailed', '有 {{count}} 行提交失败，请检查数据。', { count: failedRows.length }));
        }
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
        const processedSql = autoAddLimit(sql, pageSize, newPage * pageSize);
        executeSql(processedSql);
    };

    // 处理页面大小变化
    const handlePageSizeChange = () => {
        const newSize = parseInt(pageSizeInput);
        if (isNaN(newSize) || newSize <= 0) {
            alert(t('common.invalidNumber', '请输入有效的数字'));
            return;
        }
        setPageSize(newSize);
        setCurrentPage(0);
        // 重新执行查询
        const processedSql = autoAddLimit(sql, newSize, 0);
        executeSql(processedSql);
    };

    const loadDDL = async () => {
        if (!dbName || !tableName) return;

        setIsLoadingDDL(true);
        const startTime = Date.now();
        const sql = `SHOW CREATE TABLE \`${dbName}\`.\`${tableName}\``;

        try {
            // Use execute_sql to get create table statement
            const res = await invoke<SqlResult>("execute_sql", {
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

            addCommandToConsole({
                databaseType: 'mysql',
                command: sql,
                duration: Date.now() - startTime,
                success: true
            });
        } catch (err: any) {
            console.error("Failed to load DDL:", err);
            setDdl(`-- Failed to load DDL: ${typeof err === 'string' ? err : JSON.stringify(err)}`);

            addCommandToConsole({
                databaseType: 'mysql',
                command: sql,
                duration: Date.now() - startTime,
                success: false,
                error: typeof err === 'string' ? err : JSON.stringify(err)
            });
        } finally {
            setIsLoadingDDL(false);
        }
    };

    const executeSql = async (query: string) => {
        if (!query.trim()) return;

        setIsLoading(true);
        setError(null);
        setResult(null);

        const startTime = Date.now();

        try {
            const data = await invoke<SqlResult>("execute_sql", {
                connectionId,
                sql: query,
                dbName
            });
            setResult(data);
            setOriginalRows(data.rows);
            // 更新筛选器的列信息
            if (data.columns && data.columns.length > 0) {
                setFilterColumns(data.columns);
            }

            addCommandToConsole({
                databaseType: 'mysql',
                command: query,
                duration: Date.now() - startTime,
                success: true
            });

            // 如果是表查询,检测主键
            if (dbName && tableName) {
                const keys = await detectPrimaryKeys();

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

            addCommandToConsole({
                databaseType: 'mysql',
                command: query,
                duration: Date.now() - startTime,
                success: false,
                error: typeof err === 'string' ? err : JSON.stringify(err)
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleExecute = () => {
        // 去除末尾分号以便正确添加 LIMIT
        let sqlToExecute = sql.trim();
        if (sqlToExecute.endsWith(';')) {
            sqlToExecute = sqlToExecute.slice(0, -1).trim();
        }

        // 自动为 SELECT 语句添加 LIMIT
        const processedSql = autoAddLimit(sqlToExecute, pageSize, currentPage * pageSize);
        executeSql(processedSql);
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

    // Compute filtered rows based on inline filters
    const getFilteredRows = () => {
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
    };

    const filteredRows = getFilteredRows();
    const hasActiveInlineFilters = Object.values(inlineFilters).some(v => v.trim() !== '');





    const connection = useAppStore(state => state.connections.find(c => c.id === connectionId));
    const connectionName = connection?.name || name;

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Toolbar */}
            <div className="p-2 flex gap-2 items-center bg-muted/30 justify-between">
                <div className="flex gap-2 items-center">
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
                    {tableName && (
                        <Button
                            variant={showFilter ? "secondary" : "ghost"}
                            size="sm"
                            onClick={async () => {
                                const newShowFilter = !showFilter;
                                setShowFilter(newShowFilter);
                                // 如果要显示筛选器但没有列信息，尝试获取
                                if (newShowFilter && filterColumns.length === 0 && dbName && tableName) {
                                    setIsLoadingFilterColumns(true);
                                    try {
                                        // 使用 SHOW COLUMNS 获取列信息
                                        const schemaSql = `SHOW COLUMNS FROM \`${dbName}\`.\`${tableName}\``;
                                        const res = await invoke<SqlResult>("execute_sql", {
                                            connectionId,
                                            sql: schemaSql,
                                            dbName
                                        });
                                        if (res.rows && res.rows.length > 0) {
                                            // SHOW COLUMNS 返回 Field, Type, Null, Key, Default, Extra
                                            const cols: ColumnInfo[] = res.rows.map(row => ({
                                                name: (row.Field || row.field || Object.values(row)[0]) as string,
                                                type_name: (row.Type || row.type || Object.values(row)[1] || 'text') as string
                                            }));
                                            setFilterColumns(cols);
                                        }
                                    } catch (err) {
                                        console.error("Failed to fetch columns for filter:", err);
                                    } finally {
                                        setIsLoadingFilterColumns(false);
                                    }
                                }
                            }}
                            disabled={isLoadingFilterColumns}
                            title={t('common.filter', 'Filter')}
                            className={cn("mr-1", showFilter && "bg-muted")}
                        >
                            {isLoadingFilterColumns ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Filter className="h-4 w-4 mr-1" />}
                            {t('common.filter', 'Filter')}
                        </Button>
                    )}
                    <Button
                        size="sm"
                        onClick={handleExecute}
                        disabled={isLoading}
                        className="bg-green-600 hover:bg-green-700 text-white gap-2"
                    >
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {t('common.run', 'Run')}
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
                                className="gap-2"
                                title={!isEditable ? editDisabledReason : t('common.add', '新增')}
                            >
                                <Plus className="h-3 w-3" />
                                {t('common.add', '新增')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCopyRow}
                                disabled={!isEditable || selectedRowIndices.length === 0}
                                title={!isEditable ? editDisabledReason : t('common.duplicate', '复制') + ` ${selectedRowIndices.length} ` + t('common.items', '条')}
                                className="gap-2"
                            >
                                <Copy className="h-3 w-3" />
                                {t('common.duplicate', '复制')} {selectedRowIndices.length > 0 && `(${selectedRowIndices.length})`}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleRowDelete}
                                disabled={!isEditable || selectedRowIndices.length === 0}
                                className="gap-2 text-red-600 hover:text-red-700"
                                title={!isEditable ? editDisabledReason : t('common.delete', '删除') + ` ${selectedRowIndices.length} ` + t('common.items', '条')}
                            >
                                <Trash2 className="h-3 w-3" />
                                {t('common.delete', '删除')} {selectedRowIndices.length > 0 && `(${selectedRowIndices.length})`}
                            </Button>

                            {newRows.length > 0 && (
                                <>
                                    <div className="h-4 w-[1px] bg-border mx-2"></div>
                                    <Button
                                        size="sm"
                                        onClick={handleSubmitChanges}
                                        disabled={isLoading}
                                        className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                        {t('common.submitChanges', '提交修改')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleCancelChanges}
                                        disabled={isLoading}
                                        className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                        <X className="h-3 w-3" />
                                        {t('common.cancel', '取消')}
                                    </Button>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* Right Side Toolbar Actions */}
                <div className="flex gap-2 items-center">
                    {tableName && (
                        <Button
                            variant={showDDL ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setShowDDL(!showDDL)}
                            title="Show DDL"
                            className={cn(showDDL && "bg-muted")}
                        >
                            <FileCode className="h-4 w-4 mr-1" />
                            DDL
                        </Button>
                    )}
                </div>
            </div>

            {showFilter && (filterColumns.length > 0 || isLoadingFilterColumns) && (
                <div className="px-4 py-1 bg-muted/20">
                    <FilterBuilder
                        columns={filterColumns}
                        primaryKeys={primaryKeys}
                        onChange={setWhereClause}
                        onExecute={(clause, orderBy) => {
                            if (!dbName || !tableName) return;
                            let query = `SELECT * FROM \`${dbName}\`.\`${tableName}\``;
                            if (clause) {
                                query += ` WHERE ${clause}`;
                            }
                            if (orderBy) {
                                query += ` ORDER BY \`${orderBy.split(' ')[0]}\` ${orderBy.split(' ')[1]}`;
                            }
                            const processedSql = autoAddLimit(query + ';', pageSize, 0);
                            setCurrentPage(0);
                            executeSql(processedSql);
                        }}
                    />
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                <ResizablePanelGroup direction="horizontal">
                    <ResizablePanel defaultSize={showDDL ? 70 : 100} minSize={30}>
                        <div className="h-full flex flex-col">
                            {/* Query Area */}
                            <div className="h-1/3 px-4 py-1 bg-background">
                                <Textarea
                                    value={sql}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSql(e.target.value)}
                                    className="font-mono h-full resize-none"
                                    placeholder={t('common.sqlPlaceholder', '在此输入 SQL 查询...')}
                                />
                            </div>

                            {/* Result Area */}
                            <div className="flex-1 overflow-auto px-4 py-1">
                                {error && (
                                    <div className="p-4 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm font-mono whitespace-pre-wrap">
                                        Error: {error}
                                    </div>
                                )}

                                {result && (
                                    <div className="h-full flex flex-col gap-0">

                                        <div className="border rounded-md bg-background overflow-auto flex-1">
                                            <Table style={{ tableLayout: 'fixed' }}>
                                                <TableHeader className="sticky top-0 bg-muted/50">
                                                    <TableRow>
                                                        {/* 复选框列 - 只在有选中行时显示 */}
                                                        {selectedRowIndices.length > 0 && (
                                                            <TableHead className="w-[50px] min-w-[50px]">
                                                                <div className="flex items-center justify-center">
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
                                                            <TableHead key={i} className="whitespace-nowrap w-[200px] min-w-[200px]">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0 truncate">
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
                                                                                    "h-5 w-5 p-0 ml-1 flex-shrink-0",
                                                                                    inlineFilters[col.name] && "text-blue-600"
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
                                                                <TableCell key={colIdx} className="whitespace-nowrap w-[200px] min-w-[200px]">
                                                                    {editingCell?.rowIdx === rowIdx && editingCell?.colName === col.name && editingCell?.isNewRow ? (
                                                                        <div className="relative w-[168px]">
                                                                            <Input
                                                                                value={editValue}
                                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                                className="h-7 text-xs w-[168px] pr-14"
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
                                                                            </ContextMenuContent>
                                                                        </ContextMenu>
                                                                    )}
                                                                </TableCell>
                                                            ))}

                                                        </TableRow>
                                                    ))}

                                                    {/* 现有行 */}
                                                    {filteredRows.map((row, displayIdx) => {
                                                        // 找到原始行索引用于编辑操作
                                                        const originalRowIdx = result.rows.indexOf(row);
                                                        const isRowSelected = selectedRowIndices.includes(originalRowIdx);
                                                        return (
                                                            <TableRow
                                                                key={displayIdx}
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
                                                                    <TableCell key={colIdx} className="p-0 whitespace-nowrap w-[200px] min-w-[200px]">
                                                                        {editingCell?.rowIdx === originalRowIdx && editingCell?.colName === col.name && !editingCell?.isNewRow ? (
                                                                            <div className="relative w-[168px] px-2 py-1">
                                                                                <Input
                                                                                    value={editValue}
                                                                                    onChange={(e) => setEditValue(e.target.value)}
                                                                                    className="h-7 text-xs w-[168px] pr-14"
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
                                                                                    <div className="px-2 py-2 cursor-context-menu min-h-[36px] flex items-center">
                                                                                        {row[col.name] === null ? (
                                                                                            <span className="text-muted-foreground italic truncate">NULL</span>
                                                                                        ) : (
                                                                                            <span className="flex-1 truncate">{typeof row[col.name] === 'object' && row[col.name] !== null ? JSON.stringify(row[col.name]) : String(row[col.name])}</span>
                                                                                        )}
                                                                                    </div>
                                                                                </ContextMenuTrigger>
                                                                                <ContextMenuContent>
                                                                                    <ContextMenuItem
                                                                                        onClick={() => {
                                                                                            if (isRowSelected) {
                                                                                                setSelectedRowIndices(selectedRowIndices.filter(idx => idx !== originalRowIdx));
                                                                                            } else {
                                                                                                setSelectedRowIndices([...selectedRowIndices, originalRowIdx]);
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        <Check className={cn("h-3 w-3 mr-2", !isRowSelected && "opacity-0")} />
                                                                                        {isRowSelected ? t('common.deselect', '取消选中') : t('common.select', '选中')}
                                                                                    </ContextMenuItem>

                                                                                    <ContextMenuSeparator />

                                                                                    <ContextMenuItem
                                                                                        onClick={() => {
                                                                                            setViewingRow(row);
                                                                                            setRowViewerOpen(true);
                                                                                        }}
                                                                                    >
                                                                                        <Eye className="h-3 w-3 mr-2" />
                                                                                        {t('common.viewRow', '查看行')}
                                                                                    </ContextMenuItem>

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
                                                                                                    const startTime = Date.now();
                                                                                                    try {
                                                                                                        await invoke("execute_sql", {
                                                                                                            connectionId,
                                                                                                            sql: updateSql
                                                                                                        });
                                                                                                        addCommandToConsole({
                                                                                                            databaseType: 'mysql',
                                                                                                            command: updateSql,
                                                                                                            duration: Date.now() - startTime,
                                                                                                            success: true
                                                                                                        });
                                                                                                        // Update local data
                                                                                                        const updatedRows = [...result.rows];
                                                                                                        updatedRows[originalRowIdx] = { ...updatedRows[originalRowIdx], [col.name]: newValue };
                                                                                                        setResult({ ...result, rows: updatedRows });
                                                                                                        setOriginalRows(updatedRows);
                                                                                                    } catch (err: any) {
                                                                                                        console.error("Update failed:", err);
                                                                                                        addCommandToConsole({
                                                                                                            databaseType: 'mysql',
                                                                                                            command: updateSql,
                                                                                                            duration: 0,
                                                                                                            success: false,
                                                                                                            error: typeof err === 'string' ? err : JSON.stringify(err)
                                                                                                        });
                                                                                                    }
                                                                                                });
                                                                                            } else {
                                                                                                setFormatterOnSave(undefined);
                                                                                            }

                                                                                            setFormatterOpen(true);
                                                                                        }}
                                                                                    >
                                                                                        <Wand2 className="h-3 w-3 mr-2" />
                                                                                        {t('common.viewFormatted', '查看格式化/完整内容')}
                                                                                    </ContextMenuItem>

                                                                                    {isEditable && (
                                                                                        <>
                                                                                            <ContextMenuItem onClick={() => handleCellEdit(originalRowIdx, col.name, row[col.name], false)}>
                                                                                                <Pencil className="h-3 w-3 mr-2" />
                                                                                                {t('common.edit', '编辑')}
                                                                                            </ContextMenuItem>
                                                                                            <ContextMenuItem onClick={() => handleCopySingleRow(originalRowIdx)}>
                                                                                                <Copy className="h-3 w-3 mr-2" />
                                                                                                {t('common.duplicateRow', '复制行')}
                                                                                            </ContextMenuItem>
                                                                                            <ContextMenuItem
                                                                                                onClick={() => handleDeleteSingleRow(originalRowIdx)}
                                                                                                className="text-red-600 focus:text-red-600"
                                                                                            >
                                                                                                <Trash2 className="h-3 w-3 mr-2" />
                                                                                                {t('common.deleteRow', '删除行')}
                                                                                            </ContextMenuItem>
                                                                                        </>
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
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            handlePageSizeChange();
                                                        }
                                                    }}
                                                    className="w-20 h-6 text-xs"
                                                    min="1"
                                                />
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={handlePageSizeChange}
                                                    className="h-6 w-6 p-0"
                                                    title="应用 Limit"
                                                >
                                                    <Check className="h-3 w-3" />
                                                </Button>
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
                            <ResizableHandle />
                            <ResizablePanel defaultSize={25} minSize={20} maxSize={60}>
                                <div className="h-full flex flex-col bg-background border-l">
                                    <div className="p-2 border-b bg-muted/10 text-sm font-medium flex justify-between items-center">
                                        <span>Table DDL: {tableName}</span>
                                    </div>
                                    <div className="flex-1 overflow-auto p-4 bg-background">
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
                title={t('common.viewRow', '查看行数据')}
            />
        </div>
    );
}
