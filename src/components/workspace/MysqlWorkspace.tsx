import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Play, Loader2, FileCode, Hash, Type, Calendar, Binary, Trash2, Plus, Copy, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { TextFormatterWrapper } from "@/components/common/TextFormatterWrapper";
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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAppStore } from "@/store/useAppStore";
import { addCommandToConsole } from "@/components/ui/CommandConsole";

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
    const { theme } = useTheme();
    const updateTab = useAppStore(state => state.updateTab);

    const [sql, setSql] = useState(savedSql || initialSql || "SELECT * FROM users");
    const [result, setResult] = useState<SqlResult | null>(savedResult || null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 编辑状态
    const [editingCell, setEditingCell] = useState<{ rowIdx: number, colName: string, isNewRow: boolean } | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [, setOriginalRows] = useState<Record<string, any>[]>([]);

    // 新增行状态
    const [newRows, setNewRows] = useState<Record<string, any>[]>([]);
    const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);

    // 分页状态
    const [currentPage, setCurrentPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [pageSizeInput, setPageSizeInput] = useState("50");

    // 主键信息
    const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);

    // Sync SQL changes to global store (debounced)
    useEffect(() => {
        const timer = setTimeout(() => {
            updateTab(tabId, { currentSql: sql, savedResult: result });
        }, 500);
        return () => clearTimeout(timer);
    }, [sql, result, tabId, updateTab]);

    // Determine effective theme for syntax highlighter
    const [isDark, setIsDark] = useState(true);

    useEffect(() => {
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            setIsDark(mediaQuery.matches);

            const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        } else {
            setIsDark(theme === 'dark');
        }
    }, [theme]);

    // Helper to remove background from theme for seamless integration
    const transparentTheme = (theme: any) => {
        const newTheme = { ...theme };
        // Override pre and code blocks to be transparent
        const transparent = { background: 'transparent', textShadow: 'none' };

        if (newTheme['pre[class*="language-"]']) {
            newTheme['pre[class*="language-"]'] = { ...newTheme['pre[class*="language-"]'], ...transparent };
        }
        if (newTheme['code[class*="language-"]']) {
            newTheme['code[class*="language-"]'] = { ...newTheme['code[class*="language-"]'], ...transparent };
        }
        return newTheme;
    };

    // DDL related state
    const [showDDL, setShowDDL] = useState(false);
    const [ddl, setDdl] = useState<string>("");
    const [isLoadingDDL, setIsLoadingDDL] = useState(false);

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
            // 自动应用分页限制，避免默认显示太多
            const processedSql = autoAddLimit(displaySql, pageSize, 0);
            executeSql(processedSql);
            initialSqlExecuted.current = true;
        }
    }, [initialSql]);

    // Load DDL when panel is opened or table changes
    useEffect(() => {
        if (showDDL && dbName && tableName) {
            loadDDL();
        }
    }, [showDDL, dbName, tableName]);

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
            ? `${processedQuery} LIMIT ${limit} OFFSET ${offset};`
            : `${processedQuery} LIMIT ${limit};`;
    };

    // 检测表的主键
    const detectPrimaryKeys = async () => {
        if (!dbName || !tableName) {
            setPrimaryKeys([]);
            return;
        }

        try {
            const sql = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = '${tableName}' AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`;
            const res = await invoke<SqlResult>("execute_sql", {
                connectionId,
                sql
            });

            const keys = res.rows.map(row => row.COLUMN_NAME as string);
            setPrimaryKeys(keys);
        } catch (err) {
            console.error("Failed to detect primary keys:", err);
            setPrimaryKeys([]);
        }
    };

    // 生成 WHERE 子句（基于主键）
    const generateWhereClause = (row: Record<string, any>): string => {
        if (primaryKeys.length === 0) {
            throw new Error("无法更新/删除：表没有主键");
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
        setEditValue(currentValue === null ? '' : String(currentValue));
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
                sql: updateSql
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

    // 删除选中的行
    const handleRowDelete = async () => {
        if (!result || !dbName || !tableName || selectedRowIndices.length === 0) return;

        if (!confirm(`确定要删除选中的 ${selectedRowIndices.length} 行吗？`)) return;

        try {
            // 批量删除
            for (const rowIdx of selectedRowIndices) {
                const row = result.rows[rowIdx];
                const whereClause = generateWhereClause(row);
                const deleteSql = `DELETE FROM \`${dbName}\`.\`${tableName}\` WHERE ${whereClause}`;

                const startTime = Date.now();
                await invoke("execute_sql", {
                    connectionId,
                    sql: deleteSql
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

    // 添加新行
    const handleAddNewRow = () => {
        if (!result) return;

        const emptyRow: Record<string, any> = {};
        result.columns.forEach(col => {
            emptyRow[col.name] = null;
        });

        setNewRows([...newRows, emptyRow]);
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

    // 提交新行
    const handleNewRowSubmit = async (rowIdx: number) => {
        if (!dbName || !tableName || !result) return;

        const row = newRows[rowIdx];

        // 过滤掉值为 null 的字段
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
            alert('请至少填写一个字段');
            return;
        }

        const insertSql = `INSERT INTO \`${dbName}\`.\`${tableName}\` (${fields.join(', ')}) VALUES (${values.join(', ')})`;

        try {
            const startTime = Date.now();
            await invoke("execute_sql", {
                connectionId,
                sql: insertSql
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: insertSql,
                duration: Date.now() - startTime,
                success: true
            });

            // 移除新增行并刷新数据
            const updatedNewRows = newRows.filter((_, idx) => idx !== rowIdx);
            setNewRows(updatedNewRows);

            // 重新执行查询以获取最新数据
            handleExecute();
        } catch (err: any) {
            console.error("Insert failed:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));

            addCommandToConsole({
                databaseType: 'mysql',
                command: insertSql,
                duration: 0,
                success: false,
                error: typeof err === 'string' ? err : JSON.stringify(err)
            });
        }
    };

    // 删除新增行
    const handleNewRowDelete = (rowIdx: number) => {
        const updatedNewRows = newRows.filter((_, idx) => idx !== rowIdx);
        setNewRows(updatedNewRows);
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
            alert('请输入有效的数字');
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
                sql: query
            });
            setResult(data);
            setOriginalRows(data.rows);

            addCommandToConsole({
                databaseType: 'mysql',
                command: query,
                duration: Date.now() - startTime,
                success: true
            });

            // 如果是表查询，检测主键
            if (dbName && tableName) {
                detectPrimaryKeys();
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

    // Helper to determine if formatter button should be shown
    const shouldShowFormatter = (typeName: string, value: string) => {
        const type = typeName.toUpperCase();
        // Show formatter for text-based types
        return type.includes("CHAR") || type.includes("TEXT") || type.includes("JSON");
    };

    const connection = useAppStore(state => state.connections.find(c => c.id === connectionId));
    const connectionName = connection?.name || name;

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Toolbar */}
            <div className="border-b p-2 flex gap-2 items-center bg-muted/5 justify-between">
                <div className="flex gap-2 items-center">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/20 rounded border border-muted shadow-sm">
                        <span className="text-sm font-semibold text-foreground whitespace-nowrap">{connectionName}</span>
                        {dbName && (
                            <>
                                <div className="h-3 w-[1px] bg-border mx-1"></div>
                                <span className="text-sm text-muted-foreground whitespace-nowrap">{dbName}</span>
                            </>
                        )}
                    </div>
                    <div className="h-4 w-[1px] bg-border mx-2"></div>
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
                    {result && tableName && (
                        <>
                            <div className="h-4 w-[1px] bg-border mx-2"></div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleAddNewRow}
                                className="gap-2"
                                title="添加新行"
                            >
                                <Plus className="h-3 w-3" />
                                新增
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCopyRow}
                                disabled={selectedRowIndices.length === 0}
                                className="gap-2"
                                title={`复制选中的 ${selectedRowIndices.length} 行`}
                            >
                                <Copy className="h-3 w-3" />
                                复制 {selectedRowIndices.length > 0 && `(${selectedRowIndices.length})`}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleRowDelete}
                                disabled={primaryKeys.length === 0 || selectedRowIndices.length === 0}
                                className="gap-2 text-red-600 hover:text-red-700"
                                title={primaryKeys.length === 0 ? "无主键，无法删除" : `删除选中的 ${selectedRowIndices.length} 行`}
                            >
                                <Trash2 className="h-3 w-3" />
                                删除 {selectedRowIndices.length > 0 && `(${selectedRowIndices.length})`}
                            </Button>
                        </>
                    )}

                    {/* 数据操作按钮 */}
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

            <div className="flex-1 flex overflow-hidden">
                <ResizablePanelGroup direction="horizontal">
                    <ResizablePanel defaultSize={showDDL ? 70 : 100} minSize={30}>
                        <div className="h-full flex flex-col">
                            {/* Query Area */}
                            <div className="h-1/3 p-4 border-b bg-background">
                                <Textarea
                                    value={sql}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSql(e.target.value)}
                                    className="font-mono h-full resize-none"
                                    placeholder="Enter your SQL query here..."
                                />
                            </div>

                            {/* Result Area */}
                            <div className="flex-1 overflow-auto bg-muted/5 p-4">
                                {error && (
                                    <div className="p-4 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm font-mono whitespace-pre-wrap">
                                        Error: {error}
                                    </div>
                                )}

                                {result && (
                                    <div className="h-full flex flex-col">
                                        <div className="mb-2 text-xs text-muted-foreground flex justify-between">
                                            <span>{result.rows.length} rows returned</span>
                                            {result.affected_rows > 0 && <span>Affected Rows: {result.affected_rows}</span>}
                                        </div>

                                        <div className="border rounded-md bg-background overflow-auto flex-1">
                                            <Table>
                                                <TableHeader className="sticky top-0 bg-muted/50">
                                                    <TableRow>
                                                        {result.columns.map((col, i) => (
                                                            <TableHead key={i} className="whitespace-nowrap">
                                                                <div className="flex flex-col gap-0.5">
                                                                    <span className="font-semibold text-foreground">{col.name}</span>
                                                                    <div className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                                                                        {getColumnTypeIcon(col.type_name)}
                                                                        <span className="lowercase">{col.type_name}</span>
                                                                    </div>
                                                                </div>
                                                            </TableHead>
                                                        ))}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {/* 新增行 */}
                                                    {newRows.map((row, rowIdx) => (
                                                        <TableRow key={`new-${rowIdx}`} className="bg-blue-50/50 dark:bg-blue-950/20">
                                                            {result.columns.map((col, colIdx) => (
                                                                <TableCell key={colIdx} className="whitespace-nowrap max-w-[300px]">
                                                                    {editingCell?.rowIdx === rowIdx && editingCell?.colName === col.name && editingCell?.isNewRow ? (
                                                                        <div className="flex gap-1 items-center">
                                                                            <Input
                                                                                value={editValue}
                                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                                className="h-7 text-xs min-w-[200px]"
                                                                                autoFocus
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === 'Enter') handleCellSubmit();
                                                                                    if (e.key === 'Escape') handleCellCancel();
                                                                                }}
                                                                            />
                                                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleCellSubmit}>
                                                                                <Check className="h-3 w-3 text-green-600" />
                                                                            </Button>
                                                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleCellCancel}>
                                                                                <X className="h-3 w-3 text-red-600" />
                                                                            </Button>
                                                                        </div>
                                                                    ) : (
                                                                        <div
                                                                            className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded truncate"
                                                                            onDoubleClick={() => handleCellEdit(rowIdx, col.name, row[col.name], true)}
                                                                        >
                                                                            {row[col.name] === null || row[col.name] === '' ? (
                                                                                <span className="text-muted-foreground italic">NULL</span>
                                                                            ) : (
                                                                                String(row[col.name])
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </TableCell>
                                                            ))}
                                                            {tableName && (
                                                                <TableCell>
                                                                    <div className="flex gap-1">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 px-2 text-green-600 hover:text-green-700"
                                                                            onClick={() => handleNewRowSubmit(rowIdx)}
                                                                            title="提交"
                                                                        >
                                                                            <Check className="h-3 w-3" />
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 px-2 text-red-600 hover:text-red-700"
                                                                            onClick={() => handleNewRowDelete(rowIdx)}
                                                                            title="取消"
                                                                        >
                                                                            <X className="h-3 w-3" />
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                            )}
                                                        </TableRow>
                                                    ))}

                                                    {/* 现有行 */}
                                                    {result.rows.map((row, rowIdx) => (
                                                        <TableRow
                                                            key={rowIdx}
                                                            className={cn(
                                                                "hover:bg-muted/50 cursor-pointer",
                                                                selectedRowIndices.includes(rowIdx) && "bg-blue-100 dark:bg-blue-900/40"
                                                            )}
                                                            onClick={(e) => {
                                                                // 支持 Ctrl/Cmd 多选
                                                                if (e.ctrlKey || e.metaKey) {
                                                                    if (selectedRowIndices.includes(rowIdx)) {
                                                                        setSelectedRowIndices(selectedRowIndices.filter(idx => idx !== rowIdx));
                                                                    } else {
                                                                        setSelectedRowIndices([...selectedRowIndices, rowIdx]);
                                                                    }
                                                                } else {
                                                                    // 单击选中单行
                                                                    setSelectedRowIndices([rowIdx]);
                                                                }
                                                            }}
                                                        >
                                                            {result.columns.map((col, colIdx) => (
                                                                <TableCell key={colIdx} className="whitespace-nowrap max-w-[300px]">
                                                                    {editingCell?.rowIdx === rowIdx && editingCell?.colName === col.name && !editingCell?.isNewRow ? (
                                                                        <div className="flex gap-1 items-center">
                                                                            <Input
                                                                                value={editValue}
                                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                                className="h-7 text-xs"
                                                                                autoFocus
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === 'Enter') handleCellSubmit();
                                                                                    if (e.key === 'Escape') handleCellCancel();
                                                                                }}
                                                                            />
                                                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleCellSubmit}>
                                                                                <Check className="h-3 w-3 text-green-600" />
                                                                            </Button>
                                                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleCellCancel}>
                                                                                <X className="h-3 w-3 text-red-600" />
                                                                            </Button>
                                                                        </div>
                                                                    ) : (
                                                                        <div
                                                                            className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded truncate"
                                                                            onDoubleClick={(e) => {
                                                                                e.stopPropagation();
                                                                                tableName && primaryKeys.length > 0 && handleCellEdit(rowIdx, col.name, row[col.name], false);
                                                                            }}
                                                                            title={tableName && primaryKeys.length === 0 ? "无主键，无法编辑" : "双击编辑"}
                                                                        >
                                                                            {row[col.name] === null ? (
                                                                                <span className="text-muted-foreground italic">NULL</span>
                                                                            ) : (
                                                                                <TextFormatterWrapper
                                                                                    content={String(row[col.name])}
                                                                                    onSave={tableName && primaryKeys.length > 0 ? async (newValue) => {
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
                                                                                            updatedRows[rowIdx] = { ...updatedRows[rowIdx], [col.name]: newValue };
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
                                                                                    } : undefined}
                                                                                    readonly={!tableName || primaryKeys.length === 0}
                                                                                    title="Format value"
                                                                                >
                                                                                    <div className="flex items-center gap-2 cursor-context-menu">
                                                                                        <span className="flex-1 truncate">{String(row[col.name])}</span>
                                                                                    </div>
                                                                                </TextFormatterWrapper>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </TableCell>
                                                            ))}
                                                        </TableRow>
                                                    ))}
                                                    {result.rows.length === 0 && newRows.length === 0 && (
                                                        <TableRow>
                                                            <TableCell colSpan={result.columns.length || 1} className="text-center h-24 text-muted-foreground">
                                                                No results
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        {/* 分页控件 */}
                                        {result.rows.length > 0 && (
                                            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handlePageChange(currentPage - 1)}
                                                        disabled={currentPage === 0}
                                                        className="h-7"
                                                    >
                                                        <ChevronLeft className="h-3 w-3" />
                                                        上一页
                                                    </Button>
                                                    <span>第 {currentPage + 1} 页</span>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handlePageChange(currentPage + 1)}
                                                        disabled={result.rows.length < pageSize}
                                                        className="h-7"
                                                    >
                                                        下一页
                                                        <ChevronRight className="h-3 w-3" />
                                                    </Button>

                                                    <div className="h-4 w-[1px] bg-border mx-2"></div>

                                                    {/* LIMIT 控制 */}
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">Limit:</span>
                                                        <Input
                                                            type="number"
                                                            value={pageSizeInput}
                                                            onChange={(e) => setPageSizeInput(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    handlePageSizeChange();
                                                                }
                                                            }}
                                                            className="w-16 h-7 text-xs"
                                                            min="1"
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={handlePageSizeChange}
                                                            className="h-7 w-7 p-0"
                                                            title="应用 Limit"
                                                        >
                                                            <Check className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div>
                                                    显示 {currentPage * pageSize + 1} - {currentPage * pageSize + result.rows.length} 条
                                                    {primaryKeys.length === 0 && tableName && (
                                                        <span className="ml-4 text-yellow-600 dark:text-yellow-400">
                                                            ⚠️ 表无主键，无法编辑/删除
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!result && !error && !isLoading && (
                                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                        Enter a query and click Run to see results
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
        </div>
    );
}
