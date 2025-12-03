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
import { Plus, Search, Database, Server, MoreHorizontal, ExternalLink, Trash2, Edit, FileCode, LayoutGrid } from "lucide-react";
import { useAppStore, Connection, DbType } from "@/store/useAppStore";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConnectionForm } from "../connection/ConnectionForm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ConnectionManager() {
  const { t } = useTranslation();
  const connections = useAppStore((state) => state.connections);
  const setConnections = useAppStore((state) => state.setConnections);
  const addTab = useAppStore((state) => state.addTab);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewConnOpen, setIsNewConnOpen] = useState(false);
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load connections from backend
  const fetchConnections = async () => {
      try {
          setIsLoading(true);
          const data = await invoke<Connection[]>("get_all_connections");
          setConnections(data);
      } catch (error) {
          console.error("Failed to fetch connections:", error);
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
      fetchConnections();
  }, []);

  const filteredConnections = connections.filter(conn => 
    conn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (conn.host && conn.host.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleConnect = (conn: Connection) => {
    addTab({
      id: `conn-${conn.id}`,
      title: conn.name,
      type: conn.db_type,
      connectionId: conn.id,
    });
  };

  const handleCreate = async (data: Omit<Connection, 'id' | 'created_at'>) => {
      try {
          // Backend expects 'args' object wrapping the fields for CreateConnectionArgs
          // Rust struct: pub struct CreateConnectionArgs { name, db_type, ... }
          // Command signature: fn create_connection(..., args: CreateConnectionArgs)
          
          // Note: invoke accepts an object where keys map to function arguments.
          // So we pass { args: data }
          await invoke("create_connection", { args: data });
          await fetchConnections();
          setIsNewConnOpen(false);
      } catch (error) {
          console.error("Failed to create connection:", error);
          alert("Failed to create connection: " + error);
      }
  };

  const handleUpdate = async (data: Omit<Connection, 'id' | 'created_at'>) => {
      if (!editingConn) return;
      try {
          // Rust struct: pub struct UpdateConnectionArgs { id, name, ... }
          // We need to merge id into the data
          await invoke("update_connection", { 
              args: { ...data, id: editingConn.id } 
          });
          await fetchConnections();
          setEditingConn(null);
      } catch (error) {
          console.error("Failed to update connection:", error);
          alert("Failed to update connection: " + error);
      }
  };

  const handleDelete = async (id: number) => {
      if (!confirm(t('common.confirmDelete') || "Are you sure you want to delete this connection?")) return;
      try {
          await invoke("delete_connection", { id });
          await fetchConnections();
      } catch (error) {
          console.error("Failed to delete connection:", error);
      }
  };

  const getIcon = (type: DbType) => {
      switch (type) {
          case 'mysql': return <Database className="w-4 h-4" />;
          case 'redis': return <Server className="w-4 h-4" />;
          case 'sqlite': return <FileCode className="w-4 h-4" />;
          case 'postgres': return <LayoutGrid className="w-4 h-4" />; // Placeholder icon
          default: return <Database className="w-4 h-4" />;
      }
  };

  const getColorClass = (type: DbType) => {
      switch (type) {
          case 'mysql': return "bg-blue-100 text-blue-600";
          case 'redis': return "bg-red-100 text-red-600";
          case 'sqlite': return "bg-green-100 text-green-600";
          case 'postgres': return "bg-indigo-100 text-indigo-600";
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

        {/* Connection Table */}
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
                                Loading...
                            </TableCell>
                        </TableRow>
                    ) : filteredConnections.map((conn) => (
                        <TableRow key={conn.id} className="group hover:bg-muted/50 cursor-pointer" onClick={() => handleConnect(conn)}>
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
                                {conn.db_type === 'sqlite' ? 'Local File' : `${conn.host}:${conn.port}`}
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
                    ))}
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
    </div>
  );
}
