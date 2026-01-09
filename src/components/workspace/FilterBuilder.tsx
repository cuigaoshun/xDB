import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, FolderPlus } from "lucide-react";
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
}

interface FilterBuilderProps {
    columns: ColumnInfo[];
    onChange: (whereClause: string) => void;
    initialState?: FilterNode;
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

export function FilterBuilder({ columns, onChange, initialState }: FilterBuilderProps) {
    const { t } = useTranslation();
    const [root, setRoot] = useState<FilterNode>(initialState || {
        id: 'root',
        type: 'group',
        isActive: true,
        logic: 'AND',
        children: []
    });

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
            const childrenClauses = node.children
                .map(child => generateWhereClause(child))
                .filter(c => c !== '');

            if (childrenClauses.length === 0) return '';

            const combined = childrenClauses.join(` ${node.logic} `);
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
            value: ''
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

    const renderNode = (node: FilterNode, depth = 0, _isLast = false) => {
        if (node.id === 'root') {
            return (
                <div className="flex flex-col gap-2">
                    {/* Root controls or standard add buttons if empty */}
                    {node.children && node.children.length === 0 && (
                        <div className="flex gap-2 items-center">
                            <Button size="sm" variant="outline" onClick={() => addNode(node.id, 'condition')} className="text-xs h-7">
                                <Plus className="h-3 w-3 mr-1" /> {t('common.addCondition', 'Add Condition')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => addNode(node.id, 'group')} className="text-xs h-7">
                                <FolderPlus className="h-3 w-3 mr-1" /> {t('common.addGroup', 'Add Group')}
                            </Button>
                        </div>
                    )}
                    {node.children?.map((child, i) => renderNode(child, 0, i === node.children!.length - 1))}
                    {/* Root add buttons at bottom if not empty */}
                    {node.children && node.children.length > 0 && (
                        <div className="flex gap-2 items-center mt-2 border-t pt-2 border-dashed">
                            <Button size="sm" variant="ghost" onClick={() => addNode(node.id, 'condition')} className="text-xs h-7">
                                <Plus className="h-3 w-3 mr-1" /> {t('common.addCondition', 'Add Condition')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => addNode(node.id, 'group')} className="text-xs h-7">
                                <FolderPlus className="h-3 w-3 mr-1" /> {t('common.addGroup', 'Add Group')}
                            </Button>
                            <div className="flex-1"></div>
                            {/* Global Logic Switch for Root? Currently Root is fixed to Logic of its children. 
                                 Wait, root.logic defines how its children are joined. 
                                 So we should show it.
                             */}
                            <span className="text-xs text-muted-foreground mr-2">{t('common.combineLogic', 'Combine top-level items with:')}</span>
                            <Select value={root.logic} onValueChange={(val) => updateNode('root', { logic: val as LogicOperator })}>
                                <SelectTrigger className="w-[80px] h-7 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="AND">AND</SelectItem>
                                    <SelectItem value="OR">OR</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div key={node.id} className={cn("flex flex-col gap-2 pl-4 py-1", depth > 0 && "border-l border-dashed")}>
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
                                <Input
                                    value={node.value}
                                    onChange={e => updateNode(node.id, { value: e.target.value })}
                                    className="w-[150px] h-8 text-xs"
                                    placeholder="Value"
                                />
                            )}
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-muted-foreground">(</span>
                            <Select value={node.logic} onValueChange={(val) => updateNode(node.id, { logic: val as LogicOperator })}>
                                <SelectTrigger className="w-[70px] h-7 text-xs bg-muted/50 border-none">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="AND">AND</SelectItem>
                                    <SelectItem value="OR">OR</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="flex items-center gap-1 ml-auto">
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
                </div>

                {node.type === 'group' && node.children && node.children.length > 0 && (
                    <div className="ml-2">
                        {node.children.map((child, i) => renderNode(child, depth + 1, i === node.children!.length - 1))}
                        <div className="flex items-center gap-2 pl-4">
                            <span className="text-sm font-bold text-muted-foreground">)</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 border rounded bg-background/50">
            {renderNode(root)}
        </div>
    );
}
