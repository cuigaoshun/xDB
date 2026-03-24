import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Database, Server, MoreHorizontal, ExternalLink, Trash2, Edit, FileCode, LayoutGrid, ArrowUpDown, FolderTree } from "lucide-react";
import { useAppStore, Connection, ConnectionGroup, DbType } from "@/store/useAppStore";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { ConnectionSorter } from "./ConnectionSorter";
import { cn } from "@/lib/utils";
import { getAllConnections, createConnection, updateConnection, deleteConnection, getAllConnectionGroups } from "@/lib/connectionDB";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ConnectionForm } from "../connection/ConnectionForm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { ConnectionGroupManager } from "../connection/ConnectionGroupManager";
import { toast } from "@/hooks/useToast.ts";

// 模块级标志，确保恢复上次展开的连接只执行一次
let hasRestoredSidebar = false;

export function ConnectionManager() {
    const { t } = useTranslation();
    const connections = useAppStore((state) => state.connections);
    const connectionGroups = useAppStore((state) => state.connectionGroups);
    const setConnections = useAppStore((state) => state.setConnections);
    const setConnectionGroups = useAppStore((state) => state.setConnectionGroups);


    const [searchTerm, setSearchTerm] = useState("");
    const [isNewConnOpen, setIsNewConnOpen] = useState(false);
    const [editingConn, setEditingConn] = useState<Connection | null>(null);
    const [deletingConnId, setDeletingConnId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const [sortOpen, setSortOpen] = useState(false);
    const [groupManagerOpen, setGroupManagerOpen] = useState(false);

    // Load connections from backend
    const fetchConnections = async () => {
        try {
            setIsLoading(true);
            const data = await getAllConnections();
            setConnections(data);

            // 仅在应用首次加载时恢复上次展开的连接
            if (!hasRestoredSidebar) {
                hasRestoredSidebar = true;
                const savedId = localStorage.getItem('xdb-last-expanded-connection');
                if (savedId) {
                    const id = Number(savedId);
                    if (data.some(c => c.id === id)) {
                        setExpandedConnectionId(id);
                    }
                }
            }
        } catch (error) {
            console.error("Failed to fetch connections:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchGroups = async () => {
        try {
            const data = await getAllConnectionGroups();
            setConnectionGroups(data);
        } catch (error) {
            console.error("Failed to fetch groups:", error);
        }
    };

    useEffect(() => {
        fetchConnections();
        fetchGroups();
    }, []);

    const filteredConnections = connections.filter(conn =>
        conn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (conn.host && conn.host.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // 构建树节点：分组和未分组连接混合排序
    type TreeNode = 
        | { type: 'group'; group: ConnectionGroup; connections: Connection[] }
        | { type: 'connection'; connection: Connection };

    const buildTreeNodes = () => {
        const nodes: TreeNode[] = [];
        const ungroupedConnections: Connection[] = [];

        // 分离有分组和无分组的连接
        filteredConnections.forEach(conn => {
            if (conn.group_id) {
                // 已分组的连接稍后处理
            } else {
                ungroupedConnections.push(conn);
            }
        });

        // 添加分组节点
        connectionGroups.forEach(group => {
            const groupConnections = filteredConnections
                .filter(c => c.group_id === group.id)
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            
            if (groupConnections.length > 0) {
                nodes.push({
                    type: 'group',
                    group,
                    connections: groupConnections
                });
            }
        });

        // 添加未分组连接作为独立节点
        ungroupedConnections.forEach(conn => {
            nodes.push({
                type: 'connection',
                connection: conn
            });
        });

        // 按 sort_order 排序（分组和未分组连接混合）
        nodes.sort((a, b) => {
            const orderA = a.type === 'group' ? a.group.sort_order : a.connection.sort_order || 0;
            const orderB = b.type === 'group' ? b.group.sort_order : b.connection.sort_order || 0;
            return orderA - orderB;
        });

        return nodes;
    };

    const treeNodes = buildTreeNodes();

    const setActiveTab = useAppStore(state => state.setActiveTab);
    const setExpandedConnectionId = useAppStore(state => state.setExpandedConnectionId);
    const tabs = useAppStore(state => state.tabs);


    const handleConnect = (conn: Connection) => {
        // 查找是否已存在该连接的任何tab（包括表tab）
        const connTab = tabs.find(t => t.connectionId === conn.id);

        if (connTab) {
            // 如果已存在任何与该连接相关的tab，直接跳转
            setActiveTab(connTab.id);
        } else {
            // 对于不支持侧边栏树的类型，直接创建新 tab
            if (conn.db_type === 'memcached' || conn.db_type === 'postgres') {
                // 使用 AppStore 的 addTab 方法 (这里需要从 store 获取)
                // 由于这里没有直接导出 addTab，我们需要从 useAppStore 获取
                // 下面通过 useAppStore.getState().addTab 来调用，或者我们在组件内通过 hook 获取
                useAppStore.getState().addTab({
                    id: `connection-${conn.id}`,
                    title: conn.name,
                    type: conn.db_type,
                    connectionId: conn.id,
                });
            } else {
                // 否则仅展开侧边栏（不创建新tab），setExpandedConnectionId 会自动切换到 connections 视图
                setExpandedConnectionId(conn.id);
            }
        }
    };

    const handleCreate = async (data: Omit<Connection, 'id' | 'created_at'>) => {
        try {
            await createConnection(data);
            await fetchConnections();
            setIsNewConnOpen(false);
        } catch (error) {
            console.error("Failed to create connection:", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: t('common.failedToCreate') + " " + t('common.connection') + ": " + error
            });
        }
    };

    const handleUpdate = async (data: Omit<Connection, 'id' | 'created_at'>) => {
        if (!editingConn) return;
        try {
            await updateConnection({ ...data, id: editingConn.id });
            await fetchConnections();
            setEditingConn(null);
        } catch (error) {
            console.error("Failed to update connection:", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: t('common.failedToUpdate') + " " + t('common.connection') + ": " + error
            });
        }
    };

    const handleDelete = (id: number) => {
        setDeletingConnId(id);
    };

    const confirmDelete = async () => {
        if (deletingConnId === null) return;
        try {
            await deleteConnection(deletingConnId);
            await fetchConnections();
        } catch (error) {
            console.error("Failed to delete connection:", error);
        } finally {
            setDeletingConnId(null);
        }
    };

    const getIcon = (type: DbType) => {
        switch (type) {
            case 'mysql': return <Database className="w-4 h-4" />;
            case 'redis': return <Server className="w-4 h-4" />;
            case 'sqlite': return <FileCode className="w-4 h-4" />;
            case 'postgres': return <LayoutGrid className="w-4 h-4" />;
            case 'memcached': return <Server className="w-4 h-4" />; // Use Server icon for now, maybe distinct later
            default: return <Database className="w-4 h-4" />;
        }
    };

    const getColorClass = (type: DbType) => {
        switch (type) {
            case 'mysql': return "bg-blue-100 text-blue-600";
            case 'redis': return "bg-red-100 text-red-600";
            case 'sqlite': return "bg-green-100 text-green-600";
            case 'postgres': return "bg-indigo-100 text-indigo-600";
            case 'memcached': return "bg-orange-100 text-orange-600";
            default: return "bg-gray-100 text-gray-600";
        }
    };

    return (
        <div className="h-full flex flex-col bg-background p-8 overflow-y-auto">
            {/* Header Section */}
            <div className="flex flex-col gap-6 mb-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground mb-1">{t('sidebar.connections')}</h1>
                        <p className="text-muted-foreground text-sm">{t('common.selectConnection')}</p>
                    </div>
                    <div className="flex gap-3">
                        <Dialog open={isNewConnOpen} onOpenChange={setIsNewConnOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                                    <Plus className="w-4 h-4" />
                                    {t('menu.newConnection')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>{t('menu.newConnection')}</DialogTitle>
                                </DialogHeader>
                                <ConnectionForm
                                    onSubmit={handleCreate}
                                    onCancel={() => setIsNewConnOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>
                        <div className="flex gap-2">
                            <Button variant="outline" size="icon" onClick={() => setGroupManagerOpen(true)} title="管理分组">
                                <FolderTree className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => setSortOpen(true)} title={t('common.sortConnections', '排序连接')}>
                                <ArrowUpDown className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t('common.searchPlaceholder')}
                        className="pl-9 bg-card border-muted"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="border rounded-md bg-card shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>{t('common.name')}</TableHead>
                            <TableHead>{t('common.host')}</TableHead>
                            <TableHead>{t('common.type')}</TableHead>
                            <TableHead className="text-right"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    {t('common.loading', 'Loading...')}
                                </TableCell>
                            </TableRow>
                        ) : treeNodes.flatMap((node) => {
                            const rows = [];
                            
                            if (node.type === 'group') {
                                // Add group header row
                                rows.push(
                                    <TableRow key={`group-${node.group.id}`} className="bg-muted/30">
                                        <TableCell colSpan={5} className="font-semibold py-2">
                                            <div className="flex items-center gap-2">
                                                <div 
                                                    className="w-3 h-3 rounded-full" 
                                                    style={{ backgroundColor: node.group.color }}
                                                />
                                                <span>{node.group.name}</span>
                                                <span className="text-xs text-muted-foreground font-normal">({node.connections.length})</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                                
                                // Add connection rows for this group
                                node.connections.forEach((conn) => {
                                    rows.push(
                                        <TableRow
                                            key={conn.id}
                                            className="group cursor-pointer hover:bg-muted/50 transition-colors"
                                            onClick={() => handleConnect(conn)}
                                        >
                                            <TableCell>
                                                <div className={cn(
                                                    "w-8 h-8 rounded flex items-center justify-center ml-4",
                                                    getColorClass(conn.db_type)
                                                )}>
                                                    {getIcon(conn.db_type)}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div className="ml-4">{conn.name}</div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {conn.db_type === 'sqlite' ? t('common.localFile') : `${conn.host}:${conn.port}`}
                                            </TableCell>
                                            <TableCell>
                                                <span className={cn(
                                                    "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase border",
                                                    getColorClass(conn.db_type).replace("bg-", "bg-opacity-20 border-opacity-20 border-")
                                                )}>
                                                    {conn.db_type}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                                    <Button size="sm" variant="ghost" onClick={() => handleConnect(conn)}>
                                                        <ExternalLink className="w-4 h-4 mr-1" /> {t('common.connect')}
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button size="icon" variant="ghost">
                                                                <MoreHorizontal className="w-4 h-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => setEditingConn(conn)}>
                                                                <Edit className="w-4 h-4 mr-2" /> {t('common.edit')}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(conn.id)}>
                                                                <Trash2 className="w-4 h-4 mr-2" /> {t('common.delete')}
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                });
                            } else {
                                // Individual ungrouped connection (no group header)
                                const conn = node.connection;
                                rows.push(
                                    <TableRow
                                        key={conn.id}
                                        className="group cursor-pointer hover:bg-muted/50 transition-colors"
                                        onClick={() => handleConnect(conn)}
                                    >
                                        <TableCell>
                                            <div className={cn(
                                                "w-8 h-8 rounded flex items-center justify-center",
                                                getColorClass(conn.db_type)
                                            )}>
                                                {getIcon(conn.db_type)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium">{conn.name}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {conn.db_type === 'sqlite' ? t('common.localFile') : `${conn.host}:${conn.port}`}
                                        </TableCell>
                                        <TableCell>
                                            <span className={cn(
                                                "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase border",
                                                getColorClass(conn.db_type).replace("bg-", "bg-opacity-20 border-opacity-20 border-")
                                            )}>
                                                {conn.db_type}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                                <Button size="sm" variant="ghost" onClick={() => handleConnect(conn)}>
                                                    <ExternalLink className="w-4 h-4 mr-1" /> {t('common.connect')}
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button size="icon" variant="ghost">
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setEditingConn(conn)}>
                                                            <Edit className="w-4 h-4 mr-2" /> {t('common.edit')}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(conn.id)}>
                                                            <Trash2 className="w-4 h-4 mr-2" /> {t('common.delete')}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            }
                            
                            return rows;
                        })}
                        {!isLoading && filteredConnections.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    {t('common.noConnectionsFound')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Edit Dialog */}
            <Dialog open={!!editingConn} onOpenChange={(open) => !open && setEditingConn(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{t('common.edit')} {t('common.connection')}</DialogTitle>
                    </DialogHeader>
                    {editingConn && (
                        <ConnectionForm
                            initialData={editingConn}
                            onSubmit={handleUpdate}
                            onCancel={() => setEditingConn(null)}
                            submitLabel={t('common.save')}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deletingConnId !== null} onOpenChange={(open) => !open && setDeletingConnId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('common.delete')} {t('common.connection')}</DialogTitle>
                        <DialogDescription>
                            {t('common.confirmDelete') || "Are you sure you want to delete this connection?"}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingConnId(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            {t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Sort Dialog */}
            <ConnectionSorter
                open={sortOpen}
                onOpenChange={setSortOpen}
                connections={connections}
                groups={connectionGroups}
                onSave={() => {
                    fetchConnections();
                    fetchGroups();
                }}
            />

            {/* Group Manager Dialog */}
            <ConnectionGroupManager
                open={groupManagerOpen}
                onOpenChange={setGroupManagerOpen}
                onSuccess={() => {
                    fetchConnections();
                    fetchGroups();
                }}
            />
        </div>
    );
}
