import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SqlResult {
  columns: string[];
  rows: Record<string, any>[];
  affected_rows: number;
}

interface MysqlWorkspaceProps {
    name: string;
    connectionId: number;
    initialSql?: string;
}

export function MysqlWorkspace({ name, connectionId, initialSql }: MysqlWorkspaceProps) {
  const { t } = useTranslation();
  const [sql, setSql] = useState(initialSql || "SELECT * FROM users LIMIT 100;");
  const [result, setResult] = useState<SqlResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If initialSql is provided (e.g. when opening a table), update state and run it
  useEffect(() => {
      if (initialSql) {
          setSql(initialSql);
          // We define a separate async function inside effect or call handleExecute
          // but handleExecute depends on current scope 'sql' state which might not be updated yet in this closure if we call it directly.
          // Actually, if we setSql, we should wait for re-render or pass the sql directly.
          executeSql(initialSql);
      }
  }, [initialSql]);

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
      </div>
      
      <div className="flex-1 flex flex-col overflow-hidden">
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
    </div>
  );
}
