import { Search, RefreshCw, Copy, Trash2, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addCommandToConsole } from "@/components/ui/CommandConsole";
import { useAppStore } from "@/store/useAppStore";
import { TextFormatterWrapper } from "@/components/common/TextFormatterWrapper";

export function MemcachedWorkspace({ tabId, name, connectionId, savedResult }: { tabId: string; name: string; connectionId: number; savedResult?: any }) {
    const [searchKey, setSearchKey] = useState(savedResult?.searchKey || "");
    const [loading, setLoading] = useState(false);
    const [selectedValue, setSelectedValue] = useState<string | null>(savedResult?.selectedValue || null);
    const [history, setHistory] = useState<string[]>([]);

    const updateTab = useAppStore(state => state.updateTab);

    // Sync state to global store
    useEffect(() => {
        const timer = setTimeout(() => {
            updateTab(tabId, {
                savedResult: {
                    searchKey,
                    selectedValue
                }
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [searchKey, selectedValue, tabId, updateTab]);

    // Load history from localStorage on mount
    useEffect(() => {
        const savedHistory = localStorage.getItem(`memcached_history_${connectionId}`);
        if (savedHistory) {
            try {
                setHistory(JSON.parse(savedHistory));
            } catch (e) {
                console.error("Failed to parse history", e);
            }
        }
    }, [connectionId]);

    const addToHistory = (key: string) => {
        if (!key.trim()) return;

        setHistory(prev => {
            const newHistory = [key, ...prev.filter(k => k !== key)].slice(0, 10);
            localStorage.setItem(`memcached_history_${connectionId}`, JSON.stringify(newHistory));
            return newHistory;
        });
    };

    const handleSearch = async (keyToSearch: string = searchKey) => {
        if (!keyToSearch.trim()) return;

        setSearchKey(keyToSearch);
        setLoading(true);
        setSelectedValue(null);

        addToHistory(keyToSearch);

        const startTime = Date.now();

        try {
            const val = await invoke<string>("get_memcached_value", {
                connectionId,
                key: keyToSearch,
            });
            setSelectedValue(val);

            addCommandToConsole({
                databaseType: 'memcached',
                command: `get ${keyToSearch}`,
                duration: Date.now() - startTime,
                success: true
            });
        } catch (error) {
            console.error("Failed to fetch value", error);
            setSelectedValue("Error fetching value: " + error);

            addCommandToConsole({
                databaseType: 'memcached',
                command: `get ${keyToSearch}`,
                duration: Date.now() - startTime,
                success: false,
                error: String(error)
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!searchKey) return;
        if (!confirm(`Are you sure you want to delete key "${searchKey}"?`)) return;

        const startTime = Date.now();

        try {
            await invoke("delete_memcached_key", {
                connectionId,
                key: searchKey
            });
            setSelectedValue("(deleted)");

            addCommandToConsole({
                databaseType: 'memcached',
                command: `delete ${searchKey}`,
                duration: Date.now() - startTime,
                success: true
            });
        } catch (error) {
            console.error("Failed to delete key", error);
            alert("Failed to delete key: " + error);

            addCommandToConsole({
                databaseType: 'memcached',
                command: `delete ${searchKey}`,
                duration: Date.now() - startTime,
                success: false,
                error: String(error)
            });
        }
    };

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="border-b p-2 flex justify-between items-center bg-muted/5 shrink-0 h-12">
                <div className="flex items-center gap-4 px-2">
                    <h2 className="font-semibold text-sm">{name}</h2>
                    <Badge
                        variant="outline"
                        className="text-xs font-normal bg-orange-50 text-orange-700 border-orange-200"
                    >
                        Memcached
                    </Badge>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-8 max-w-4xl mx-auto flex flex-col gap-8">

                    {/* Search Section */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-lg font-semibold">Search Key</label>
                            <div className="flex gap-2">
                                <Input
                                    value={searchKey}
                                    onChange={(e) => setSearchKey(e.target.value)}
                                    placeholder="Enter key..."
                                    className="flex-1"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleSearch();
                                        }
                                    }}
                                />
                                <Button onClick={() => handleSearch()} disabled={loading || !searchKey.trim()}>
                                    {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                                    Search
                                </Button>
                            </div>
                        </div>

                        {/* History Section */}
                        {history.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <label className="text-sm text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Recent Queries
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {history.map((k) => (
                                        <Badge
                                            key={k}
                                            variant="secondary"
                                            className="cursor-pointer hover:bg-primary/10 transition-colors font-mono"
                                            onClick={() => handleSearch(k)}
                                        >
                                            {k}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Result Section */}
                    {selectedValue !== null && (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between py-4">
                                <CardTitle className="text-base font-mono">{searchKey}</CardTitle>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                            if (selectedValue) {
                                                navigator.clipboard.writeText(selectedValue);
                                            }
                                        }}
                                        title="Copy Value"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={handleDelete}
                                        title="Delete Key"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <TextFormatterWrapper
                                    content={selectedValue}
                                    readonly
                                    title="Format value"
                                >
                                    <div className="bg-muted/30 rounded-md p-4 border overflow-x-auto cursor-context-menu">
                                        <pre className="font-mono text-sm whitespace-pre-wrap break-all pr-12">
                                            {selectedValue}
                                        </pre>
                                    </div>
                                </TextFormatterWrapper>
                            </CardContent>
                        </Card>
                    )}

                    {!selectedValue && !loading && (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-50">
                            <Search className="w-12 h-12 mb-4" />
                            <p>Enter a key to search for its value</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
