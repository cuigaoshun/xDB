import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Play, Loader2, FileCode } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAppStore } from "@/store/useAppStore";

interface SqlResult {
  columns: string[];
  rows: Record<string, any>[];
  affected_rows: number;
}

interface MysqlWorkspaceProps {
    tabId: string;
    name: string;
    connectionId: number;
    initialSql?: string;
    savedSql?: string;
    dbName?: string;
    tableName?: string;
}

export function MysqlWorkspace({ tabId, name, connectionId, initialSql, savedSql, dbName, tableName }: MysqlWorkspaceProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const updateTab = useAppStore(state => state.updateTab);
  
  const [sql, setSql] = useState(savedSql || initialSql || "SELECT * FROM users LIMIT 100;");
  const [result, setResult] = useState<SqlResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Sync SQL changes to global store (debounced)
  useEffect(() => {
      const timer = setTimeout(() => {
          updateTab(tabId, { currentSql: sql });
      }, 500);
      return () => clearTimeout(timer);
  }, [sql, tabId, updateTab]);

  // Determine effective theme for syntax highlighter
  const [isDark, setIsDark] = useState(true);
  
  useEffect(() => {
      if (theme === 'system') {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
          setIsDark(mediaQuery.matches);
          
          const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
          mediaQuery.addEventListener('change', handler);
          return () => mediaQuery.removeEventListener('change', handler);
      } else {
          setIsDark(theme === 'dark');
      }
  }, [theme]);

  // Helper to remove background from theme for seamless integration
  const transparentTheme = (theme: any) => {
      const newTheme = { ...theme };
      // Override pre and code blocks to be transparent
      const transparent = { background: 'transparent', textShadow: 'none' };
      
      if (newTheme['pre[class*="language-"]']) {
          newTheme['pre[class*="language-"]'] = { ...newTheme['pre[class*="language-"]'], ...transparent };
      }
      if (newTheme['code[class*="language-"]']) {
          newTheme['code[class*="language-"]'] = { ...newTheme['code[class*="language-"]'], ...transparent };
      }
      return newTheme;
  };

  // DDL related state
  const [showDDL, setShowDDL] = useState(!!tableName);
  const [ddl, setDdl] = useState<string>("");
  const [isLoadingDDL, setIsLoadingDDL] = useState(false);

  // If initialSql is provided (e.g. when opening a table), update state and run it
  useEffect(() => {
      if (initialSql && !savedSql) {
          setSql(initialSql);
          executeSql(initialSql);
      }
  }, [initialSql]);

  // Load DDL when panel is opened or table changes
  useEffect(() => {
      if (showDDL && dbName && tableName) {
          loadDDL();
      }
  }, [showDDL, dbName, tableName]);

  const loadDDL = async () => {
      if (!dbName || !tableName) return;
      
      setIsLoadingDDL(true);
      try {
          // Use execute_sql to get create table statement
          const res = await invoke<SqlResult>("execute_sql", {
              connectionId,
              sql: `SHOW CREATE TABLE \`${dbName}\`.\`${tableName}\``
          });
          
          if (res.rows.length > 0) {
              const row = res.rows[0];
              
              // Strategy 1: Search for value starting with CREATE TABLE/VIEW
              // This is the most robust way as it ignores column names
              const values = Object.values(row);
              const ddlValue = values.find(v => 
                  typeof v === 'string' && (
                      v.trim().toUpperCase().startsWith('CREATE TABLE') || 
                      v.trim().toUpperCase().startsWith('CREATE VIEW')
                  )
              );
              
              if (ddlValue) {
                  setDdl(ddlValue as string);
              } else {
                  // Strategy 2: Fallback to second column if available (standard MySQL behavior)
                  if (res.columns.length >= 2) {
                       const ddlCol = res.columns[1];
                       // Try to access by column name
                       if (row[ddlCol]) {
                           setDdl(row[ddlCol] as string);
                       } else {
                           // If not found by name, try second value
                           if (values.length >= 2) {
                               setDdl(values[1] as string);
                           } else {
                               setDdl("-- DDL not found in result row.");
                           }
                       }
                  } else {
                      // Fallback: just show the whole row
                      setDdl("-- DDL structure unrecognized: " + JSON.stringify(row, null, 2));
                  }
              }
          } else {
              setDdl("-- No results returned for SHOW CREATE TABLE");
          }
      } catch (err: any) {
          console.error("Failed to load DDL:", err);
          setDdl(`-- Failed to load DDL: ${typeof err === 'string' ? err : JSON.stringify(err)}`);
      } finally {
          setIsLoadingDDL(false);
      }
  };

  const executeSql = async (query: string) => {
      if (!query.trim()) return;
      
      setIsLoading(true);
      setError(null);
      setResult(null);

      try {
          const data = await invoke<SqlResult>("execute_sql", {
              connectionId,
              sql: query
          });
          setResult(data);
      } catch (err: any) {
          console.error("Execute SQL failed:", err);
          setError(typeof err === 'string' ? err : JSON.stringify(err));
      } finally {
          setIsLoading(false);
      }
  };

  const handleExecute = () => {
      executeSql(sql);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="border-b p-2 flex gap-2 items-center bg-muted/5 justify-between">
        <div className="flex gap-2 items-center">
            <div className="text-sm font-medium px-3 py-1 bg-muted/20 rounded border border-muted">
                {name}
            </div>
            <div className="h-4 w-[1px] bg-border mx-2"></div>
            <Button 
                size="sm" 
                onClick={handleExecute} 
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                {t('common.run', 'Run')}
            </Button>
        </div>
        
        {/* Right Side Toolbar Actions */}
        <div className="flex gap-2 items-center">
            {tableName && (
                <Button
                    variant={showDDL ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setShowDDL(!showDDL)}
                    title="Show DDL"
                    className={cn(showDDL && "bg-muted")}
                >
                    <FileCode className="h-4 w-4 mr-1" />
                    DDL
                </Button>
            )}
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={showDDL ? 70 : 100} minSize={30}>
                <div className="h-full flex flex-col">
                    {/* Query Area */}
                    <div className="h-1/3 p-4 border-b bg-background">
                        <Textarea 
                            value={sql}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSql(e.target.value)}
                            className="font-mono h-full resize-none"
                            placeholder="Enter your SQL query here..."
                        />
                    </div>

                    {/* Result Area */}
                    <div className="flex-1 overflow-auto bg-muted/5 p-4">
                    {error && (
                        <div className="p-4 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm font-mono whitespace-pre-wrap">
                            Error: {error}
                        </div>
                    )}

                    {result && (
                        <div className="h-full flex flex-col">
                            <div className="mb-2 text-xs text-muted-foreground flex justify-between">
                                <span>{result.rows.length} rows returned</span>
                                {result.affected_rows > 0 && <span>Affected Rows: {result.affected_rows}</span>}
                            </div>
                            
                            <div className="border rounded-md bg-background overflow-auto flex-1">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-muted/50">
                                        <TableRow>
                                            {result.columns.map((col, i) => (
                                                <TableHead key={i} className="whitespace-nowrap">{col}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {result.rows.map((row, idx) => (
                                            <TableRow key={idx} className="hover:bg-muted/50">
                                                {result.columns.map((col, i) => (
                                                    <TableCell key={i} className="whitespace-nowrap max-w-[300px] truncate">
                                                        {row[col] === null ? <span className="text-muted-foreground italic">NULL</span> : String(row[col])}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                        {result.rows.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={result.columns.length || 1} className="text-center h-24 text-muted-foreground">
                                                    No results
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {!result && !error && !isLoading && (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                            Enter a query and click Run to see results
                        </div>
                    )}
                    </div>
                </div>
            </ResizablePanel>
            
            {showDDL && (
                <>
                    <ResizableHandle />
                    <ResizablePanel defaultSize={25} minSize={20} maxSize={60}>
                        <div className="h-full flex flex-col bg-background border-l">
                            <div className="p-2 border-b bg-muted/10 text-sm font-medium flex justify-between items-center">
                                <span>Table DDL: {tableName}</span>
                            </div>
                            <div className="flex-1 overflow-auto p-4 bg-background">
                                {isLoadingDDL ? (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Loading...
                                    </div>
                                ) : (
                                    <SyntaxHighlighter
                                        language="sql"
                                        style={transparentTheme(isDark ? vscDarkPlus : vs)}
                                        customStyle={{ margin: 0, height: '100%', borderRadius: 0, fontSize: '14px', backgroundColor: 'transparent' }}
                                        wrapLongLines={true}
                                    >
                                        {ddl}
                                    </SyntaxHighlighter>
                                )}
                            </div>
                        </div>
                    </ResizablePanel>
                </>
            )}
          </ResizablePanelGroup>
      </div>
    </div>
  );
}
