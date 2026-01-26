import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { invoke } from "@tauri-apps/api/core";
import { addCommandToConsole } from "@/components/ui/CommandConsole.tsx";

interface CreateTableDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connectionId: number;
    dbName: string;
    onSuccess?: () => void;
}

interface TableColumn {
    name: string;
    type: string;
    length: string;
    nullable: boolean;
    isPrimary: boolean;
    autoIncrement: boolean;
}

const DATA_TYPES = ['INT', 'VARCHAR', 'TEXT', 'DATETIME', 'DECIMAL', 'BIGINT', 'FLOAT', 'DOUBLE', 'DATE', 'TIME', 'TIMESTAMP', 'CHAR', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'BOOLEAN', 'JSON'];
const ENGINES = ['InnoDB', 'MyISAM', 'MEMORY', 'CSV', 'ARCHIVE'];
const CHARSETS = ['utf8mb4', 'utf8', 'latin1', 'gbk', 'ascii'];

export function CreateTableDialog({ open, onOpenChange, connectionId, dbName, onSuccess }: CreateTableDialogProps) {
    const { t } = useTranslation();
    const [tableName, setTableName] = useState('');
    const [engine, setEngine] = useState('InnoDB');
    const [charset, setCharset] = useState('utf8mb4');
    const [comment, setComment] = useState('');
    const [columns, setColumns] = useState<TableColumn[]>([
        { name: 'id', type: 'INT', length: '11', nullable: false, isPrimary: true, autoIncrement: true }
    ]);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAddColumn = () => {
        setColumns([...columns, {
            name: '',
            type: 'VARCHAR',
            length: '255',
            nullable: true,
            isPrimary: false,
            autoIncrement: false
        }]);
    };

    const handleRemoveColumn = (index: number) => {
        setColumns(columns.filter((_, i) => i !== index));
    };

    const handleColumnChange = (index: number, field: keyof TableColumn, value: any) => {
        const newColumns = [...columns];
        newColumns[index] = { ...newColumns[index], [field]: value };
        setColumns(newColumns);
    };

    const generateDDL = (): string => {
        const columnDefs = columns.map(col => {
            let def = `  \`${col.name}\` ${col.type}`;
            if (col.length && ['VARCHAR', 'CHAR', 'INT', 'BIGINT', 'DECIMAL'].includes(col.type)) {
                def += `(${col.length})`;
            }
            def += col.nullable ? ' NULL' : ' NOT NULL';
            if (col.autoIncrement) {
                def += ' AUTO_INCREMENT';
            }
            return def;
        }).join(',\n');

        const primaryKeys = columns.filter(col => col.isPrimary).map(col => col.name);
        const primaryKeyDef = primaryKeys.length > 0
            ? `,\n  PRIMARY KEY (\`${primaryKeys.join('`, `')}\`)`
            : '';

        let ddl = `CREATE TABLE \`${dbName}\`.\`${tableName}\` (\n${columnDefs}${primaryKeyDef}\n)`;
        ddl += ` ENGINE=${engine} DEFAULT CHARSET=${charset}`;
        if (comment) {
            ddl += ` COMMENT='${comment.replace(/'/g, "''")}'`;
        }
        ddl += ';';

        return ddl;
    };

    const handleCreate = async () => {
        if (!tableName.trim()) {
            setError(t('mysql.tableName') + ' ' + t('common.name_required'));
            return;
        }

        if (columns.length === 0) {
            setError(t('mysql.noColumns'));
            return;
        }

        if (columns.some(col => !col.name.trim())) {
            setError(t('mysql.columnName') + ' ' + t('common.name_required'));
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            const sql = generateDDL();
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

            onSuccess?.();
            onOpenChange(false);

            // 重置表单
            setTableName('');
            setColumns([{ name: 'id', type: 'INT', length: '11', nullable: false, isPrimary: true, autoIncrement: true }]);
            setComment('');
        } catch (err: any) {
            console.error("Failed to create table:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));

            addCommandToConsole({
                databaseType: 'mysql',
                command: generateDDL(),
                duration: 0,
                success: false,
                error: typeof err === 'string' ? err : JSON.stringify(err)
            });
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('mysql.createTable')}</DialogTitle>
                    <DialogDescription>
                        定义新表的结构和属性
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm">
                            {error}
                        </div>
                    )}

                    {/* 表名 */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="table-name" className="text-right">
                            {t('mysql.tableName')} *
                        </Label>
                        <Input
                            id="table-name"
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            className="col-span-3"
                            placeholder="table_name"
                        />
                    </div>

                    {/* 存储引擎 */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">{t('mysql.engine')}</Label>
                        <Select value={engine} onValueChange={setEngine}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ENGINES.map(eng => (
                                    <SelectItem key={eng} value={eng}>{eng}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 字符集 */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">{t('mysql.charset')}</Label>
                        <Select value={charset} onValueChange={setCharset}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CHARSETS.map(cs => (
                                    <SelectItem key={cs} value={cs}>{cs}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 表注释 */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="comment" className="text-right">
                            {t('mysql.comment')}
                        </Label>
                        <Textarea
                            id="comment"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="col-span-3"
                            rows={2}
                            placeholder="表的说明注释"
                        />
                    </div>

                    {/* 列定义 */}
                    <div className="col-span-4">
                        <div className="flex justify-between items-center mb-2">
                            <Label className="text-sm font-semibold">{t('mysql.columnDefinition')}</Label>
                            <Button size="sm" variant="outline" onClick={handleAddColumn} className="gap-2">
                                <Plus className="h-3 w-3" />
                                {t('mysql.addColumn')}
                            </Button>
                        </div>

                        <div className="border rounded-md p-3 space-y-2 max-h-[300px] overflow-y-auto">
                            {columns.map((col, index) => (
                                <div key={index} className="grid grid-cols-12 gap-2 items-center p-2 bg-muted/20 rounded">
                                    <Input
                                        placeholder="列名"
                                        value={col.name}
                                        onChange={(e) => handleColumnChange(index, 'name', e.target.value)}
                                        className="col-span-3 h-8 text-xs"
                                    />
                                    <Select
                                        value={col.type}
                                        onValueChange={(value) => handleColumnChange(index, 'type', value)}
                                    >
                                        <SelectTrigger className="col-span-2 h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DATA_TYPES.map(type => (
                                                <SelectItem key={type} value={type}>{type}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        placeholder="长度"
                                        value={col.length}
                                        onChange={(e) => handleColumnChange(index, 'length', e.target.value)}
                                        className="col-span-1 h-8 text-xs"
                                    />
                                    <div className="col-span-2 flex items-center gap-2">
                                        <Checkbox
                                            checked={col.nullable}
                                            onCheckedChange={(checked) => handleColumnChange(index, 'nullable', checked)}
                                        />
                                        <span className="text-xs">NULL</span>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-2">
                                        <Checkbox
                                            checked={col.isPrimary}
                                            onCheckedChange={(checked) => handleColumnChange(index, 'isPrimary', checked)}
                                        />
                                        <span className="text-xs">主键</span>
                                    </div>
                                    <div className="col-span-1 flex items-center gap-2">
                                        <Checkbox
                                            checked={col.autoIncrement}
                                            onCheckedChange={(checked) => handleColumnChange(index, 'autoIncrement', checked)}
                                            disabled={!['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT'].includes(col.type)}
                                        />
                                        <span className="text-xs">AI</span>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleRemoveColumn(index)}
                                        className="col-span-1 h-8 px-2"
                                        disabled={columns.length === 1}
                                    >
                                        <Trash2 className="h-3 w-3 text-red-600" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* DDL预览 */}
                    <div className="col-span-4">
                        <Label className="text-sm font-semibold mb-2 block">{t('mysql.previewDDL')}</Label>
                        <Textarea
                            value={generateDDL()}
                            readOnly
                            className="font-mono text-xs h-32"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleCreate} disabled={isCreating}>
                        {isCreating ? t('common.loading') : t('mysql.createTable')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
