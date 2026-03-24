import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
    Loader2, Plus, Trash2, RefreshCw, Edit2, Key,
    Hash, Type, Calendar, Binary, Database, List, FileCode, X, Table as TableIcon,
    Play, Trash, AlertCircle
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore.ts";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Badge } from "@/components/ui/badge.tsx";

import { ColumnEditor, ColumnDefinition } from "@/components/workspace/mysql/ColumnEditor.tsx";
import type { ExtendedColumnInfo, IndexInfo } from "@/types/sql";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { format } from 'sql-formatter';

// Use alias for local type clarity
type ColumnInfo = ExtendedColumnInfo;

// 待执行的SQL操作类型
type SqlOperationType = 'add_column' | 'modify_column' | 'drop_column' | 'add_index' | 'drop_index' | 'modify_index';

interface PendingSqlOperation {
    id: string;
    type: SqlOperationType;
    description: string;
    sql: string;
    originalName?: string; // 用于修改操作保存原始名称
}

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme.ts";
import { cn, transparentTheme } from "@/lib/utils.ts";
import { useDDLPanelResize } from "@/hooks/useDDLPanelResize";
import { invokeSql } from "@/lib/api.ts";

interface TableSchemaManagerProps {
    connectionId: number;
    dbName: string;
    tableName: string;
    onRefresh?: () => void;
}

