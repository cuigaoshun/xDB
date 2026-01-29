import { Search, RefreshCw, Copy, Trash2, Clock, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input.tsx";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { addCommandToConsole } from "@/components/ui/CommandConsole.tsx";
import { useAppStore } from "@/store/useAppStore.ts";
import { toast, confirm } from "@/hooks/use-toast.ts";
import { TextFormatterDialog } from "@/components/common/TextFormatterDialog.tsx";

export function MemcachedWorkspace({ tabId, name, connectionId, savedResult }: { tabId: string; name: string; connectionId: number; savedResult?: any }) {
    const { t } = useTranslation();
    const [searchKey, setSearchKey] = useState(""); // Input value
    const [loading, setLoading] = useState(false);

    // Store list of results instead of single value
    const [results, setResults] = useState<Array<{ key: string, value: string, timestamp: number }>>(
        savedResult?.results || []
    );

    // For the dialog
    const [showFormatDialog, setShowFormatDialog] = useState(false);
    const [dialogContent, setDialogContent] = useState("");

    const [history, setHistory] = useState<string[]>([]);
    const updateTab = useAppStore(state => state.updateTab);

    // Sync state to global store
    useEffect(() => {
        const timer = setTimeout(() => {
            updateTab(tabId, {
                savedResult: {
                    results // Save the list
                }
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [results, tabId, updateTab]);

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

        addToHistory(keyToSearch);

        const startTime = Date.now();

        try {
            const val = await invoke<string>("get_memcached_value", {
                connectionId,
                key: keyToSearch,
            });

            // Add new result to top, remove duplicate key if exists (optional), keep max 10
            setResults(prev => {
                const filtered = prev.filter(item => item.key !== keyToSearch);
                return [{
                    key: keyToSearch,
                    value: val,
                    timestamp: Date.now()
                }, ...filtered].slice(0, 10);
            });

            addCommandToConsole({
                databaseType: 'memcached',
                command: `get ${keyToSearch}`,
                duration: Date.now() - startTime,
                success: true
            });
        } catch (error) {
            console.error("Failed to fetch value", error);

            // Still add to list but with error message? Or show toast? 
            // Better to show in the list so user knows it failed.
            setResults(prev => {
                const filtered = prev.filter(item => item.key !== keyToSearch);
                return [{
                    key: keyToSearch,
                    value: t('common.errorFetching') + ": " + error,
                    timestamp: Date.now()
                }, ...filtered].slice(0, 10);
            });

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

    const handleDelete = async (keyToDelete: string) => {
        if (!keyToDelete) return;

        const confirmed = await confirm({
            title: t('common.confirmDeletion'),
            description: t('memcached.deleteConfirm', { key: keyToDelete }),
            variant: 'destructive'
        });

        if (!confirmed) return;

        const startTime = Date.now();

        try {
            await invoke("delete_memcached_key", {
                connectionId,
                key: keyToDelete
            });

            // Remove from list
            setResults(prev => prev.filter(item => item.key !== keyToDelete));

            toast({
                description: t('common.deleted')
            });

            addCommandToConsole({
                databaseType: 'memcached',
                command: `delete ${keyToDelete}`,
                duration: Date.now() - startTime,
                success: true
            });
        } catch (error) {
            console.error("Failed to delete key", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: t('common.failedToDelete') + ": " + error
            });

            addCommandToConsole({
                databaseType: 'memcached',
                command: `delete ${keyToDelete}`,
                duration: Date.now() - startTime,
                success: false,
                error: String(error)
            });
        }
    };

    const openFormatDialog = (content: string) => {
        setDialogContent(content);
        setShowFormatDialog(true);
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

            {/* Search & History Section */}
            <div className="p-4 border-b bg-muted/5 shrink-0 flex flex-col gap-4 shadow-sm z-10">
                <div className="flex gap-2">
                    <Input
                        value={searchKey}
                        onChange={(e) => setSearchKey(e.target.value)}
                        placeholder={t('memcached.enterKey')}
                        className="flex-1 max-w-2xl"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleSearch();
                            }
                        }}
                    />
                    <Button
                        onClick={() => handleSearch()}
                        disabled={loading || !searchKey.trim()}
                        className="bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
                    >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                        {t('common.searchPlaceholder').replace('...', '')}
                    </Button>
                </div>

                {history.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
                        <Clock className="w-3 h-3 text-muted-foreground mr-1" />
                        {history.map((k) => (
                            <Badge
                                key={k}
                                variant="secondary"
                                className="cursor-pointer hover:bg-primary/10 transition-colors font-mono font-normal text-xs"
                                onClick={() => handleSearch(k)}
                            >
                                {k}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            {/* Main Content Area - List of Cards */}
            <div className="flex-1 min-h-0 bg-muted/10 overflow-y-auto">
                {results.length > 0 ? (
                    <div className="p-4 flex flex-col gap-6 max-w-5xl mx-auto">
                        {results.map((item) => (
                            <div key={`${item.key}-${item.timestamp}`} className="flex flex-col bg-background border rounded-lg shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                                {/* Card Toolbar */}
                                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/5 shrink-0">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
                                            {new Date(item.timestamp).toLocaleTimeString()}
                                        </Badge>
                                        <code className="text-sm font-bold font-mono text-primary px-1 rounded select-text truncate max-w-[400px]" title={item.key}>
                                            {item.key}
                                        </code>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 gap-1.5"
                                            onClick={() => openFormatDialog(item.value)}
                                        >
                                            <Wand2 className="w-3.5 h-3.5" />
                                            <span className="sr-only sm:not-sr-only sm:inline-block">{t('common.viewFormatted')}</span>
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 gap-1.5"
                                            onClick={() => {
                                                navigator.clipboard.writeText(item.value);
                                                toast({ description: t('common.copied') });
                                            }}
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span className="sr-only sm:not-sr-only sm:inline-block">{t('common.copy')}</span>
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDelete(item.key)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span className="sr-only sm:not-sr-only sm:inline-block">{t('redis.deleteKey')}</span>
                                        </Button>
                                    </div>
                                </div>

                                {/* Card Content */}
                                <div className="h-64 relative group">
                                    <textarea
                                        className="w-full h-full p-4 font-mono text-sm bg-transparent border-0 resize-none focus:outline-none focus:ring-0"
                                        value={item.value}
                                        readOnly
                                        spellCheck={false}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    !loading && (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-30">
                            <Search className="w-16 h-16 mb-4 stroke-1" />
                            <p className="text-lg">{t('memcached.enterKeyToSearch')}</p>
                        </div>
                    )
                )}

                {/* Bottom Spacer */}
                <div className="h-12"></div>
            </div>

            {/* Dialog */}
            <TextFormatterDialog
                open={showFormatDialog}
                onOpenChange={setShowFormatDialog}
                content={dialogContent}
                readonly
                title={t('common.formatValue')}
            />
        </div>
    );
}
