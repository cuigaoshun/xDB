import { Search, RefreshCw, Copy, Trash2, Clock, Wand2, Plus, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input.tsx";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { useAppStore } from "@/store/useAppStore.ts";
import { toast, confirm } from "@/hooks/useToast.ts";
import { TextFormatterDialog } from "@/components/common/TextFormatterDialog.tsx";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { invokeSetMemcached, invokeGetMemcached, invokeDeleteMemcached } from "@/lib/api.ts";

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

    // Add Key Dialog State
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newKey, setNewKey] = useState("");
    const [newValue, setNewValue] = useState("");
    const [newTtl, setNewTtl] = useState("0");
    const [adding, setAdding] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingKey, setEditingKey] = useState("");
    const [editingValue, setEditingValue] = useState("");
    const [editingTtl, setEditingTtl] = useState("0");
    const [updating, setUpdating] = useState(false);

    const upsertResult = (key: string, value: string) => {
        setResults(prev => {
            const filtered = prev.filter(item => item.key !== key);
            return [{
                key,
                value,
                timestamp: Date.now()
            }, ...filtered].slice(0, 10);
        });
    };

    const resetAddForm = () => {
        setNewKey("");
        setNewValue("");
        setNewTtl("0");
    };

    const resetEditForm = () => {
        setEditingKey("");
        setEditingValue("");
        setEditingTtl("0");
    };

    const saveKey = async ({
        key,
        value,
        ttl,
    }: {
        key: string;
        value: string;
        ttl: string;
    }) => {
        await invokeSetMemcached({
            connectionId,
            key,
            value,
            ttl: parseInt(ttl, 10) || 0
        });

        upsertResult(key, value);
    };

    const handleSaveNewKey = async () => {
        if (!newKey.trim()) {
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: "Key is required"
            });
            return;
        }

        setAdding(true);

        try {
            await saveKey({
                key: newKey,
                value: newValue,
                ttl: newTtl
            });
            toast({ description: t('common.insertSuccess') });
            setIsAddOpen(false);
            resetAddForm();
        } catch (error) {
            console.error("Failed to set key", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: t('common.failedToCreate') + ": " + error
            });
        } finally {
            setAdding(false);
        }
    };

    const openEditDialog = (key: string, value: string) => {
        setEditingKey(key);
        setEditingValue(value);
        setEditingTtl("0");
        setIsEditOpen(true);
    };

    const handleUpdateKey = async () => {
        if (!editingKey.trim()) {
            return;
        }

        setUpdating(true);

        try {
            await saveKey({
                key: editingKey,
                value: editingValue,
                ttl: editingTtl
            });
            toast({ description: t('common.savedSuccess') });
            setIsEditOpen(false);
            resetEditForm();
        } catch (error) {
            console.error("Failed to update key", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: t('common.failedToUpdate') + ": " + error
            });
        } finally {
            setUpdating(false);
        }
    };

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

        try {
            const val = await invokeGetMemcached<string>({
                            connectionId,
                            key: keyToSearch,
                        });

            // Add new result to top, remove duplicate key if exists (optional), keep max 10
            upsertResult(keyToSearch, val);
        } catch (error) {
            console.error("Failed to fetch value", error);

            // Still add to list but with error message? Or show toast? 
            // Better to show in the list so user knows it failed.
            upsertResult(keyToSearch, t('common.errorFetching') + ": " + error);
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

        

        try {
            await invokeDeleteMemcached({
                            connectionId,
                            key: keyToDelete
                        });

            // Remove from list
            setResults(prev => prev.filter(item => item.key !== keyToDelete));

            toast({
                description: t('common.deleted')
            });
        } catch (error) {
            console.error("Failed to delete key", error);
            toast({
                variant: "destructive",
                title: t('common.error'),
                description: t('common.failedToDelete') + ": " + error
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
                <div className="flex gap-2 px-2">
                    <Button
                        variant="default"
                        size="sm"
                        className="h-8 gap-1 bg-green-600 hover:bg-green-500"
                        onClick={() => setIsAddOpen(true)}
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('common.add') || "Add"}</span>
                    </Button>
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
                                            onClick={() => openEditDialog(item.key, item.value)}
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            <span className="sr-only sm:not-sr-only sm:inline-block">{t('common.edit')}</span>
                                        </Button>

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
            {/* Add Key Dialog */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('memcached.addKey') || "Add Key"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="key" className="text-left">
                                Key
                            </Label>
                            <Input
                                id="key"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                placeholder="Enter key..."
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ttl" className="text-left">
                                TTL (Seconds, 0 for infinite)
                            </Label>
                            <Input
                                id="ttl"
                                type="number"
                                value={newTtl}
                                onChange={(e) => setNewTtl(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="value" className="text-left">
                                Value
                            </Label>
                            <Textarea
                                id="value"
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                placeholder="Enter value..."
                                className="font-mono h-32"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={handleSaveNewKey} disabled={adding}>
                            {adding && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                            {t('common.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog
                open={isEditOpen}
                onOpenChange={(open) => {
                    setIsEditOpen(open);
                    if (!open) {
                        resetEditForm();
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('common.edit')} {t('memcached.addKey') || "Key"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-key" className="text-left">
                                Key
                            </Label>
                            <Input
                                id="edit-key"
                                value={editingKey}
                                disabled
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-ttl" className="text-left">
                                TTL (Seconds, 0 for infinite)
                            </Label>
                            <Input
                                id="edit-ttl"
                                type="number"
                                value={editingTtl}
                                onChange={(e) => setEditingTtl(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-value" className="text-left">
                                Value
                            </Label>
                            <Textarea
                                id="edit-value"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                placeholder="Enter value..."
                                className="font-mono h-32"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={handleUpdateKey} disabled={updating}>
                            {updating && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                            {t('common.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
