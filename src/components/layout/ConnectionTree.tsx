import { useState } from "react";
import { Connection } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { 
  Database, 
  Server, 
  ChevronRight, 
  ChevronDown, 
  Table as TableIcon,
  Loader2
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface ConnectionTreeItemProps {
    connection: Connection;
    isActive: boolean;
    onSelect: (conn: Connection) => void;
    onSelectTable?: (conn: Connection, db: string, table: string) => void;
}

interface SqlResult {
    rows: Record<string, any>[];
}

export function ConnectionTreeItem({ connection, isActive, onSelect, onSelectTable }: ConnectionTreeItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [databases, setDatabases] = useState<string[]>([]);
    const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
    const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
    // Map dbName -> tables
    const [tables, setTables] = useState<Record<string, string[]>>({});
    const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set());

    // System databases to exclude
    const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);

    const toggleExpand = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (!isExpanded) {
            setIsExpanded(true);
            // Only load databases if it's MySQL and we haven't loaded them yet
            if (connection.db_type === 'mysql' && databases.length === 0) {
                await loadDatabases();
            }
        } else {
            setIsExpanded(false);
        }
    };

    // Also expand when selecting the connection
    const handleSelect = (e: React.MouseEvent) => {
        onSelect(connection);
        toggleExpand(e);
    };

    const loadDatabases = async () => {
        setIsLoadingDatabases(true);
        try {
            const result = await invoke<SqlResult>('execute_sql', {
                connectionId: connection.id,
                sql: 'SHOW DATABASES'
            });
            
            // Robustly parse result by taking the first value of each row
            const dbs = result.rows
                .map(row => Object.values(row)[0] as string)
                .filter(Boolean)
                .filter(db => !SYSTEM_DBS.has(db.toLowerCase()));
                
            setDatabases(dbs);
        } catch (err) {
            console.error("Failed to load databases:", err);
        } finally {
            setIsLoadingDatabases(false);
        }
    };

    const toggleDatabaseExpand = async (dbName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        
        const newExpanded = new Set(expandedDatabases);
        if (newExpanded.has(dbName)) {
            newExpanded.delete(dbName);
            setExpandedDatabases(newExpanded);
        } else {
            newExpanded.add(dbName);
            setExpandedDatabases(newExpanded);
            
            if (!tables[dbName]) {
                await loadTables(dbName);
            }
        }
    };

    const loadTables = async (dbName: string) => {
        const newLoading = new Set(loadingTables);
        newLoading.add(dbName);
        setLoadingTables(newLoading);

        try {
            const result = await invoke<SqlResult>('execute_sql', {
                connectionId: connection.id,
                sql: `SHOW TABLES FROM ${dbName}`
            });
            
            // Robustly parse result by taking the first value of each row
            const tableNames = result.rows
                .map(row => Object.values(row)[0] as string)
                .filter(Boolean);

            setTables(prev => ({
                ...prev,
                [dbName]: tableNames
            }));
        } catch (err) {
            console.error(`Failed to load tables for ${dbName}:`, err);
        } finally {
            const finishedLoading = new Set(loadingTables);
            finishedLoading.delete(dbName);
            setLoadingTables(finishedLoading);
        }
    };

    // Redis doesn't support this tree view yet
    if (connection.db_type !== 'mysql') {
        return (
            <div
                onClick={() => onSelect(connection)}
                className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors mb-1 text-sm",
                    isActive
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
            >
                <Server className="h-4 w-4 text-red-500" />
                <span className="truncate">{connection.name}</span>
            </div>
        );
    }

    return (
        <div className="mb-1 select-none">
            {/* Connection Row */}
            <div
                className={cn(
                    "flex items-center gap-1 px-2 py-2 rounded-md cursor-pointer transition-colors text-sm group",
                    isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
                onClick={handleSelect}
            >
                <button 
                    className="p-0.5 rounded-sm hover:bg-background/20 text-muted-foreground"
                    onClick={toggleExpand}
                >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
                
                <Database className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="truncate flex-1">{connection.name}</span>
            </div>

            {/* Databases List */}
            {isExpanded && (
                <div className="ml-4 border-l border-border/40 pl-1">
                    {isLoadingDatabases ? (
                        <div className="px-4 py-2 flex items-center gap-2 text-muted-foreground text-xs">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Loading...</span>
                        </div>
                    ) : (
                        databases.map(db => (
                            <div key={db} className="flex flex-col">
                                <div 
                                    className="flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground text-xs"
                                    onClick={(e) => toggleDatabaseExpand(db, e)}
                                >
                                    <button className="p-0.5">
                                        {expandedDatabases.has(db) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </button>
                                    <Database className="h-3 w-3 text-yellow-500/70 shrink-0" />
                                    <span className="truncate">{db}</span>
                                </div>

                                {/* Tables List */}
                                {expandedDatabases.has(db) && (
                                    <div className="ml-4 border-l border-border/40 pl-1">
                                        {loadingTables.has(db) ? (
                                            <div className="px-4 py-1 flex items-center gap-2 text-muted-foreground text-xs">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span>Loading...</span>
                                            </div>
                                        ) : (
                                            tables[db]?.map(table => (
                                                <div 
                                                    key={table}
                                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground text-xs ml-4"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectTable?.(connection, db, table);
                                                    }}
                                                >
                                                    <TableIcon className="h-3 w-3 text-blue-400/70 shrink-0" />
                                                    <span className="truncate">{table}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
