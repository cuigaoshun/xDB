import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/useAppStore";
import { Textarea } from "@/components/ui/textarea";
import { addCommandToConsole } from "@/components/ui/CommandConsole";

// 简单的 SqlResult 定义
interface SqlResult {
  columns: { name: string; type_name: string }[];
  rows: Record<string, any>[];
  affected_rows: number;
}

interface SqliteWorkspaceProps {
  tabId: string;
  name: string;
  connectionId: number;
  initialSql?: string;
  savedSql?: string; // 从 store 恢复的 SQL
  savedResult?: SqlResult;
}

export function SqliteWorkspace({ tabId, name: _name, connectionId, initialSql, savedSql, savedResult }: SqliteWorkspaceProps) {
  const [sql, setSql] = useState(savedSql || initialSql || "SELECT * FROM sqlite_master LIMIT 10;");
  const [result, setResult] = useState<SqlResult | null>(savedResult || null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const updateTab = useAppStore((state) => state.updateTab);
  const initialSqlExecuted = useRef(false);

  // 当 sql 变化时，更新 store
  useEffect(() => {
    const timer = setTimeout(() => {
      updateTab(tabId, { currentSql: sql, savedResult: result });
    }, 500);
    return () => clearTimeout(timer);
  }, [sql, result, tabId, updateTab]);

  // Initialize with initialSql if provided
  useEffect(() => {
    if (initialSql && !savedSql && !initialSqlExecuted.current) {
      setSql(initialSql);
      runQuery(initialSql);
      initialSqlExecuted.current = true;
    }
  }, [initialSql]);

  const runQuery = async (queryOverride?: string) => {
    const sqlToRun = queryOverride || sql;
    setLoading(true);
    setError(null);

    const startTime = Date.now();

    try {
      const res = await invoke<SqlResult>("execute_sqlite_sql", {
        connectionId,
        sql: sqlToRun,
      });
      setResult(res);

      addCommandToConsole({
        databaseType: 'sqlite',
        command: sqlToRun,
        duration: Date.now() - startTime,
        success: true
      });
    } catch (err) {
      setError(String(err));
      setResult(null);

      addCommandToConsole({
        databaseType: 'sqlite',
        command: sqlToRun,
        duration: Date.now() - startTime,
        success: false,
        error: String(err)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted/10">
        <Button size="sm" onClick={() => runQuery()} disabled={loading} className="gap-1">
          <Play className="w-4 h-4" /> Run
        </Button>
      </div>

      {/* Editor */}
      <div className="h-1/3 border-b relative bg-background p-2">
        <Textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          className="font-mono h-full resize-none"
          placeholder="Enter SQL query..."
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-hidden flex flex-col bg-background">
        {loading && (
          <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Running query...
          </div>
        )}

        {error && (
          <div className="p-4 text-sm text-red-500 bg-red-50/10 border-b border-red-100/20">
            Error: {error}
          </div>
        )}

        {result && (
          <div className="flex-1 overflow-auto">
            {/* Result Meta */}
            <div className="p-2 text-xs text-muted-foreground border-b bg-muted/5">
              {result.affected_rows > 0
                ? `Affected rows: ${result.affected_rows}`
                : `Rows: ${result.rows.length}`
              }
            </div>

            {result.columns.length > 0 ? (
              <table className="w-full text-sm text-left border-collapse">
                <thead className="text-xs text-muted-foreground bg-muted/30 font-medium uppercase sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 border-b w-12 text-center">#</th>
                    {result.columns.map((col) => (
                      <th key={col.name} className="px-4 py-2 border-b whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{col.name}</span>
                          <span className="text-[10px] font-normal opacity-70 lowercase">{col.type_name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/10">
                      <td className="px-4 py-2 border-b text-center text-muted-foreground text-xs">{i + 1}</td>
                      {result.columns.map((col) => (
                        <td key={col.name} className="px-4 py-2 border-b font-mono whitespace-nowrap max-w-xs truncate" title={String(row[col.name])}>
                          {row[col.name] === null ? <span className="text-muted-foreground/50 italic">NULL</span> : String(row[col.name])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              !error && !loading && result.affected_rows === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No results
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
