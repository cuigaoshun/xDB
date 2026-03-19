import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import Editor from "@monaco-editor/react";
import type { SchemaColumnMeta } from "@/types/sql";
import { useAppStore } from "@/store/useAppStore.ts";

interface SqlQueryEditorProps {
    connectionId: number;
    dbName?: string;
    defaultValue: string;
    isDark: boolean;
    schemaColumnsRef: MutableRefObject<SchemaColumnMeta[]>;
    onEditorMount: (editor: any) => void;
    onSqlChange: (sql: string) => void;
    onExecute?: () => void;
}

export function SqlQueryEditor({
    connectionId,
    dbName,
    defaultValue,
    isDark,
    schemaColumnsRef,
    onEditorMount,
    onSqlChange,
    onExecute,
}: SqlQueryEditorProps) {
    const completionDisposableRef = useRef<any>(null);
    const editorRef = useRef<any>(null);
    const onExecuteRef = useRef(onExecute);

    useEffect(() => {
        onExecuteRef.current = onExecute;
    }, [onExecute]);

    useEffect(() => {
        return () => {
            if (completionDisposableRef.current) {
                completionDisposableRef.current.dispose();
                completionDisposableRef.current = null;
            }
        };
    }, []);

    return (
        <div className="h-1/3 py-1 bg-background border-b z-10 relative">
            <Editor
                height="100%"
                language="mysql"
                theme={isDark ? "vs-dark" : "light"}
                defaultValue={defaultValue}
                onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    onEditorMount(editor);

                    editor.onDidChangeModelContent(() => {
                        onSqlChange(editor.getValue());
                    });

                    // Add command for Cmd+Enter (Mac) and Ctrl+Enter (Win/Linux)
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                        if (onExecuteRef.current) {
                            onExecuteRef.current();
                        }
                    });

                    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider("mysql", {
                        provideCompletionItems: (model: any, position: any) => {
                            if (editorRef.current && model !== editorRef.current.getModel()) {
                                return { suggestions: [] };
                            }

                            const word = model.getWordUntilPosition(position);
                            const range = {
                                startLineNumber: position.lineNumber,
                                endLineNumber: position.lineNumber,
                                startColumn: word.startColumn,
                                endColumn: word.endColumn,
                            };

                            const suggestions: any[] = [];
                            const keywords = [
                                "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "IS", "NULL",
                                "LIKE", "BETWEEN", "EXISTS", "CASE", "WHEN", "THEN", "ELSE", "END",
                                "AS", "ON", "JOIN", "INNER", "LEFT", "RIGHT", "OUTER", "CROSS",
                                "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
                                "CREATE", "ALTER", "DROP", "TABLE", "DATABASE", "INDEX", "VIEW",
                                "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
                                "ASC", "DESC", "DISTINCT", "ALL", "UNION", "EXCEPT", "INTERSECT",
                                "COUNT", "SUM", "AVG", "MIN", "MAX", "IF", "IFNULL", "COALESCE",
                                "CONCAT", "SUBSTRING", "LENGTH", "TRIM", "UPPER", "LOWER",
                                "NOW", "DATE", "TIME", "YEAR", "MONTH", "DAY",
                                "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "CONSTRAINT",
                                "AUTO_INCREMENT", "DEFAULT", "NOT NULL", "UNIQUE", "CHECK",
                                "VARCHAR", "INT", "BIGINT", "TINYINT", "SMALLINT", "MEDIUMINT",
                                "FLOAT", "DOUBLE", "DECIMAL", "CHAR", "TEXT", "BLOB",
                                "DATE", "DATETIME", "TIMESTAMP", "BOOLEAN", "ENUM", "JSON",
                                "SHOW", "DESCRIBE", "EXPLAIN", "USE", "TRUNCATE",
                                "BEGIN", "COMMIT", "ROLLBACK", "TRANSACTION",
                                "GRANT", "REVOKE", "FLUSH", "REPLACE",
                            ];

                            keywords.forEach((keyword) => {
                                suggestions.push({
                                    label: keyword,
                                    kind: monaco.languages.CompletionItemKind.Keyword,
                                    insertText: keyword,
                                    range,
                                });
                            });

                            schemaColumnsRef.current.forEach((column) => {
                                suggestions.push({
                                    label: column.name,
                                    kind: monaco.languages.CompletionItemKind.Field,
                                    insertText: column.name,
                                    detail: column.comment || undefined,
                                    range,
                                });
                            });

                            if (dbName) {
                                const cachedTables = useAppStore.getState().getTablesCache(connectionId, dbName);
                                if (cachedTables) {
                                    cachedTables.forEach((table: { name: string }) => {
                                        suggestions.push({
                                            label: table.name,
                                            kind: monaco.languages.CompletionItemKind.Struct,
                                            insertText: table.name,
                                            range,
                                        });
                                    });
                                }
                            }

                            return { suggestions };
                        },
                    });
                }}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: "on",
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    contextmenu: false,
                }}
            />
        </div>
    );
}
