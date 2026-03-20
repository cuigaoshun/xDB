import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, GripVertical } from "lucide-react";
import { useAppStore, ConnectionGroup } from "@/store/useAppStore";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { ConnectionGroupDialog } from "./ConnectionGroupDialog";
import {
    getAllConnectionGroups,
    createConnectionGroup,
    updateConnectionGroup,
    deleteConnectionGroup,
} from "@/lib/connectionDB";
import { toast } from "@/hooks/useToast";

interface ConnectionGroupManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function ConnectionGroupManager({ open, onOpenChange, onSuccess }: ConnectionGroupManagerProps) {
    const { t } = useTranslation();
    const connectionGroups = useAppStore((state) => state.connectionGroups);
    const setConnectionGroups = useAppStore((state) => state.setConnectionGroups);
    const connections = useAppStore((state) => state.connections);

    const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<ConnectionGroup | null>(null);
    const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchGroups = async () => {
        try {
            setIsLoading(true);
            const data = await getAllConnectionGroups();
            setConnectionGroups(data);
        } catch (error) {
            console.error("Failed to fetch groups:", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: String(error),
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchGroups();
        }
    }, [open]);

    const handleCreate = async (data: Omit<ConnectionGroup, 'id' | 'created_at'>) => {
        try {
            await createConnectionGroup(data);
            await fetchGroups();
            setIsNewGroupOpen(false);
            onSuccess?.();
            toast({
                title: t('common.success'),
                description: t('common.groupCreated'),
            });
        } catch (error) {
            console.error("Failed to create group:", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: String(error),
            });
        }
    };

    const handleUpdate = async (data: Omit<ConnectionGroup, 'id' | 'created_at'>) => {
        if (!editingGroup) return;
        try {
            await updateConnectionGroup({
                ...data,
                id: editingGroup.id,
                created_at: editingGroup.created_at
            });
            await fetchGroups();
            setEditingGroup(null);
            onSuccess?.();
            toast({
                title: t('common.success'),
                description: t('common.groupUpdated'),
            });
        } catch (error) {
            console.error("Failed to update group:", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: String(error),
            });
        }
    };

    const handleDelete = async () => {
        if (deletingGroupId === null) return;
        try {
            await deleteConnectionGroup(deletingGroupId);
            await fetchGroups();
            setDeletingGroupId(null);
            onSuccess?.();
            toast({
                title: t('common.success'),
                description: t('common.groupDeleted'),
            });
        } catch (error) {
            console.error("Failed to delete group:", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: String(error),
            });
        }
    };

    const getConnectionCount = (groupId: number) => {
        return connections.filter(c => c.group_id === groupId).length;
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{t('common.manageGroups', 'Manage Groups')}</DialogTitle>
                    </DialogHeader>

                    <div className="py-4">
                        <div className="flex justify-between items-center mb-4">
                            <p className="text-sm text-muted-foreground">
                                {t('common.manageGroupsDescription', 'Create groups to organize your database connections')}
                            </p>
                            <Button onClick={() => setIsNewGroupOpen(true)}>
                                <Plus className="h-4 w-4 mr-2" />
                                {t('common.createGroup')}
                            </Button>
                        </div>

                        {isLoading ? (
                            <div className="text-center py-8 text-muted-foreground">
                                {t('common.loading', 'Loading...')}
                            </div>
                        ) : connectionGroups.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                {t('common.noGroupsFound')}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {connectionGroups.map((group) => (
                                    <div
                                        key={group.id}
                                        className="flex items-center gap-3 p-3 rounded-md border bg-card hover:bg-accent/50 transition-colors"
                                    >
                                        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                                        <div
                                            className="w-4 h-4 rounded-sm shrink-0"
                                            style={{ backgroundColor: group.color }}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{group.name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    ({t('common.connectionsCount', { count: getConnectionCount(group.id) })})
                                                </span>
                                            </div>
                                            {group.description && (
                                                <p className="text-sm text-muted-foreground truncate">
                                                    {group.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => setEditingGroup(group)}
                                            >
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => setDeletingGroupId(group.id)}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* 新建分组对话框 */}
            <Dialog open={isNewGroupOpen} onOpenChange={setIsNewGroupOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{t('common.createGroup', 'Create Group')}</DialogTitle>
                    </DialogHeader>
                    <ConnectionGroupDialog
                        onSubmit={handleCreate}
                        onCancel={() => setIsNewGroupOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* 编辑分组对话框 */}
            <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{t('common.editGroup', 'Edit Group')}</DialogTitle>
                    </DialogHeader>
                    {editingGroup && (
                        <ConnectionGroupDialog
                            initialData={editingGroup}
                            onSubmit={handleUpdate}
                            onCancel={() => setEditingGroup(null)}
                            submitLabel={t('common.save')}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* 删除确认对话框 */}
            <Dialog open={deletingGroupId !== null} onOpenChange={(open) => !open && setDeletingGroupId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('common.deleteGroup')}</DialogTitle>
                        <DialogDescription>
                            {t('common.confirmDeleteGroup')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingGroupId(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            {t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
