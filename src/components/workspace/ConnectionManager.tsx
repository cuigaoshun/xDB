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
import { Plus, Search, Database, Server, MoreHorizontal, ExternalLink } from "lucide-react";
import { useAppStore, Connection } from "@/store/useAppStore";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Reuse Dialog from AppMenubar logic later or refactor to shared component
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ConnectionManager() {
  const { t } = useTranslation();
  const connections = useAppStore((state) => state.connections);
  const addTab = useAppStore((state) => state.addTab);
  const addConnection = useAppStore((state) => state.addConnection);
  const [searchTerm, setSearchTerm] = useState("");
  
  // New Connection Dialog State
  const [isNewConnOpen, setIsNewConnOpen] = useState(false);
  const [newConnName, setNewConnName] = useState("");
  const [newConnType, setNewConnType] = useState<"mysql" | "redis">("mysql");

  const filteredConnections = connections.filter(conn => 
    conn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conn.host.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConnect = (conn: Connection) => {
    addTab({
      id: `conn-${conn.id}`,
      title: conn.name,
      type: conn.type,
      connectionId: conn.id,
    });
  };

  const handleCreateConnection = () => {
      addConnection({
          id: Date.now().toString(),
          name: newConnName || "New Connection",
          type: newConnType,
          host: "localhost",
          port: newConnType === 'mysql' ? 3306 : 6379
      });
      setIsNewConnOpen(false);
      setNewConnName("");
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
                     {/* Dialog for New Connection */}
                     <Dialog open={isNewConnOpen} onOpenChange={setIsNewConnOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="w-4 h-4" />
                                {t('menu.newConnection')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{t('menu.newConnection')}</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <span className="text-right text-sm">{t('common.name')}</span>
                                    <Input
                                        id="name"
                                        value={newConnName}
                                        onChange={(e) => setNewConnName(e.target.value)}
                                        className="col-span-3"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <span className="text-right text-sm">{t('common.type')}</span>
                                    <div className="col-span-3 flex gap-2">
                                        <Button 
                                            variant={newConnType === 'mysql' ? 'default' : 'outline'} 
                                            onClick={() => setNewConnType('mysql')}
                                            size="sm"
                                        >
                                            MySQL
                                        </Button>
                                        <Button 
                                            variant={newConnType === 'redis' ? 'default' : 'outline'} 
                                            onClick={() => setNewConnType('redis')}
                                            size="sm"
                                        >
                                            Redis
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button onClick={handleCreateConnection}>{t('common.create')}</Button>
                            </div>
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
                        <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredConnections.map((conn) => (
                        <TableRow key={conn.id} className="group hover:bg-muted/50 cursor-pointer" onClick={() => handleConnect(conn)}>
                            <TableCell>
                                <div className={cn(
                                    "w-8 h-8 rounded flex items-center justify-center",
                                    conn.type === 'mysql' ? "bg-blue-100 text-blue-600" : "bg-red-100 text-red-600"
                                )}>
                                    {conn.type === 'mysql' ? <Database className="w-4 h-4" /> : <Server className="w-4 h-4" />}
                                </div>
                            </TableCell>
                            <TableCell className="font-medium">{conn.name}</TableCell>
                            <TableCell className="text-muted-foreground">{conn.host}:{conn.port}</TableCell>
                            <TableCell>
                                <span className={cn(
                                    "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                                    conn.type === 'mysql' ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-red-50 text-red-700 border border-red-200"
                                )}>
                                    {conn.type.toUpperCase()}
                                </span>
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleConnect(conn); }}>
                                        <ExternalLink className="w-4 h-4 mr-1" /> {t('common.connect')}
                                    </Button>
                                    <Button size="icon" variant="ghost">
                                        <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                    {filteredConnections.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                {t('common.noConnectionsFound')}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    </div>
  );
}
