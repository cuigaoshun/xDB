import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button.tsx";
import {
    Loader2, Plus, Trash2, RefreshCw, Edit2, Key,
    Hash, Type, Calendar, Binary, Database, List, FileCode, X
} from "lucide-react";
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
import { addCommandToConsole } from "@/components/ui/CommandConsole.tsx";
import { confirm } from "@/hooks/use-toast.ts";
import { ColumnEditor, ColumnDefinition } from "@/components/workspace/mysql/ColumnEditor.tsx";
import type { ExtendedColumnInfo, IndexInfo } from "@/types/sql";

// Use alias for local type clarity
type ColumnInfo = ExtendedColumnInfo;

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme.ts";
import { cn, transparentTheme } from "@/lib/utils.ts";

interface TableSchemaManagerProps {
    connectionId: number;
    dbName: string;
    tableName: string;
    onRefresh?: () => void;
}

export function TableSchemaManager({ connectionId, dbName, tableName, onRefresh }: TableSchemaManagerProps) {
    const { t } = useTranslation();
    const isDark = useIsDarkTheme();
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

    // Index Editor state
    const [showIndexEditor, setShowIndexEditor] = useState(false);
    const [indexEditorMode, setIndexEditorMode] = useState<'add' | 'edit'>('add');
    const [editingIndexOldName, setEditingIndexOldName] = useState<string>('');
    const [indexForm, setIndexForm] = useState({
        name: '',
        type: 'INDEX' as 'INDEX' | 'UNIQUE' | 'FULLTEXT',
        columns: [] as string[]
    });

    useEffect(() => {
        if (dbName && tableName) {
            loadSchema();
        }
    }, [dbName, tableName]);

    const loadSchema = async () => {
        setIsLoading(true);
        setError(null);

        try {
            // 加载列信息
            const columnsQuery = `SHOW FULL COLUMNS FROM \`${dbName}\`.\`${tableName}\``;
            const startTime1 = Date.now();
            const columnsResult = await invoke<any>("execute_sql", {
                connectionId,
                sql: columnsQuery
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: columnsQuery,
                duration: Date.now() - startTime1,
                success: true
            });

            setColumns(columnsResult.rows || []);

            // 加载索引信息
            const indexesQuery = `SHOW INDEX FROM \`${dbName}\`.\`${tableName}\``;
            const startTime2 = Date.now();
            const indexesResult = await invoke<any>("execute_sql", {
                connectionId,
                sql: indexesQuery
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: indexesQuery,
                duration: Date.now() - startTime2,
                success: true
            });

            setIndexes(indexesResult.rows || []);

            // 加载表注释
            const tableStatusQuery = `SHOW TABLE STATUS FROM \`${dbName}\` WHERE Name = '${tableName}'`;
            const startTime3 = Date.now();
            const tableStatusResult = await invoke<any>('execute_sql', {
                connectionId,
                sql: tableStatusQuery
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: tableStatusQuery,
                duration: Date.now() - startTime3,
                success: true
            });

            if (tableStatusResult.rows && tableStatusResult.rows.length > 0) {
                setTableComment(tableStatusResult.rows[0].Comment || '');
            }
        } catch (err: any) {
            console.error("Failed to load schema:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteColumn = async (columnName: string) => {
        const confirmed = await confirm({
            title: t('common.confirmDeletion'),
            description: t('mysql.confirmDeleteColumn', { column: columnName }),
            variant: 'destructive'
        });
        if (!confirmed) return;

        try {
            const sql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` DROP COLUMN \`${columnName}\``;
            const startTime = Date.now();

            await invoke("execute_sql", {
                connectionId,
                sql
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: sql,
                duration: Date.now() - startTime,
                success: true
            });

            // 重新加载结构
            loadSchema();
            onRefresh?.();
        } catch (err: any) {
            console.error("Failed to delete column:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));

            addCommandToConsole({
                databaseType: 'mysql',
                command: `ALTER TABLE \`${dbName}\`.\`${tableName}\` DROP COLUMN \`${columnName}\``,
                duration: 0,
                success: false,
                error: typeof err === 'string' ? err : JSON.stringify(err)
            });
        }
    };

    const handleDeleteIndex = async (indexName: string) => {
        if (indexName === 'PRIMARY') {
            alert(t('mysql.primary') + ' ' + t('common.delete'));
            return;
        }

        const confirmed = await confirm({
            title: t('common.confirmDeletion'),
            description: t('mysql.confirmDeleteIndex', { index: indexName }),
            variant: 'destructive'
        });
        if (!confirmed) return;

        try {
            const sql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` DROP INDEX \`${indexName}\``;
            const startTime = Date.now();

            await invoke("execute_sql", {
                connectionId,
                sql
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: sql,
                duration: Date.now() - startTime,
                success: true
            });

            // 重新加载结构
            loadSchema();
            onRefresh?.();
        } catch (err: any) {
            console.error("Failed to delete index:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));

            addCommandToConsole({
                databaseType: 'mysql',
                command: `ALTER TABLE \`${dbName}\`.\`${tableName}\` DROP INDEX \`${indexName}\``,
                duration: 0,
                success: false,
                error: typeof err === 'string' ? err : JSON.stringify(err)
            });
        }
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

    const handleSaveColumn = async (columnDef: ColumnDefinition) => {
        try {
            let sql = '';

            // 构建列定义
            let columnSpec = `\`${columnDef.name}\` ${columnDef.type}`;
            if (columnDef.length) {
                columnSpec += `(${columnDef.length})`;
            }
            columnSpec += columnDef.nullable ? ' NULL' : ' NOT NULL';
            if (columnDef.defaultValue) {
                columnSpec += ` DEFAULT '${columnDef.defaultValue.replace(/'/g, "''")}' `;
            }
            if (columnDef.autoIncrement) {
                columnSpec += ' AUTO_INCREMENT';
            }
            if (columnDef.comment) {
                columnSpec += ` COMMENT '${columnDef.comment.replace(/'/g, "''")}' `;
            }

            if (editorMode === 'add') {
                sql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` ADD COLUMN ${columnSpec}`;
                if (columnDef.position === 'FIRST') {
                    sql += ' FIRST';
                } else if (columnDef.position === 'AFTER' && columnDef.afterColumn) {
                    sql += ` AFTER \`${columnDef.afterColumn}\``;
                }
            } else {
                sql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` MODIFY COLUMN ${columnSpec}`;
            }

            const startTime = Date.now();
            await invoke("execute_sql", {
                connectionId,
                sql
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: sql,
                duration: Date.now() - startTime,
                success: true
            });

            // 重新加载结构
            loadSchema();
            onRefresh?.();
        } catch (err: any) {
            console.error("Failed to save column:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));

            addCommandToConsole({
                databaseType: 'mysql',
                command: `ALTER TABLE \`${dbName}\`.\`${tableName}\` ...`,
                duration: 0,
                success: false,
                error: typeof err === 'string' ? err : JSON.stringify(err)
            });

            throw err;
        }
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
            const startTime = Date.now();
            const result = await invoke<any>("execute_sql", {
                connectionId,
                sql
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: sql,
                duration: Date.now() - startTime,
                success: true
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

    const handleSaveIndex = async () => {
        if (!indexForm.name || indexForm.columns.length === 0) {
            alert(t('mysql.indexFormInvalid', 'Invalid index form'));
            return;
        }

        try {
            const indexTypeClause = indexForm.type === 'UNIQUE' ? 'UNIQUE INDEX' :
                indexForm.type === 'FULLTEXT' ? 'FULLTEXT INDEX' : 'INDEX';

            const colsClause = indexForm.columns.map(c => `\`${c}\``).join(', ');

            let sql = '';

            if (indexEditorMode === 'add') {
                sql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` ADD ${indexTypeClause} \`${indexForm.name}\` (${colsClause})`;
            } else {
                // Edit mode: DROP old then ADD new
                // We do this in one statement ideally, or two. One statement is safer for rename.
                // ALTER TABLE tbl DROP INDEX old, ADD INDEX new ...
                if (editingIndexOldName === 'PRIMARY') {
                    // Special handing for primary key if needed, or just forbid editing primary key name/type easily
                    alert("Editing Primary Key is effectively dropping and re-adding. Provide logic if needed.");
                    return;
                }

                sql = `ALTER TABLE \`${dbName}\`.\`${tableName}\` DROP INDEX \`${editingIndexOldName}\`, ADD ${indexTypeClause} \`${indexForm.name}\` (${colsClause})`;
            }

            const startTime = Date.now();
            await invoke("execute_sql", {
                connectionId,
                sql
            });

            addCommandToConsole({
                databaseType: 'mysql',
                command: sql,
                duration: Date.now() - startTime,
                success: true
            });

            setShowIndexEditor(false);
            loadSchema();
            onRefresh?.();
        } catch (err: any) {
            console.error("Failed to save index:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));
            throw err;
        }
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
                        onClick={loadSchema}
                        disabled={isLoading}
                        className="h-7 whitespace-nowrap shrink-0"
                    >
                        <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                        {t('mysql.refreshSchema')}
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
                <ResizablePanelGroup direction="horizontal">
                    <ResizablePanel defaultSize={showDDL ? 70 : 100} minSize={30}>
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
                                <Tabs defaultValue="columns" className="h-full">
                                    <TabsList className="mb-4">
                                        <TabsTrigger value="columns" className="gap-2">
                                            <List className="h-3 w-3" />
                                            {t('mysql.columns')} ({columns.length})
                                        </TabsTrigger>
                                        <TabsTrigger value="indexes" className="gap-2">
                                            <Key className="h-3 w-3" />
                                            {t('mysql.indexes')} ({Object.keys(groupedIndexes).length})
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="columns" className="mt-0">
                                        <div className="border rounded-md bg-background">
                                            <Table>
                                                <TableHeader className="sticky top-0 bg-muted/50">
                                                    <TableRow>
                                                        <TableHead className="w-[200px]">{t('mysql.columnName')}</TableHead>
                                                        <TableHead className="w-[150px]">{t('mysql.dataType')}</TableHead>
                                                        <TableHead className="w-[100px]">{t('mysql.nullable')}</TableHead>
                                                        <TableHead className="w-[100px]">{t('mysql.key')}</TableHead>
                                                        <TableHead className="w-[150px]">{t('mysql.defaultValue')}</TableHead>
                                                        <TableHead className="w-[120px]">{t('mysql.extra')}</TableHead>
                                                        <TableHead className="w-[200px]">{t('mysql.comment', '注释')}</TableHead>
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
                                                                    <Badge variant="outline" className="text-xs">YES</Badge>
                                                                ) : (
                                                                    <Badge variant="secondary" className="text-xs">NO</Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                {col.Key && (
                                                                    <Badge variant={col.Key === 'PRI' ? 'default' : 'outline'} className="text-xs">
                                                                        {col.Key}
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

                                        <div className="mt-4 flex gap-2">
                                            <Button size="sm" variant="outline" className="gap-2" onClick={handleAddColumn}>
                                                <Plus className="h-3 w-3" />
                                                {t('mysql.addColumn')}
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="indexes" className="mt-0">
                                        <div className="border rounded-md bg-background">
                                            <Table>
                                                <TableHeader className="sticky top-0 bg-muted/50">
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

                                        <div className="mt-4 flex gap-2">
                                            <Button size="sm" variant="outline" className="gap-2" onClick={handleAddIndex}>
                                                <Plus className="h-3 w-3" />
                                                {t('mysql.addIndex')}
                                            </Button>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            )}
                        </div>
                    </ResizablePanel>

                    {showDDL && (
                        <>
                            <ResizableHandle />
                            <ResizablePanel defaultSize={30} minSize={20} maxSize={60}>
                                <div className="h-full flex flex-col bg-background border-l">
                                    <div className="p-2 border-b bg-muted/10 text-sm font-medium flex justify-between items-center">
                                        <span>Table DDL: {tableName}</span>
                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowDDL(false)}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="flex-1 overflow-auto p-4 bg-background">
                                        {ddlContent === 'Loading...' ? (
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
                                                {ddlContent}
                                            </SyntaxHighlighter>
                                        )}
                                    </div>
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
                onSave={handleSaveColumn}
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
        </div>
    );
}
