import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button.tsx";
import {
    Loader2, Plus, Trash2, RefreshCw, Edit2, Key,
    Hash, Type, Calendar, Binary, Database, List
} from "lucide-react";
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

interface ColumnInfo {
    Field: string;
    Type: string;
    Null: string;
    Key: string;
    Default: string | null;
    Extra: string;
    Comment: string;
}

interface IndexInfo {
    Table: string;
    Non_unique: number;
    Key_name: string;
    Seq_in_index: number;
    Column_name: string;
    Collation: string | null;
    Cardinality: number | null;
    Sub_part: number | null;
    Packed: string | null;
    Null: string;
    Index_type: string;
    Comment: string;
}

interface TableSchemaManagerProps {
    connectionId: number;
    dbName: string;
    tableName: string;
    onRefresh?: () => void;
}

export function TableSchemaManager({ connectionId, dbName, tableName, onRefresh }: TableSchemaManagerProps) {
    const { t } = useTranslation();
    const [columns, setColumns] = useState<ColumnInfo[]>([]);
    const [indexes, setIndexes] = useState<IndexInfo[]>([]);
    const [tableComment, setTableComment] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Column editor state
    const [showColumnEditor, setShowColumnEditor] = useState(false);
    const [editingColumn, setEditingColumn] = useState<ColumnDefinition | undefined>(undefined);
    const [editorMode, setEditorMode] = useState<'add' | 'edit'>('add');

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
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
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
                                <Button size="sm" variant="outline" className="gap-2">
                                    <Plus className="h-3 w-3" />
                                    {t('mysql.addIndex')}
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                )}
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
        </div>
    );
}
