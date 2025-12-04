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
    filterTerm?: string;
}

interface SqlResult {
    rows: Record<string, any>[];
}

export function ConnectionTreeItem({ connection, isActive, onSelect, onSelectTable, filterTerm }: ConnectionTreeItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [databases, setDatabases] = useState<string[]>([]);
    const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
    const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    // Map dbName -> tables
    const [tables, setTables] = useState<Record<string, string[]>>({});
    const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set());

    // System databases to exclude
    const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);

    // Auto-expand if filter matches something inside (and we have data)
    // This is tricky with lazy loading. We only filter what we have.
    
    const isMatch = (text: string) => !filterTerm || text.toLowerCase().includes(filterTerm.toLowerCase());

    // Filter databases to display
    const getFilteredDatabases = () => {
        if (!filterTerm) return databases;
        return databases.filter(db => {
            if (isMatch(db)) return true;
            // Check if any table matches
            const dbTables = tables[db];
            if (dbTables && dbTables.some(t => isMatch(t))) return true;
            return false;
        });
    };

    // Filter tables to display for a db
    const getFilteredTables = (db: string) => {
        const dbTables = tables[db] || [];
        if (!filterTerm) return dbTables;
        return dbTables.filter(t => isMatch(t));
    };

    const toggleExpand = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (!isExpanded) {
            setIsExpanded(true);
            // Load databases if not loaded yet (for supported types)
            if ((connection.db_type === 'mysql' || connection.db_type === 'redis') && databases.length === 0) {
                await loadDatabases();
            }
        } else {
            setIsExpanded(false);
        }
    };

    // Also expand when selecting the connection
    const handleSelect = (e: React.MouseEvent) => {
        onSelect(connection);
        if (!isExpanded) {
            toggleExpand(e);
        }
    };

    interface RedisCommandResult {
        output: any;
    }

    const loadDatabases = async () => {
        setError(null);
        if (connection.db_type === 'redis') {
            try {
                // Try to fetch real config
                const result = await invoke<RedisCommandResult>('execute_redis_command', {
                    connectionId: connection.id,
                    command: 'CONFIG',
                    args: ['GET', 'databases'],
                    db: 0
                });

                let count = 16; // Default fallback
                
                // Output format for CONFIG GET databases is usually ["databases", "16"]
                if (Array.isArray(result.output) && result.output.length >= 2) {
                    const key = result.output[0];
                    const value = result.output[1];
                    
                    if (key === 'databases') {
                        const parsed = parseInt(value);
                        if (!isNaN(parsed) && parsed > 0) {
                            count = parsed;
                        }
                    }
                }

                const redisDbs = Array.from({ length: count }, (_, i) => i.toString());
                setDatabases(redisDbs);
            } catch (err: any) {
                const errorMsg = String(err);
                if (errorMsg.toLowerCase().includes("failed to connect") || errorMsg.toLowerCase().includes("connection refused")) {
                     setError(errorMsg);
                     // If connection fails, do NOT fallback to 16 DBs, just show error
                     setDatabases([]); 
                } else {
                    console.warn("Failed to fetch Redis config, falling back to 16:", err);
                    const redisDbs = Array.from({ length: 16 }, (_, i) => i.toString());
                    setDatabases(redisDbs);
                }
            }
            return;
        }

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
            setError(String(err));
            setDatabases([]);
        } finally {
            setIsLoadingDatabases(false);
        }
    };

    const toggleDatabaseExpand = async (dbName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        
        // For Redis, clicking a DB just selects it (opens tab)
        if (connection.db_type === 'redis') {
            onSelectTable?.(connection, dbName, ""); // Table name empty for Redis
            return;
        }

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

    // Other types (sqlite, postgres) might not support tree view yet
    if (connection.db_type !== 'mysql' && connection.db_type !== 'redis') {
        // Simple filter for non-supported types
        if (filterTerm && !isMatch(connection.name)) return null;
        
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
    
    // For MySQL & Redis:
    const filteredDatabases = getFilteredDatabases();
    
    const selfMatch = isMatch(connection.name);
    const hasMatchingChildren = filteredDatabases.length > 0;
    
    // Hide if loaded and no matches
    if (filterTerm && !selfMatch && databases.length > 0 && !hasMatchingChildren) {
        return null;
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
                
                {connection.db_type === 'redis' ? (
                    <Server className="h-4 w-4 text-red-500 shrink-0" />
                ) : (
                    <Database className="h-4 w-4 text-blue-500 shrink-0" />
                )}
                <span className="truncate flex-1">
                    {connection.name} 
                </span>
            </div>

            {/* Databases List */}
            {isExpanded && (
                <div className="ml-4 border-l border-border/40 pl-1 max-h-[320px] overflow-y-auto">
                    {error && (
                        <div className="px-2 py-1.5 text-xs text-destructive bg-destructive/10 rounded mx-1 mb-1 break-words">
                            {error}
                        </div>
                    )}
                    {isLoadingDatabases ? (
                        <div className="px-4 py-2 flex items-center gap-2 text-muted-foreground text-xs">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Loading...</span>
                        </div>
                    ) : (
                        filteredDatabases.map(db => (
                            <div key={db} className="flex flex-col">
                                <div 
                                    className="flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-muted-foreground hover:text-foreground text-xs"
                                    onClick={(e) => toggleDatabaseExpand(db, e)}
                                >
                                    {connection.db_type === 'mysql' && (
                                        <button className="p-0.5">
                                            {expandedDatabases.has(db) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                        </button>
                                    )}
                                    
                                    <Database className={cn(
                                        "h-3 w-3 shrink-0",
                                        connection.db_type === 'redis' ? "text-red-400/70" : "text-yellow-500/70"
                                    )} />
                                    <span className="truncate">
                                        {connection.db_type === 'redis' ? `DB ${db}` : db}
                                    </span>
                                </div>

                                {/* Tables List (MySQL only) */}
                                {connection.db_type === 'mysql' && expandedDatabases.has(db) && (
                                    <div className="ml-4 border-l border-border/40 pl-1">
                                        {loadingTables.has(db) ? (
                                            <div className="px-4 py-1 flex items-center gap-2 text-muted-foreground text-xs">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span>Loading...</span>
                                            </div>
                                        ) : (
                                            getFilteredTables(db).map(table => (
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