export function TableSchemaManager({ connectionId, dbName, tableName, onRefresh }: TableSchemaManagerProps) {
    const { t } = useTranslation();
    const isDark = useIsDarkTheme();
    const connection = useAppStore(state => state.connections.find(c => c.id === connectionId));
    const [columns, setColumns] = useState<ColumnInfo[]>([]);
    const [indexes, setIndexes] = useState<IndexInfo[]>([]);
    const [tableComment, setTableComment] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Column editor state
    const [showColumnEditor, setShowColumnEditor] = useState(false);
    const [editingColumn, setEditingColumn] = useState<ColumnDefinition | undefined>(undefined);
    const [editorMode, setEditorMode] = useState<'add' | 'edit'>('add');

    // DDL Viewer state
    const [showDDL, setShowDDL] = useState(false);
    const [ddlContent, setDDLContent] = useState('');
    const ddlPanelRef = useDDLPanelResize(ddlContent, showDDL);

    // SQL预览队列状态
    const [pendingSqlOperations, setPendingSqlOperations] = useState<PendingSqlOperation[]>([]);
    const [isExecuting, setIsExecuting] = useState(false);

    // Index Editor state
    const [showIndexEditor, setShowIndexEditor] = useState(false);
    const [indexEditorMode, setIndexEditorMode] = useState<'add' | 'edit'>('add');
    const [editingIndexOldName, setEditingIndexOldName] = useState<string>('');
    const [indexForm, setIndexForm] = useState({
        name: '',
        type: 'INDEX' as 'INDEX' | 'UNIQUE' | 'FULLTEXT',
        columns: [] as string[]
    });

    const lastLoadedRef = useRef<string>("");

    useEffect(() => {
        if (dbName && tableName) {
            const signature = `${connectionId}-${dbName}-${tableName}`;
            if (lastLoadedRef.current === signature) return;
            loadSchema();
        }
    }, [connectionId, dbName, tableName]);

    const loadSchema = async (force = false) => {
        if (!dbName || !tableName) return;

        const signature = `${connectionId}-${dbName}-${tableName}`;
        if (!force && lastLoadedRef.current === signature) {
            return;
        }
        lastLoadedRef.current = signature;

        setIsLoading(true);
        setError(null);

        try {
            const [columnsResult, indexesResult, tableStatusResult] = await Promise.all([
                invokeSql<any>({
                    connectionId,
                    sql: `SHOW FULL COLUMNS FROM \`${dbName}\`.\`${tableName}\``
                }),
                invokeSql<any>({
                    connectionId,
                    sql: `SHOW INDEX FROM \`${dbName}\`.\`${tableName}\``
                }),
                invokeSql<any>({
                    connectionId,
                    sql: `SHOW TABLE STATUS FROM \`${dbName}\` WHERE Name = '${tableName}'`
                })
            ]);

            setColumns(columnsResult.rows || []);
            setIndexes(indexesResult.rows || []);

            if (tableStatusResult.rows && tableStatusResult.rows.length > 0) {
                setTableComment(tableStatusResult.rows[0].Comment || '');
            }
        } catch (err: any) {
            console.error("Failed to load schema:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));
            // Reset signature on error to allow retry
            lastLoadedRef.current = "";
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteColumn = async (columnName: string) => {

        // 添加到待执行队列
        const sql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` DROP COLUMN \`${columnName}\``;
        const newOperation: PendingSqlOperation = {
            id: `drop_col_${Date.now()}`,
            type: 'drop_column',
            description: t('mysql.operation.dropColumn', { column: columnName }),
            sql: sql
        };
        setPendingSqlOperations(prev => [...prev, newOperation]);
    };

    const handleDeleteIndex = async (indexName: string) => {
        if (indexName === 'PRIMARY') {
            alert(t('mysql.primary') + ' ' + t('common.delete', 'Delete'));
            return;
        }

        // 添加到待执行队列
        const sql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` DROP INDEX \`${indexName}\``;
        const newOperation: PendingSqlOperation = {
            id: `drop_idx_${Date.now()}`,
            type: 'drop_index',
            description: t('mysql.operation.dropIndex', { index: indexName }),
            sql: sql
        };
        setPendingSqlOperations(prev => [...prev, newOperation]);
    };

    const handleAddColumn = () => {
        setEditorMode('add');
        setEditingColumn(undefined);
        setShowColumnEditor(true);
    };

    const handleEditColumn = (col: ColumnInfo) => {
        // 解析列类型和长度
        const typeMatch = col.Type.match(/^(\w+)(\((.+)\))?/);
        const baseType = typeMatch?.[1] || col.Type;
        const length = typeMatch?.[3] || '';

        setEditorMode('edit');
        setEditingColumn({
            name: col.Field,
            type: baseType.toUpperCase(),
            length: length,
            nullable: col.Null === 'YES',
            defaultValue: col.Default || '',
            autoIncrement: col.Extra.includes('auto_increment'),
            comment: '',
        });
        setShowColumnEditor(true);
    };

    const handlePreviewColumn = (columnDef: ColumnDefinition, sqlPart: string) => {
        // 构建完整的 ALTER TABLE 语句
        const fullSql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` ${sqlPart}`;
        const isAdd = editorMode === 'add';
        const columnName = columnDef.name;

        setPendingSqlOperations(prev => {
            // 查找是否已有对同一列的操作（修改列时通过 originalName 匹配，添加列时通过列名匹配）
            const existingIndex = prev.findIndex(op => {
                if (isAdd) {
                    // 添加列：检查是否有添加同名列的操作
                    return op.type === 'add_column' && op.originalName === columnName;
                } else {
                    // 修改列：检查是否有修改该列的操作（通过 originalName 匹配）
                    return (op.type === 'modify_column' || op.type === 'add_column') &&
                        (op.originalName === columnName ||
                            op.description.includes(columnName));
                }
            });

            const newOperation: PendingSqlOperation = {
                id: `${isAdd ? 'add' : 'mod'}_col_${Date.now()}`,
                type: isAdd ? 'add_column' : 'modify_column',
                description: isAdd
                    ? t('mysql.operation.addColumn', { column: columnDef.name })
                    : t('mysql.operation.modifyColumn', { column: columnDef.name }),
                sql: fullSql,
                originalName: columnName
            };

            if (existingIndex >= 0) {
                // 替换已有的操作
                const newOps = [...prev];
                newOps[existingIndex] = newOperation;
                return newOps;
            } else {
                // 添加新操作
                return [...prev, newOperation];
            }
        });
    };

    const getColumnTypeIcon = (type: string) => {
        const upperType = type.toUpperCase();
        if (upperType.includes("INT") || upperType.includes("FLOAT") || upperType.includes("DOUBLE") || upperType.includes("DECIMAL")) {
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
    };

    const handleViewDDL = async () => {
        if (ddlContent && ddlContent !== 'Loading...') return; // Already loaded

        setDDLContent('Loading...');
        try {
            const sql = `SHOW CREATE TABLE \`${dbName}\`.\`${tableName}\``;

            const result = await invokeSql<any>({
                connectionId,
                sql
            });
            if (result.rows && result.rows.length > 0) {
                // The result usually has a column 'Create Table'
                setDDLContent(result.rows[0]['Create Table'] || 'No DDL found');
            } else {
                setDDLContent('No DDL found');
            }
        } catch (err: any) {
            console.error("Failed to load DDL:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));
            setDDLContent('Error loading DDL');
        }
    };

    const handleAddIndex = () => {
        setIndexEditorMode('add');
        setIndexForm({
            name: '',
            type: 'INDEX',
            columns: []
        });
        setShowIndexEditor(true);
    };

    const handleEditIndex = (indexName: string, indexTypeStr: string, indexCols: IndexInfo[]) => {
        setIndexEditorMode('edit');
        setEditingIndexOldName(indexName);

        let type: 'INDEX' | 'UNIQUE' | 'FULLTEXT' = 'INDEX';
        if (indexName === 'PRIMARY') type = 'UNIQUE'; // Treat primary as unique for form, though we might disable editing primary key name easily
        else if (indexTypeStr === 'UNIQUE') type = 'UNIQUE';
        else if (indexTypeStr === 'FULLTEXT') type = 'FULLTEXT';

        // Use mapped columns
        setIndexForm({
            name: indexName,
            type: type,
            columns: indexCols.sort((a, b) => a.Seq_in_index - b.Seq_in_index).map(c => c.Column_name)
        });
        setShowIndexEditor(true);
    };

    const handleSaveIndex = () => {
        if (!indexForm.name || indexForm.columns.length === 0) {
            alert(t('mysql.indexFormInvalid', 'Invalid index form'));
            return;
        }

        const indexTypeClause = indexForm.type === 'UNIQUE' ? 'UNIQUE INDEX' :
            indexForm.type === 'FULLTEXT' ? 'FULLTEXT INDEX' : 'INDEX';

        const colsClause = indexForm.columns.map(c => `\`${c}\``).join(', ');

        let sql = '';
        let description = '';
        let type: SqlOperationType;

        if (indexEditorMode === 'add') {
            sql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` ADD ${indexTypeClause} \`${indexForm.name}\` (${colsClause})`;
            description = t('mysql.operation.addIndex', { index: indexForm.name });
            type = 'add_index';
        } else {
            // Edit mode: DROP old then ADD new
            if (editingIndexOldName === 'PRIMARY') {
                alert(t('mysql.primaryKeyEditAlert', 'Editing Primary Key is effectively dropping and re-adding. Provide logic if needed.'));
                return;
            }

            sql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` DROP INDEX \`${editingIndexOldName}\`, ADD ${indexTypeClause} \`${indexForm.name}\` (${colsClause})`;
            description = t('mysql.operation.modifyIndex', { oldIndex: editingIndexOldName, newIndex: indexForm.name });
            type = 'modify_index';
        }

        const newOperation: PendingSqlOperation = {
            id: `${indexEditorMode === 'add' ? 'add' : 'mod'}_idx_${Date.now()}`,
            type: type,
            description: description,
            sql: sql,
            originalName: indexEditorMode === 'edit' ? editingIndexOldName : undefined
        };
        setPendingSqlOperations(prev => [...prev, newOperation]);
        setShowIndexEditor(false);
    };

    const getIndexTypeBadge = (indexName: string, nonUnique: number) => {
        if (indexName === 'PRIMARY') {
            return <Badge variant="default" className="bg-blue-600">{t('mysql.primary')}</Badge>;
        }
        if (nonUnique === 0) {
            return <Badge variant="default" className="bg-green-600">{t('mysql.unique')}</Badge>;
        }
        return <Badge variant="outline">{t('mysql.index')}</Badge>;
    };

    // 将索引按名称分组
    const groupedIndexes = indexes.reduce((acc, index) => {
        if (!acc[index.Key_name]) {
            acc[index.Key_name] = [];
        }
        acc[index.Key_name].push(index);
        return acc;
    }, {} as Record<string, IndexInfo[]>);

    // 执行所有待执行的SQL操作
    const handleExecuteSql = async () => {
        if (pendingSqlOperations.length === 0) return;

        setIsExecuting(true);
        setError(null);

        try {
            // 合并所有ALTER TABLE操作
            const alterOperations = pendingSqlOperations.filter(op =>
                op.sql.startsWith('ALTER TABLE')
            );
            const otherOperations = pendingSqlOperations.filter(op =>
                !op.sql.startsWith('ALTER TABLE')
            );

            // 执行合并后的ALTER TABLE操作
            if (alterOperations.length > 0) {
                // 从第一个SQL提取表名
                const firstSql = alterOperations[0].sql;
                const tableMatch = firstSql.match(/ALTER TABLE `([^`]+)`\.`([^`]+)`/);
                if (!tableMatch) throw new Error('无法解析表名');

                const [, db, table] = tableMatch;

                // 合并所有ALTER操作
                const alterClauses = alterOperations.map(op => {
                    // 提取ALTER TABLE之后的部分
                    const match = op.sql.match(/ALTER TABLE `[^`]+`\.`[^`]+` (.+)/);
                    return match ? match[1] : '';
                }).filter(Boolean);

                if (alterClauses.length > 0) {
                    const combinedSql = `ALTER TABLE \`${db}\`.\`${table}\` ${alterClauses.join(', ')}`;
                    await invokeSql({
                        connectionId,
                        sql: combinedSql
                    });
                }
            }

            // 执行其他操作
            for (const op of otherOperations) {
                await invokeSql({
                    connectionId,
                    sql: op.sql
                });
            }

            // 清空队列
            setPendingSqlOperations([]);
            // 重新加载结构
            loadSchema(true);
            onRefresh?.();
        } catch (err: any) {
            console.error("Failed to execute SQL:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));
        } finally {
            setIsExecuting(false);
        }
    };

    // 移除单个待执行操作
    const handleRemovePendingOperation = (id: string) => {
        setPendingSqlOperations(prev => prev.filter(op => op.id !== id));
    };

    // 清空所有待执行操作
    const handleClearPendingOperations = () => {
        setPendingSqlOperations([]);
    };

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="p-3 border-b bg-muted/10">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
                        <Database className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex items-center gap-1 min-w-0">
                            <span className="text-sm font-semibold whitespace-nowrap shrink-0">{t('mysql.tableStructure')}:</span>
                            <span className="text-sm font-semibold truncate shrink" title={tableName}>{tableName}</span>
                            {tableComment && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap truncate ml-2" title={tableComment}>
                                    ({tableComment})
                                </span>
                            )}
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => loadSchema(true)}
                        disabled={isLoading}
                        className="h-7 whitespace-nowrap shrink-0"
                    >
                        <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                        {t('mysql.refreshSchema')}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            if (!connection) return;
                            const addTab = useAppStore.getState().addTab;
                            const tabId = `query-${connectionId}-${dbName}-${tableName}`;
                            const initialSql = `SELECT * FROM \`${dbName}\`.\`${tableName}\``;
                            addTab({
                                id: tabId,
                                title: tableName ? `${tableName} - Query` : `${dbName} - Query`,
                                type: connection.db_type,
                                connectionId: connectionId,
                                dbName,
                                tableName,
                                initialSql
                            });
                        }}
                        className="h-7 whitespace-nowrap shrink-0 ml-1"
                    >
                        <TableIcon className="h-3 w-3 mr-1" />
                        {t('mysql.viewData', 'View Data')}
                    </Button>
                    <Button
                        variant={showDDL ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => {
                            if (!showDDL) {
                                handleViewDDL();
                            }
                            setShowDDL(!showDDL);
                        }}
                        className={cn("h-7 whitespace-nowrap shrink-0 ml-1", showDDL && "bg-muted")}
                    >
                        <FileCode className="h-3 w-3 mr-1" />
                        {t('mysql.viewDDL', 'DDL')}
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                <ResizablePanelGroup direction="vertical">
                    <ResizablePanel defaultSize={showDDL ? 60 : 100} minSize={30}>
                        <div className="h-full flex flex-col p-4 bg-background">
                            {error && (
                                <div className="mb-4 p-4 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm">
                                    {error}
                                </div>
                            )}

                            {isLoading ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    {t('mysql.loadingSchema')}
                                </div>
                            ) : (
                                <Tabs defaultValue="columns" className="flex-1 flex flex-col min-h-0">
                                    <TabsList className="mb-4 shrink-0">
                                        <TabsTrigger value="columns" className="gap-2">
                                            <List className="h-3 w-3" />
                                            {t('mysql.columns')} ({columns.length})
                                        </TabsTrigger>
                                        <TabsTrigger value="indexes" className="gap-2">
                                            <Key className="h-3 w-3" />
                                            {t('mysql.indexes')} ({Object.keys(groupedIndexes).length})
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="columns" className="mt-0 flex-1 overflow-hidden min-h-0">
                                        <div className="h-full flex flex-col">
                                            <div className="border rounded-md bg-background flex-1 overflow-auto min-h-0 relative">
                                                <Table containerClassName="overflow-visible">
                                                    <TableHeader className="sticky top-0 bg-muted z-10">
                                                        <TableRow>
                                                            <TableHead className="w-[200px]">{t('mysql.columnName')}</TableHead>
                                                            <TableHead className="w-[150px]">{t('mysql.dataType')}</TableHead>
                                                            <TableHead className="w-[100px]">{t('mysql.nullable')}</TableHead>
                                                            <TableHead className="w-[100px]">{t('mysql.key')}</TableHead>
                                                            <TableHead className="w-[150px]">{t('mysql.defaultValue')}</TableHead>
                                                            <TableHead className="w-[120px]">{t('mysql.extra')}</TableHead>
                                                            <TableHead className="w-[200px]">{t('mysql.comment', 'Comment')}</TableHead>
                                                            <TableHead className="w-[100px]">{t('common.actions')}</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {columns.map((col, idx) => (
                                                            <TableRow key={idx}>
                                                                <TableCell className="font-medium">
                                                                    <div className="flex items-center gap-2">
                                                                        {getColumnTypeIcon(col.Type)}
                                                                        {col.Field}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="font-mono text-xs">{col.Type}</TableCell>
                                                                <TableCell>
                                                                    {col.Null === 'YES' ? (
                                                                        <Badge variant="outline" className="text-xs">{t('common.yes', 'Yes')}</Badge>
                                                                    ) : (
                                                                        <Badge variant="secondary" className="text-xs">{t('common.no', 'No')}</Badge>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {col.Key && (
                                                                        <Badge variant={col.Key === 'PRI' ? 'default' : 'outline'} className="text-xs">
                                                                            {col.Key === 'PRI' ? t('mysql.primary', 'Primary Key') : col.Key === 'UNI' ? t('mysql.unique', 'Unique') : col.Key === 'MUL' ? t('mysql.index', 'Index') : col.Key}
                                                                        </Badge>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="font-mono text-xs">
                                                                    {col.Default === null ? (
                                                                        <span className="text-muted-foreground italic">NULL</span>
                                                                    ) : (
                                                                        col.Default
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {col.Extra || '-'}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {col.Comment || '-'}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="flex gap-1">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 px-2"
                                                                            title={t('mysql.editColumn')}
                                                                            onClick={() => handleEditColumn(col)}
                                                                        >
                                                                            <Edit2 className="h-3 w-3" />
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 px-2 text-red-600 hover:text-red-700"
                                                                            onClick={() => handleDeleteColumn(col.Field)}
                                                                            title={t('mysql.deleteColumn')}
                                                                            disabled={col.Key === 'PRI'}
                                                                        >
                                                                            <Trash2 className="h-3 w-3" />
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        {columns.length === 0 && (
                                                            <TableRow>
                                                                <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                                                                    {t('mysql.noColumns')}
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            <div className="mt-4 flex gap-2 shrink-0">
                                                <Button size="sm" variant="outline" className="gap-2" onClick={handleAddColumn}>
                                                    <Plus className="h-3 w-3" />
                                                    {t('mysql.addColumn')}
                                                </Button>
                                            </div>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="indexes" className="mt-0 flex-1 overflow-hidden min-h-0">
                                        <div className="h-full flex flex-col">
                                            <div className="border rounded-md bg-background flex-1 overflow-auto min-h-0 relative">
                                                <Table containerClassName="overflow-visible">
                                                    <TableHeader className="sticky top-0 bg-muted z-10">
                                                        <TableRow>
                                                            <TableHead className="w-[200px]">{t('mysql.indexName')}</TableHead>
                                                            <TableHead className="w-[120px]">{t('mysql.indexType')}</TableHead>
                                                            <TableHead>{t('mysql.indexColumns')}</TableHead>
                                                            <TableHead className="w-[120px]">{t('mysql.cardinality')}</TableHead>
                                                            <TableHead className="w-[100px]">{t('common.actions')}</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {Object.entries(groupedIndexes).map(([indexName, indexCols]) => (
                                                            <TableRow key={indexName}>
                                                                <TableCell className="font-medium">{indexName}</TableCell>
                                                                <TableCell>
                                                                    {getIndexTypeBadge(indexName, indexCols[0].Non_unique)}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {indexCols
                                                                            .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
                                                                            .map((col, idx) => (
                                                                                <Badge key={idx} variant="outline" className="text-xs">
                                                                                    {col.Column_name}
                                                                                </Badge>
                                                                            ))}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {indexCols[0].Cardinality ?? '-'}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-7 px-2"
                                                                        title={t('common.edit')}
                                                                        onClick={() => {
                                                                            const isUnique = indexCols[0].Non_unique === 0;
                                                                            const type = indexName === 'PRIMARY' ? 'PRIMARY' : isUnique ? 'UNIQUE' : 'INDEX'; // Simplified detection
                                                                            handleEditIndex(indexName, type, indexCols);
                                                                        }}
                                                                        disabled={indexName === 'PRIMARY'}
                                                                    >
                                                                        <Edit2 className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-7 px-2 text-red-600 hover:text-red-700"
                                                                        onClick={() => handleDeleteIndex(indexName)}
                                                                        title={t('mysql.deleteIndex')}
                                                                        disabled={indexName === 'PRIMARY'}
                                                                    >
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        {Object.keys(groupedIndexes).length === 0 && (
                                                            <TableRow>
                                                                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                                                    {t('common.noResults')}
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>

                                            <div className="mt-4 flex gap-2 shrink-0">
                                                <Button size="sm" variant="outline" className="gap-2" onClick={handleAddIndex}>
                                                    <Plus className="h-3 w-3" />
                                                    {t('mysql.addIndex')}
                                                </Button>
                                            </div>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            )}
                        </div>
                    </ResizablePanel>

                    {showDDL && (
                        <>
                            <ResizableHandle withHandle />
                            <ResizablePanel ref={ddlPanelRef} defaultSize={20} minSize={10} maxSize={80}>
                                <div className="h-full flex flex-col bg-background border-t">
                                    <div className="flex-1 overflow-auto bg-background relative">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="absolute top-2 right-2 h-6 w-6 p-0 z-10"
                                            onClick={() => setShowDDL(false)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                        {ddlContent === 'Loading...' ? (
                                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                {t('common.loading', 'Loading...')}
                                            </div>
                                        ) : (
                                            <SyntaxHighlighter
                                                language="sql"
                                                style={transparentTheme(isDark ? vscDarkPlus : vs)}
                                                customStyle={{ margin: 0, height: '100%', borderRadius: 0, fontSize: '14px', backgroundColor: 'transparent' }}
                                                wrapLongLines={true}
                                            >
                                                {ddlContent}
                                            </SyntaxHighlighter>
                                        )}
                                    </div>
                                </div>
                            </ResizablePanel>
                        </>
                    )}

                    {/* SQL预览面板 */}
                    {pendingSqlOperations.length > 0 && (
                        <>
                            <ResizableHandle withHandle />
                            <ResizablePanel defaultSize={30} minSize={15} maxSize={50}>
                                <div className="h-full flex flex-col bg-background border-t">
                                    <div className="p-2 border-b bg-muted/30 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 text-amber-500" />
                                            <span className="text-sm font-medium">
                                                {t('mysql.pendingChanges')} ({pendingSqlOperations.length})
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 text-red-600 hover:text-red-700"
                                                onClick={handleClearPendingOperations}
                                                disabled={isExecuting}
                                            >
                                                <Trash className="h-3 w-3 mr-1" />
                                                {t('common.clear')}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="default"
                                                className="h-7 px-3"
                                                onClick={handleExecuteSql}
                                                disabled={isExecuting}
                                            >
                                                {isExecuting ? (
                                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                ) : (
                                                    <Play className="h-3 w-3 mr-1" />
                                                )}
                                                {isExecuting ? t('common.executing') : t('common.execute')}
                                            </Button>
                                        </div>
                                    </div>
                                    <ScrollArea className="flex-1">
                                        <div className="p-3">
                                            {/* 操作列表摘要 */}
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {pendingSqlOperations.map((op) => (
                                                    <Badge key={op.id} variant="outline" className="text-xs flex items-center gap-1">
                                                        <span>
                                                            {op.type === 'add_column' && t('mysql.addColumn')}
                                                            {op.type === 'modify_column' && t('mysql.modifyColumn')}
                                                            {op.type === 'drop_column' && t('mysql.dropColumn')}
                                                            {op.type === 'add_index' && t('mysql.addIndex')}
                                                            {op.type === 'modify_index' && t('mysql.modifyIndex')}
                                                            {op.type === 'drop_index' && t('mysql.dropIndex')}
                                                        </span>
                                                        <span className="font-medium">{op.originalName || op.description.split(':')[1]?.trim()}</span>
                                                        <X
                                                            className="h-3 w-3 cursor-pointer hover:text-red-600 ml-1"
                                                            onClick={() => handleRemovePendingOperation(op.id)}
                                                        />
                                                    </Badge>
                                                ))}
                                            </div>
                                            {/* 合并后的SQL */}
                                            <SyntaxHighlighter
                                                language="sql"
                                                style={transparentTheme(isDark ? vscDarkPlus : vs)}
                                                customStyle={{ margin: 0, padding: '12px', borderRadius: '6px', fontSize: '13px', backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)' }}
                                                wrapLongLines={true}
                                            >
                                                {((): string => {
                                                    const alterOps = pendingSqlOperations.filter(op => op.sql.startsWith('ALTER TABLE'));
                                                    if (alterOps.length === 0) return pendingSqlOperations.map(op => op.sql).join(';' + '\n');

                                                    const firstSql = alterOps[0].sql;
                                                    const tableMatch = firstSql.match(/ALTER TABLE `([^`]+)`\.`([^`]+)`/);
                                                    if (!tableMatch) return pendingSqlOperations.map(op => op.sql).join(';\n');

                                                    const [, db, table] = tableMatch;
                                                    const clauses = alterOps.map(op => {
                                                        const match = op.sql.match(/ALTER TABLE `[^`]+`\.`[^`]+` (.+)/);
                                                        return match ? match[1] : '';
                                                    }).filter(Boolean);

                                                    const rawSql = `ALTER TABLE \`${db}\`.\`${table}\` ${clauses.join(', ')};`;

                                                    // 使用 sql-formatter 美化 SQL
                                                    try {
                                                        return format(rawSql, {
                                                            language: 'mysql',
                                                            keywordCase: 'upper',
                                                            linesBetweenQueries: 1,
                                                        });
                                                    } catch {
                                                        return rawSql;
                                                    }
                                                })()}
                                            </SyntaxHighlighter>
                                        </div>
                                    </ScrollArea>
                                </div>
                            </ResizablePanel>
                        </>
                    )}
                </ResizablePanelGroup>
            </div>

            {/* Column Editor Dialog */}
            <ColumnEditor
                open={showColumnEditor}
                onOpenChange={setShowColumnEditor}
                onPreview={handlePreviewColumn}
                initialData={editingColumn}
                mode={editorMode}
                existingColumns={columns.map(c => c.Field)}
            />

            {/* Index Editor Dialog */}
            <Dialog open={showIndexEditor} onOpenChange={setShowIndexEditor}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{indexEditorMode === 'add' ? t('mysql.addIndex') : t('mysql.editIndex', 'Edit Index')}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="index-name" className="text-right">
                                {t('mysql.indexName')}
                            </Label>
                            <Input
                                id="index-name"
                                value={indexForm.name}
                                onChange={(e) => setIndexForm({ ...indexForm, name: e.target.value })}
                                className="col-span-3"
                                placeholder="idx_name"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="index-type" className="text-right">
                                {t('mysql.indexType')}
                            </Label>
                            <Select
                                value={indexForm.type}
                                onValueChange={(val: 'INDEX' | 'UNIQUE' | 'FULLTEXT') => setIndexForm({ ...indexForm, type: val })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="INDEX">Normal (INDEX)</SelectItem>
                                    <SelectItem value="UNIQUE">Unique (UNIQUE)</SelectItem>
                                    <SelectItem value="FULLTEXT">Full Text (FULLTEXT)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label className="mb-1">{t('mysql.indexColumns')}</Label>
                            <div className="border rounded-md p-2 h-[200px] overflow-auto space-y-2">
                                {columns.map(col => (
                                    <div key={col.Field} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`col-${col.Field}`}
                                            checked={indexForm.columns.includes(col.Field)}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    setIndexForm(prev => ({ ...prev, columns: [...prev.columns, col.Field] }));
                                                } else {
                                                    setIndexForm(prev => ({ ...prev, columns: prev.columns.filter(c => c !== col.Field) }));
                                                }
                                            }}
                                        />
                                        <Label htmlFor={`col-${col.Field}`} className="text-sm font-normal cursor-pointer text-foreground">
                                            {col.Field} <span className="text-xs text-muted-foreground ml-1">({col.Type})</span>
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowIndexEditor(false)}>{t('common.cancel', 'Cancel')}</Button>
                        <Button onClick={handleSaveIndex}>{t('common.save', 'Save')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
