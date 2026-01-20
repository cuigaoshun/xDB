import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, FolderPlus, Filter, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export interface ColumnInfo {
    name: string;
    type_name: string;
}

export type FilterType = 'condition' | 'group';
export type LogicOperator = 'AND' | 'OR';

export interface FilterNode {
    id: string;
    type: FilterType;
    isActive: boolean;
    // For conditions
    field?: string;
    operator?: string;
    value?: string;
    // For groups
    children?: FilterNode[];
    logic?: LogicOperator; // Logic applied to children of this group
    // Logic operator to connect with the NEXT sibling (not used for the last item)
    nextLogic?: LogicOperator;
}

export interface OrderByClause {
    field: string;
    direction: 'ASC' | 'DESC';
}

interface FilterBuilderProps {
    columns: ColumnInfo[];
    onChange: (whereClause: string) => void;
    onExecute?: (whereClause: string, orderBy?: string) => void;
    initialState?: FilterNode;
    primaryKeys?: string[];
}

const OPERATORS = [
    { label: '=', value: '=' },
    { label: '!=', value: '!=' },
    { label: '>', value: '>' },
    { label: '>=', value: '>=' },
    { label: '<', value: '<' },
    { label: '<=', value: '<=' },
    { label: 'LIKE', value: 'LIKE' },
    { label: 'NOT LIKE', value: 'NOT LIKE' },
    { label: 'IN', value: 'IN' },
    { label: 'IS NULL', value: 'IS NULL' },
    { label: 'IS NOT NULL', value: 'IS NOT NULL' },
];

// Helper to check if a column type is date/time related
const isDateTimeType = (typeName: string): boolean => {
    const type = typeName.toUpperCase();
    return type.includes('DATE') || type.includes('TIME') || type.includes('TIMESTAMP');
};

