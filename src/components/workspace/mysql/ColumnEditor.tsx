import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

interface ColumnEditorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPreview: (columnDef: ColumnDefinition, sql: string) => void;
    initialData?: ColumnDefinition;
    mode: 'add' | 'edit';
    existingColumns?: string[];
}

export interface ColumnDefinition {
    name: string;
    type: string;
    length?: string;
    nullable: boolean;
    defaultValue?: string;
    autoIncrement: boolean;
    comment?: string;
    position?: 'FIRST' | 'AFTER';
    afterColumn?: string;
}

const DATA_TYPES = [
    // 数值类型
    { groupKey: 'mysql.dataTypeGroup.numeric', groupDefault: 'Numeric Types', types: ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL'] },
    // 字符串类型
    { groupKey: 'mysql.dataTypeGroup.string', groupDefault: 'String Types', types: ['CHAR', 'VARCHAR', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'BINARY', 'VARBINARY'] },
    // 日期时间类型
    { groupKey: 'mysql.dataTypeGroup.datetime', groupDefault: 'Date/Time Types', types: ['DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR'] },
    // 其他类型
    { groupKey: 'mysql.dataTypeGroup.other', groupDefault: 'Other Types', types: ['ENUM', 'SET', 'JSON', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB'] },
];

const TYPES_WITH_LENGTH = ['CHAR', 'VARCHAR', 'BINARY', 'VARBINARY', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE'];
const INTEGER_TYPES = ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT'];

export function ColumnEditor({ open, onOpenChange, onPreview, initialData, mode, existingColumns = [] }: ColumnEditorProps) {
    const { t } = useTranslation();

    const [columnDef, setColumnDef] = useState<ColumnDefinition>({
        name: '',
        type: 'VARCHAR',
        length: '255',
        nullable: true,
        defaultValue: '',
        autoIncrement: false,
        comment: '',
        position: undefined,
        afterColumn: undefined,
    });

    // 保存初始数据用于变化检测
    const initialDataRef = useRef<ColumnDefinition | undefined>(undefined);

    useEffect(() => {
        if (initialData) {
            setColumnDef(initialData);
            initialDataRef.current = initialData;
        } else {
            setColumnDef({
                name: '',
                type: 'VARCHAR',
                length: '255',
                nullable: true,
                defaultValue: '',
                autoIncrement: false,
                comment: '',
                position: undefined,
                afterColumn: undefined,
            });
            initialDataRef.current = undefined;
        }
    }, [initialData, open]);

    const hasChanges = (): boolean => {
        if (mode === 'add') return true; // 添加模式总是允许
        if (!initialDataRef.current) return true;

        // 对比各个字段
        const initial = initialDataRef.current;
        if (columnDef.type !== initial.type) return true;
        if (columnDef.length !== initial.length) return true;
        if (columnDef.nullable !== initial.nullable) return true;
        if (columnDef.defaultValue !== initial.defaultValue) return true;
        if (columnDef.autoIncrement !== initial.autoIncrement) return true;
        if (columnDef.comment !== initial.comment) return true;

        return false;
    };

    const handlePreview = () => {
        if (!columnDef.name.trim()) {
            alert(t('mysql.columnEditor.nameRequired', 'Column name is required'));
            return;
        }

        // 编辑模式下检查是否有变化
        if (mode === 'edit' && !hasChanges()) {
            onOpenChange(false);
            return;
        }

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

        let sql = '';
        if (mode === 'add') {
            sql = `ADD COLUMN ${columnSpec}`;
            if (columnDef.position === 'FIRST') {
                sql += ' FIRST';
            } else if (columnDef.position === 'AFTER' && columnDef.afterColumn) {
                sql += ` AFTER \`${columnDef.afterColumn}\``;
            }
        } else {
            sql = `MODIFY COLUMN ${columnSpec}`;
        }

        onPreview(columnDef, sql);
        onOpenChange(false);
    };

    const needsLength = TYPES_WITH_LENGTH.includes(columnDef.type);
    const canAutoIncrement = INTEGER_TYPES.includes(columnDef.type);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'add' ? t('mysql.addColumn') : t('mysql.editColumn')}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'add'
                            ? t('mysql.columnEditor.addDescription', 'Define properties for the new column')
                            : t('mysql.columnEditor.editDescription', 'Modify column properties (note: some changes may cause data loss)')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* 列名 */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="column-name" className="text-right">
                            {t('mysql.columnName')} *
                        </Label>
                        <Input
                            id="column-name"
                            value={columnDef.name}
                            onChange={(e) => setColumnDef({ ...columnDef, name: e.target.value })}
                            className="col-span-3"
                            placeholder={t('mysql.columnNamePlaceholder', 'column_name')}
                            disabled={mode === 'edit'}
                        />
                    </div>

                    {/* 数据类型 */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="data-type" className="text-right">
                            {t('mysql.dataType')} *
                        </Label>
                        <Select
                            value={columnDef.type}
                            onValueChange={(value) => {
                                const newDef = { ...columnDef, type: value };
                                // 根据类型设置默认长度
                                if (value === 'VARCHAR') newDef.length = '255';
                                else if (value === 'CHAR') newDef.length = '50';
                                else if (value === 'INT') newDef.length = '11';
                                else if (value === 'DECIMAL') newDef.length = '10,2';
                                else if (!TYPES_WITH_LENGTH.includes(value)) newDef.length = '';

                                // 如果不是整数类型，取消自动增长
                                if (!INTEGER_TYPES.includes(value)) {
                                    newDef.autoIncrement = false;
                                }

                                setColumnDef(newDef);
                            }}
                        >
                            <SelectTrigger className="col-span-3">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DATA_TYPES.map((group) => (
                                    <div key={group.groupKey}>
                                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                            {t(group.groupKey, group.groupDefault)}
                                        </div>
                                        {group.types.map((type) => (
                                            <SelectItem key={type} value={type}>
                                                {type}
                                            </SelectItem>
                                        ))}
                                    </div>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 长度/精度 */}
                    {needsLength && (
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="length" className="text-right">
                                {t('mysql.length')}
                            </Label>
                            <Input
                                id="length"
                                value={columnDef.length || ''}
                                onChange={(e) => setColumnDef({ ...columnDef, length: e.target.value })}
                                className="col-span-3"
                                placeholder={columnDef.type === 'DECIMAL' ? t('mysql.decimalLengthPlaceholder', '10,2') : t('mysql.lengthPlaceholder', '255')}
                            />
                        </div>
                    )}

                    {/* 允许NULL */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">
                            {t('mysql.nullable')}
                        </Label>
                        <div className="col-span-3 flex items-center space-x-2">
                            <Checkbox
                                id="nullable"
                                checked={columnDef.nullable}
                                onCheckedChange={(checked) =>
                                    setColumnDef({ ...columnDef, nullable: checked as boolean })
                                }
                            />
                            <label
                                htmlFor="nullable"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                {t('mysql.allowNull', 'Allow NULL')}
                            </label>
                        </div>
                    </div>

                    {/* 默认值 */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="default-value" className="text-right">
                            {t('mysql.defaultValue')}
                        </Label>
                        <Input
                            id="default-value"
                            value={columnDef.defaultValue || ''}
                            onChange={(e) => setColumnDef({ ...columnDef, defaultValue: e.target.value })}
                            className="col-span-3"
                            placeholder={t('mysql.defaultValuePlaceholder', 'Leave empty for no default')}
                        />
                    </div>

                    {/* 自动增长 */}
                    {canAutoIncrement && (
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">
                                {t('mysql.autoIncrement')}
                            </Label>
                            <div className="col-span-3 flex items-center space-x-2">
                                <Checkbox
                                    id="auto-increment"
                                    checked={columnDef.autoIncrement}
                                    onCheckedChange={(checked) =>
                                        setColumnDef({ ...columnDef, autoIncrement: checked as boolean })
                                    }
                                />
                                <label
                                    htmlFor="auto-increment"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    {t('mysql.autoIncrementLabel', 'Auto Increment (AUTO_INCREMENT)')}
                                </label>
                            </div>
                        </div>
                    )}

                    {/* 注释 */}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="comment" className="text-right">
                            {t('mysql.comment')}
                        </Label>
                        <Textarea
                            id="comment"
                            value={columnDef.comment || ''}
                            onChange={(e) => setColumnDef({ ...columnDef, comment: e.target.value })}
                            className="col-span-3"
                            placeholder={t('mysql.commentPlaceholder', 'Column description/comment')}
                            rows={2}
                        />
                    </div>

                    {/* 位置（仅添加时） */}
                    {mode === 'add' && existingColumns.length > 0 && (
                        <>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">
                                    {t('mysql.position')}
                                </Label>
                                <Select
                                    value={columnDef.position || 'default'}
                                    onValueChange={(value) =>
                                        setColumnDef({
                                            ...columnDef,
                                            position: value === 'default' ? undefined : value as 'FIRST' | 'AFTER',
                                            afterColumn: value === 'AFTER' ? existingColumns[0] : undefined
                                        })
                                    }
                                >
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default">{t('mysql.positionDefault', 'Default (at end)')}</SelectItem>
                                        <SelectItem value="FIRST">{t('mysql.first')}</SelectItem>
                                        <SelectItem value="AFTER">{t('mysql.after')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {columnDef.position === 'AFTER' && (
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">
                                        {t('mysql.afterColumn', 'After column')}
                                    </Label>
                                    <Select
                                        value={columnDef.afterColumn || existingColumns[0]}
                                        onValueChange={(value) =>
                                            setColumnDef({ ...columnDef, afterColumn: value })
                                        }
                                    >
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {existingColumns.map((col) => (
                                                <SelectItem key={col} value={col}>
                                                    {col}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handlePreview}>
                        {mode === 'add' ? t('common.add', 'Add') : t('common.confirm', 'Confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
