import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine, Save, FolderTree, ChevronRight, ChevronDown } from "lucide-react";
import { Connection, ConnectionGroup } from "@/store/useAppStore";
import { updateConnectionsSortOrder, updateGroupsSortOrder } from "@/lib/connectionDB";
import { useTranslation } from "react-i18next";
import { toast } from "@/hooks/useToast.ts";

interface ConnectionSorterProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connections: Connection[];
    groups: ConnectionGroup[];
    onSave: () => void;
}

type SortItem = 
    | { type: 'group'; group: ConnectionGroup; connections: Connection[] }
    | { type: 'connection'; connection: Connection };

export function ConnectionSorter({ open, onOpenChange, connections, groups, onSave }: ConnectionSorterProps) {
    const { t } = useTranslation();
    const [sortedList, setSortedList] = useState<SortItem[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
    const [isSaving, setIsSaving] = useState(false);

    const toggleGroup = (groupId: number) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    };

    useEffect(() => {
        if (open) {
            // 构建混合列表：分组和无分组连接
            const items: SortItem[] = [];
            
            // 添加分组及其内部连接
            groups.forEach(group => {
                const groupConnections = connections
                    .filter(c => c.group_id === group.id)
                    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                items.push({ type: 'group', group, connections: groupConnections });
            });
            
            // 添加无分组连接
            connections.filter(c => !c.group_id).forEach(conn => {
                items.push({ type: 'connection', connection: conn });
            });
            
            // 按 sort_order 排序
            items.sort((a, b) => {
                const orderA = a.type === 'group' ? a.group.sort_order : a.connection.sort_order || 0;
                const orderB = b.type === 'group' ? b.group.sort_order : b.connection.sort_order || 0;
                return orderA - orderB;
            });
            
            setSortedList(items);
        }
    }, [open, connections, groups]);

    const move = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
        const newList = [...sortedList];
        const item = newList[index];

        // Remove item
        newList.splice(index, 1);

        let newIndex = index;
        switch (direction) {
            case 'up':
                newIndex = Math.max(0, index - 1);
                break;
            case 'down':
                newIndex = Math.min(newList.length, index + 1);
                break;
            case 'top':
                newIndex = 0;
                break;
            case 'bottom':
                newIndex = newList.length;
                break;
        }

        // Insert item
        newList.splice(newIndex, 0, item);
        setSortedList(newList);
    };

    const moveGroupConnection = (groupIndex: number, connIndex: number, direction: 'up' | 'down') => {
        const newList = [...sortedList];
        const groupItem = newList[groupIndex];
        
        if (groupItem.type !== 'group') return;
        
        const newConnections = [...groupItem.connections];
        const conn = newConnections[connIndex];
        
        // Remove connection
        newConnections.splice(connIndex, 1);
        
        // Calculate new index
        const newIndex = direction === 'up' 
            ? Math.max(0, connIndex - 1) 
            : Math.min(newConnections.length, connIndex + 1);
        
        // Insert connection
        newConnections.splice(newIndex, 0, conn);
        
        // Update group item
        newList[groupIndex] = { ...groupItem, connections: newConnections };
        setSortedList(newList);
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            
            // 分别收集分组和连接的排序
            const groupOrders: [number, number][] = [];
            const connectionOrders: [number, number][] = [];
            
            sortedList.forEach((item, idx) => {
                if (item.type === 'group') {
                    groupOrders.push([item.group.id, idx]);
                    // 同时保存分组内连接的排序
                    item.connections.forEach((conn, connIdx) => {
                        connectionOrders.push([conn.id, connIdx]);
                    });
                } else {
                    connectionOrders.push([item.connection.id, idx]);
                }
            });
            
            // 更新分组排序
            if (groupOrders.length > 0) {
                await updateGroupsSortOrder(groupOrders);
            }
            
            // 更新连接排序
            if (connectionOrders.length > 0) {
                await updateConnectionsSortOrder(connectionOrders);
            }

            toast({
                title: t('common.success'),
                description: t('common.sortOrderSaved'),
            });

            onSave(); // Refresh parent list
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save sort order:", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: t('common.failedToSaveSort')
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t('common.sortConnections', '排序连接')}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden border rounded-md">
                    <ScrollArea className="h-full">
                        <div className="p-2 space-y-1">
                            {sortedList.map((item, index) => {
                                if (item.type === 'group') {
                                    const isExpanded = expandedGroups.has(item.group.id);
                                    
                                    return (
                                        <div key={`group-${item.group.id}`}>
                                            {/* 分组行 */}
                                            <div className="flex items-center justify-between p-2 rounded-md bg-card border hover:bg-accent/50 transition-colors">
                                                <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => toggleGroup(item.group.id)}>
                                                    {isExpanded ? (
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                    <FolderTree className="h-4 w-4 text-muted-foreground" />
                                                    <div className="font-medium">{item.group.name}</div>
                                                    <div 
                                                        className="w-3 h-3 rounded-sm" 
                                                        style={{ backgroundColor: item.group.color }}
                                                    />
                                                    <div className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                        分组 ({item.connections.length})
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        disabled={index === 0}
                                                        onClick={() => move(index, 'top')}
                                                        title={t('common.moveToTop', '置顶')}
                                                    >
                                                        <ArrowUpToLine className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        disabled={index === 0}
                                                        onClick={() => move(index, 'up')}
                                                        title={t('common.moveUp', '上移')}
                                                    >
                                                        <ArrowUp className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        disabled={index === sortedList.length - 1}
                                                        onClick={() => move(index, 'down')}
                                                        title={t('common.moveDown', '下移')}
                                                    >
                                                        <ArrowDown className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        disabled={index === sortedList.length - 1}
                                                        onClick={() => move(index, 'bottom')}
                                                        title={t('common.moveToBottom', '置底')}
                                                    >
                                                        <ArrowDownToLine className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                            
                                            {/* 展开的分组内连接 */}
                                            {isExpanded && item.connections.length > 0 && (
                                                <div className="ml-8 mt-1 space-y-1">
                                                    {item.connections.map((conn, connIndex) => (
                                                        <div key={`conn-${conn.id}`} className="flex items-center justify-between p-2 rounded-md bg-muted/30 border text-sm">
                                                            <div className="flex items-center gap-2 flex-1">
                                                                <div className="font-medium">{conn.name}</div>
                                                                <div className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{conn.db_type}</div>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    disabled={connIndex === 0}
                                                                    onClick={() => moveGroupConnection(index, connIndex, 'up')}
                                                                    title={t('common.moveUp', '上移')}
                                                                >
                                                                    <ArrowUp className="h-3 w-3" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    disabled={connIndex === item.connections.length - 1}
                                                                    onClick={() => moveGroupConnection(index, connIndex, 'down')}
                                                                    title={t('common.moveDown', '下移')}
                                                                >
                                                                    <ArrowDown className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                } else {
                                    // 无分组连接
                                    return (
                                        <div key={`conn-${item.connection.id}`} className="flex items-center justify-between p-2 rounded-md bg-card border hover:bg-accent/50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="font-medium">{item.connection.name}</div>
                                                <div className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.connection.db_type}</div>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    disabled={index === 0}
                                                    onClick={() => move(index, 'top')}
                                                    title={t('common.moveToTop', '置顶')}
                                                >
                                                    <ArrowUpToLine className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    disabled={index === 0}
                                                    onClick={() => move(index, 'up')}
                                                    title={t('common.moveUp', '上移')}
                                                >
                                                    <ArrowUp className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    disabled={index === sortedList.length - 1}
                                                    onClick={() => move(index, 'down')}
                                                    title={t('common.moveDown', '下移')}
                                                >
                                                    <ArrowDown className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    disabled={index === sortedList.length - 1}
                                                    onClick={() => move(index, 'bottom')}
                                                    title={t('common.moveToBottom', '置底')}
                                                >
                                                    <ArrowDownToLine className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                }
                            })}
                        </div>
                    </ScrollArea>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (
                            t('common.saving')
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                {t('common.saveOrder', '保存排序')}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