export function FilterBuilder({ columns, onChange, onExecute, initialState, primaryKeys = [] }: FilterBuilderProps) {
    const { t } = useTranslation();
    const [root, setRoot] = useState<FilterNode>(initialState || {
        id: 'root',
        type: 'group',
        isActive: true,
        logic: 'AND',
        children: []
    });

    // 排序状态
    const [orderByField, setOrderByField] = useState<string>('');
    const [orderByDirection, setOrderByDirection] = useState<'ASC' | 'DESC'>('DESC');

    // 当主键信息可用时，自动设置默认排序字段
    useEffect(() => {
        if (primaryKeys.length > 0 && !orderByField) {
            setOrderByField(primaryKeys[0]);
        }
    }, [primaryKeys]);

    // 当列信息可用且没有设置排序字段时，使用第一个列
    useEffect(() => {
        if (columns.length > 0 && !orderByField && primaryKeys.length === 0) {
            setOrderByField(columns[0].name);
        }
    }, [columns]);

    // Notify parent of changes
    useEffect(() => {
        const clause = generateWhereClause(root);
        onChange(clause);
    }, [root]);

    const generateWhereClause = (node: FilterNode): string => {
        if (!node.isActive) return '';

        if (node.type === 'condition') {
            if (!node.field || !node.operator) return '';

            // Handle binary operators like IS NULL which don't need a value
            if (['IS NULL', 'IS NOT NULL'].includes(node.operator)) {
                return `\`${node.field}\` ${node.operator}`;
            }

            // Simple value handling, could be improved for numbers/dates
            const val = node.value || '';
            let sqlVal = `'${val.replace(/'/g, "''")}'`;
            if (node.operator === 'IN') {
                // Determine if value is like (1,2,3) or just 1,2,3
                if (!val.startsWith('(')) {
                    const parts = val.split(',').map(v => `'${v.trim().replace(/'/g, "''")}'`).join(',');
                    sqlVal = `(${parts})`;
                } else {
                    sqlVal = val;
                }
            } else if (node.operator === 'LIKE' || node.operator === 'NOT LIKE') {
                // If user didn't add %, maybe add it? Or leave it to user
                sqlVal = `'${val.replace(/'/g, "''")}'`;
            }

            return `\`${node.field}\` ${node.operator} ${sqlVal}`;
        }

        if (node.type === 'group' && node.children && node.children.length > 0) {
            const activeChildren = node.children.filter(c => c.isActive);
            if (activeChildren.length === 0) return '';

            // Build clause respecting each node's nextLogic
            let combined = '';
            for (let i = 0; i < activeChildren.length; i++) {
                const child = activeChildren[i];
                const childClause = generateWhereClause(child);
                if (!childClause) continue;

                if (combined) {
                    // Use the previous node's nextLogic (or default AND)
                    const prevChild = activeChildren[i - 1];
                    const logicOp = prevChild?.nextLogic || 'AND';
                    combined += ` ${logicOp} ${childClause}`;
                } else {
                    combined = childClause;
                }
            }

            // Don't wrap root in parens, but wrap subgroups
            return node.id === 'root' ? combined : `(${combined})`;
        }

        return '';
    };

    const updateNode = (id: string, updates: Partial<FilterNode>) => {
        const updateRecursive = (node: FilterNode): FilterNode => {
            if (node.id === id) {
                return { ...node, ...updates };
            }
            if (node.children) {
                return { ...node, children: node.children.map(updateRecursive) };
            }
            return node;
        };
        setRoot(prev => updateRecursive(prev));
    };

    const addNode = (parentId: string, type: FilterType) => {
        const newNode: FilterNode = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            isActive: true,
            logic: 'AND',
            children: [],
            field: columns.length > 0 ? columns[0].name : '',
            operator: '=',
            value: '',
            nextLogic: 'AND'
        };

        const addRecursive = (node: FilterNode): FilterNode => {
            if (node.id === parentId) {
                return { ...node, children: [...(node.children || []), newNode] };
            }
            if (node.children) {
                return { ...node, children: node.children.map(addRecursive) };
            }
            return node;
        };
        setRoot(prev => addRecursive(prev));
    };

    const deleteNode = (id: string) => {
        const deleteRecursive = (children: FilterNode[]): FilterNode[] => {
            return children.filter(child => child.id !== id).map(child => {
                if (child.children) {
                    return { ...child, children: deleteRecursive(child.children) };
                }
                return child;
            });
        };
        // Special case: deleting children of root
        if (root.children?.some(c => c.id === id)) {
            setRoot(prev => ({ ...prev, children: prev.children!.filter(c => c.id !== id) }));
        } else {
            setRoot(prev => ({ ...prev, children: deleteRecursive(prev.children || []) }));
        }
    };

    // Get column info by name
    const getColumnInfo = (fieldName: string): ColumnInfo | undefined => {
        return columns.find(c => c.name === fieldName);
    };

    const renderNode = (node: FilterNode, depth = 0, isLast = false, siblings: FilterNode[] = []) => {
        if (node.id === 'root') {
            return (
                <div className="flex flex-col gap-2">
                    {/* Root controls or standard add buttons if empty */}
                    {node.children && node.children.length === 0 && (
                        <div className="flex gap-2 items-center flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => addNode(node.id, 'condition')} className="text-xs h-7">
                                <Plus className="h-3 w-3 mr-1" /> {t('common.addCondition', 'Add Condition')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => addNode(node.id, 'group')} className="text-xs h-7">
                                <FolderPlus className="h-3 w-3 mr-1" /> {t('common.addGroup', 'Add Group')}
                            </Button>

                            {/* 排序选项 - 与添加按钮在同一行 */}
                            {columns.length > 0 && (
                                <>
                                    <div className="h-4 w-[1px] bg-border mx-1"></div>
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">{t('common.orderBy', '排序')}:</span>
                                    <Select value={orderByField} onValueChange={setOrderByField}>
                                        <SelectTrigger className="w-[150px] h-7 text-xs">
                                            <SelectValue placeholder={t('common.selectField', '选择字段')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {columns.map(col => (
                                                <SelectItem key={col.name} value={col.name}>{col.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={orderByDirection} onValueChange={(val) => setOrderByDirection(val as 'ASC' | 'DESC')}>
                                        <SelectTrigger className="w-[80px] h-7 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ASC">{t('common.ascending', '升序')}</SelectItem>
                                            <SelectItem value="DESC">{t('common.descending', '降序')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {onExecute && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                const whereClause = generateWhereClause(root);
                                                const orderByClause = orderByField ? `${orderByField} ${orderByDirection}` : '';
                                                onExecute(whereClause, orderByClause);
                                            }}
                                            className="text-xs h-7"
                                        >
                                            <Filter className="h-3 w-3 mr-1" /> {t('common.applyFilter', '应用筛选')}
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                    {node.children?.map((child, i) => renderNode(child, 0, i === node.children!.length - 1, node.children!))}
                    {/* Root add buttons at bottom if not empty */}
                    {node.children && node.children.length > 0 && (
                        <div className="flex gap-2 items-center mt-2 border-t pt-2 border-dashed flex-wrap">
                            <Button size="sm" variant="ghost" onClick={() => addNode(node.id, 'condition')} className="text-xs h-7">
                                <Plus className="h-3 w-3 mr-1" /> {t('common.addCondition', 'Add Condition')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => addNode(node.id, 'group')} className="text-xs h-7">
                                <FolderPlus className="h-3 w-3 mr-1" /> {t('common.addGroup', 'Add Group')}
                            </Button>

                            {/* 排序选项 - 与添加按钮在同一行 */}
                            {columns.length > 0 && (
                                <>
                                    <div className="h-4 w-[1px] bg-border mx-1"></div>
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">{t('common.orderBy', '排序')}:</span>
                                    <Select value={orderByField} onValueChange={setOrderByField}>
                                        <SelectTrigger className="w-[150px] h-7 text-xs">
                                            <SelectValue placeholder={t('common.selectField', '选择字段')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {columns.map(col => (
                                                <SelectItem key={col.name} value={col.name}>{col.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={orderByDirection} onValueChange={(val) => setOrderByDirection(val as 'ASC' | 'DESC')}>
                                        <SelectTrigger className="w-[80px] h-7 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ASC">{t('common.ascending', '升序')}</SelectItem>
                                            <SelectItem value="DESC">{t('common.descending', '降序')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {onExecute && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                const whereClause = generateWhereClause(root);
                                                const orderByClause = orderByField ? `${orderByField} ${orderByDirection}` : '';
                                                onExecute(whereClause, orderByClause);
                                            }}
                                            className="text-xs h-7"
                                        >
                                            <Filter className="h-3 w-3 mr-1" /> {t('common.applyFilter', '应用筛选')}
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        const columnInfo = node.field ? getColumnInfo(node.field) : undefined;
        const isDateTime = columnInfo && isDateTimeType(columnInfo.type_name);

        return (
            <div key={node.id} className="flex flex-col gap-1">
                <div className={cn("flex flex-col gap-2 pl-4 py-1", depth > 0 && "border-l border-dashed")}>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            checked={node.isActive}
                            onCheckedChange={(c) => updateNode(node.id, { isActive: c as boolean })}
                        />

                        {node.type === 'condition' ? (
                            <>
                                <Select value={node.field} onValueChange={(val) => updateNode(node.id, { field: val })}>
                                    <SelectTrigger className="w-[150px] h-8 text-xs">
                                        <SelectValue placeholder={t('common.field', 'Field')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {columns.map(col => (
                                            <SelectItem key={col.name} value={col.name}>{col.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select value={node.operator} onValueChange={(val) => updateNode(node.id, { operator: val })}>
                                    <SelectTrigger className="w-[100px] h-8 text-xs font-mono text-muted-foreground">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {OPERATORS.map(op => (
                                            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {!['IS NULL', 'IS NOT NULL'].includes(node.operator || '') && (
                                    isDateTime ? (
                                        <Input
                                            type="datetime-local"
                                            value={node.value || ''}
                                            onChange={e => updateNode(node.id, { value: e.target.value })}
                                            className="w-[200px] h-8 text-xs"
                                        />
                                    ) : (
                                        <Input
                                            value={node.value}
                                            onChange={e => updateNode(node.id, { value: e.target.value })}
                                            className="w-[150px] h-8 text-xs"
                                            placeholder="Value"
                                        />
                                    )
                                )}
                            </>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-muted-foreground">(</span>
                                <span className="text-xs text-muted-foreground">{t('common.group', 'Group')}</span>
                            </div>
                        )}

                        <div className="flex items-center gap-1">
                            {node.type === 'group' && (
                                <>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => addNode(node.id, 'condition')} title="Add sub-condition">
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => addNode(node.id, 'group')} title="Add sub-group">
                                        <FolderPlus className="h-3 w-3" />
                                    </Button>
                                </>
                            )}
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteNode(node.id)}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>

                        {/* Logic operator selector (shown after each item, not for last item) */}
                        {!isLast && siblings.length > 1 && (
                            <Select
                                value={node.nextLogic || 'AND'}
                                onValueChange={(val) => updateNode(node.id, { nextLogic: val as LogicOperator })}
                            >
                                <SelectTrigger className="w-[70px] h-6 text-xs bg-muted/50 border-dashed ml-2">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="AND">AND</SelectItem>
                                    <SelectItem value="OR">OR</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {node.type === 'group' && node.children && node.children.length > 0 && (
                        <div className="ml-2">
                            {node.children.map((child, i) => renderNode(child, depth + 1, i === node.children!.length - 1, node.children!))}
                            <div className="flex items-center gap-2 pl-4">
                                <span className="text-sm font-bold text-muted-foreground">)</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="py-1 bg-background/50">
            {renderNode(root)}
        </div>
    );
}

