import { Loader2 } from "lucide-react";
import type { RefObject } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ResizablePanel } from "@/components/ui/resizable.tsx";
import { transparentTheme } from "@/lib/utils.ts";

interface MysqlDdlPanelProps {
    ddl: string;
    isDark: boolean;
    isLoading: boolean;
    panelRef: RefObject<any>;
}

export function MysqlDdlPanel({ ddl, isDark, isLoading, panelRef }: MysqlDdlPanelProps) {
    return (
        <ResizablePanel ref={panelRef} defaultSize={20} minSize={10} maxSize={80}>
            <div className="h-full flex flex-col bg-background border-t">
                <div className="flex-1 overflow-auto bg-background">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Loading...
                        </div>
                    ) : (
                        <SyntaxHighlighter
                            language="sql"
                            style={transparentTheme(isDark ? vscDarkPlus : vs)}
                            customStyle={{
                                margin: 0,
                                height: "100%",
                                borderRadius: 0,
                                fontSize: "14px",
                                backgroundColor: "transparent",
                            }}
                            wrapLongLines
                        >
                            {ddl}
                        </SyntaxHighlighter>
                    )}
                </div>
            </div>
        </ResizablePanel>
    );
}
