import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, Connection, Tab } from "@/store/useAppStore";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Table as TableIcon,
    Search,
    Loader2,
    RefreshCw,
    Plus,
    Trash2,
    FileCode,
    Play
} from "lucide-react";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { addCommandToConsole } from "@/components/ui/CommandConsole";
import { CreateTableDialog } from "@/components/workspace/CreateTableDialog";

interface SqlResult {
    rows: Record<string, any>[];
}

interface DatabaseTablesTabProps {
    tabId: string;
    connectionId: number;
    dbName: string;
    dbType: string;
}

export function DatabaseTablesTab({ tabId, connectionId, dbName, dbType }: DatabaseTablesTabProps) {
    const { t } = useTranslation();
    const addTab = useAppStore(state => state.addTab);
    const connection = useAppStore(state => state.connections.find(c => c.id === connectionId));

    const [tables, setTables] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    
    // Create table dialog state
    const [showCreateTableDialog, setShowCreateTableDialog] = useState(false);

    useEffect(() => {
        loadTables();
    }, [connectionId, dbName]);

    const loadTables = async () => {
        if (!connection) return;

        setIsLoading(true);
        setError(null);
        
        const startTime = Date.now();
        let command = "";
        
        try {
            let tableNames: string[] = [];

            if (dbType === 'sqlite') {
                command = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;";
                const result = await invoke<SqlResult>('execute_sqlite_sql', {
                    connectionId,
                    sql: command
                });
                tableNames = result.rows
                    .map(row => Object.values(row)[0] as string)
                    .filter(Boolean);
            } else {
                command = `SHOW TABLES FROM \`${dbName}\``;
                const result = await invoke<SqlResult>('execute_sql', {
                    connectionId,
                    sql: command
                });

                // Robustly parse result by taking the first value of each row
                tableNames = result.rows
                    .map(row => Object.values(row)[0] as string)
                    .filter(Boolean);
            }

            setTables(tableNames);

            addCommandToConsole({
                databaseType: dbType as any,
                command: command,
                duration: Date.now() - startTime,
                success: true
            });
        } catch (err) {
            console.error(`Failed to load tables for ${dbName}:`, err);
            setError(String(err));

            addCommandToConsole({
                databaseType: dbType as any,
                command: command || `Load tables for ${dbName}`,
                duration: Date.now() - startTime,
                success: false,
                error: String(err)
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectTable = (table: string) => {
        if (!connection) return;

        const newTabId = `table-${connection.id}-${dbName}-${table}`;
        
        // 检查 tab 是否已存在（useAppStore.addTab 会处理激活逻辑）
        addTab({
            id: newTabId,
            title: table,
            type: connection.db_type,
            connectionId: connection.id,
            initialSql: connection.db_type === 'sqlite'
                ? `SELECT * FROM "${table}" LIMIT 100;`
                : `SELECT * FROM \`${dbName}\`.\`${table}\` LIMIT 100;`,
            dbName: dbName,
            tableName: table
        });
    };

    const handleViewTableSchema = (table: string) => {
        if (!connection) return;
        
        const schemaTabId = `schema-${connection.id}-${dbName}-${table}`;
        addTab({
            id: schemaTabId,
            title: `${table} - ${t('mysql.tableStructure')}`,
            type: connection.db_type,
            tabType: 'table-schema',
            connectionId: connection.id,
            schemaInfo: {
                dbName,
                tableName: table
            }
        });
    };

    const handleNewQueryTab = (table?: string) => {
        if (!connection) return;

        const queryTabId = `query-${connection.id}-${dbName}-${Date.now()}`;
        const initialSql = table
            ? `SELECT * FROM \`${dbName}\`.\`${table}\`;`
            : `-- ${t('mysql.newQueryTab', '新建查询')}\nSELECT * FROM \`${dbName}\`.table_name;`;
        
        addTab({
            id: queryTabId,
            title: table ? `${table} - Query` : `${dbName} - Query`,
            type: connection.db_type,
            connectionId: connection.id,
            dbName,
            tableName: table || undefined,
            initialSql
        });
    };

    const handleDeleteTable = async (table: string) => {
        if (!connection) return;
        
        if (!confirm(t('mysql.confirmDeleteTable', { table: table }))) {
            return;
        }

        try {
            const sql = `DROP TABLE \`${dbName}\`.\`${table}\``;
            const startTime = Date.now();

            await invoke("execute_sql", {
                connectionId,
                sql
            });

            addCommandToConsole({
                databaseType: connection.db_type as any,
                command: sql,
                duration: Date.now() - startTime,
                success: true
            });

            // 刷新表列表
            await loadTables();
        } catch (err: any) {
            console.error("Failed to drop table:", err);
            alert(t('common.error') + ': ' + String(err));

            addCommandToConsole({
                databaseType: connection.db_type as any,
                command: `DROP TABLE \`${dbName}\`.\`${table}\``,
                duration: 0,
                success: false,
                error: String(err)
            });
        }
    };

    const filteredTables = tables.filter(t => 
        t.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!connection) {
        return <div className="p-4 text-red-500">Connection not found</div>;
    }

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Toolbar */}
            <div className="p-2 border-b flex gap-2 items-center bg-muted/30 justify-between">
                <div className="flex items-center gap-2 flex-1">
                    <div className="relative max-w-sm flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={t('common.searchTables', '搜索表...')}
                            className="pl-8 h-8 text-sm"
                        />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {filteredTables.length} {t('common.items', '项')}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8" 
                        onClick={() => loadTables()}
                        title={t('common.refresh', '刷新')}
                    >
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </Button>
                    {dbType === 'mysql' && (
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 gap-1"
                            onClick={() => setShowCreateTableDialog(true)}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {t('mysql.createTable', '新建表')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
                {error && (
                    <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm border border-destructive/20">
                        {error}
                    </div>
                )}

                {isLoading && tables.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>{t('common.loading', '加载中...')}</span>
                    </div>
                ) : filteredTables.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                        <TableIcon className="h-10 w-10 opacity-20" />
                        <span>{searchTerm ? t('common.noMatches', '未找到匹配项') : t('common.noTables', '暂无数据表')}</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2 content-start">
                        {filteredTables.map(table => (
                            <ContextMenu key={table}>
                                <ContextMenuTrigger>
                                    <div 
                                        className="group flex flex-col items-start p-2 rounded-lg bg-card hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors relative"
                                        onClick={() => handleSelectTable(table)}
                                    >
                                        <div className="flex items-center gap-2 w-full">
                                            <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-500 group-hover:bg-background/80 transition-colors shrink-0">
                                                <TableIcon className="h-4 w-4" />
                                            </div>
                                            <span className="font-medium truncate text-sm flex-1" title={table}>{table}</span>
                                        </div>
                                    </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent className="w-48">
                                    <ContextMenuItem onClick={() => handleSelectTable(table)}>
                                        <TableIcon className="mr-2 h-4 w-4" />
                                        {t('mysql.viewData', '查看数据')}
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => handleViewTableSchema(table)}>
                                        <FileCode className="mr-2 h-4 w-4" />
                                        {t('mysql.viewSchema', '查看结构')}
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => handleNewQueryTab(table)}>
                                        <Play className="mr-2 h-4 w-4" />
                                        {t('mysql.newQueryTab', '新建查询')}
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem onClick={() => handleDeleteTable(table)} className="text-red-600 focus:text-red-600">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        {t('mysql.deleteTable', '删除表')}
                                    </ContextMenuItem>
                                </ContextMenuContent>
                            </ContextMenu>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Table Dialog */}
            {dbType === 'mysql' && (
                <CreateTableDialog
                    open={showCreateTableDialog}
                    onOpenChange={setShowCreateTableDialog}
                    connectionId={connectionId}
                    dbName={dbName}
                    onSuccess={() => {
                        loadTables();
                        setShowCreateTableDialog(false);
                    }}
                />
            )}
        </div>
    );
}
