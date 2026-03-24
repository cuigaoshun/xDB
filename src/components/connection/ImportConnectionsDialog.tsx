import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore, Connection, ConnectionGroup } from "@/store/useAppStore";
import { decryptData, EncryptedData } from "@/lib/crypto";
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { createConnection, updateConnection, createConnectionGroup, getAllConnectionGroups } from "@/lib/connectionDB";
import { Loader2, FileJson, AlertTriangle } from "lucide-react";

interface ImportConnectionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImportSuccess: () => void;
}

type ImportAction = 'skip' | 'overwrite' | 'rename' | 'create';

interface ImportItem {
    original: Partial<Connection>;
    status: 'new' | 'duplicate';
    action: ImportAction;
    targetId?: number; // If overwriting
    newName?: string; // If renaming
}

export function ImportConnectionsDialog({ open, onOpenChange, onImportSuccess }: ImportConnectionsDialogProps) {
    const { t } = useTranslation();
    const existingConnections = useAppStore((state) => state.connections);

    const [step, setStep] = useState<'select' | 'decrypt' | 'preview' | 'importing'>('select');
    const [password, setPassword] = useState("");
    const [encryptedContent, setEncryptedContent] = useState<EncryptedData | null>(null);
    const [importItems, setImportItems] = useState<ImportItem[]>([]);
    const [importGroups, setImportGroups] = useState<Partial<ConnectionGroup>[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>("");

    const reset = () => {
        setStep('select');
        setPassword("");
        setEncryptedContent(null);
        setImportItems([]);
        setImportGroups([]);
        setError(null);
        setFileName("");
    };

    const handleFileSelect = async () => {
        try {
            const selected = await openDialog({
                filters: [{
                    name: t('settings.connectionFileName'),
                    extensions: ['xdb', 'json']
                }],
                multiple: false
            });

            if (selected) {
                const path = selected as string; // Single selection returns string
                // Extract filename for display
                const name = path.split(/[\\/]/).pop() || path;
                setFileName(name);

                const content = await readTextFile(path);

                try {
                    const json = JSON.parse(content);
                    // Check for required fields in the encrypted format
                    // Based on EncryptedData interface in crypto.ts: { salt, iv, data, version }
                    if (json.data && json.iv && json.salt) {
                        setEncryptedContent(json);
                        setStep('decrypt');
                        // Reset password field
                        setPassword("");
                        setError(null);
                    } else {
                        // Not encrypted or old format? Assume not encrypted for now if structure matches
                        // But our format requires encryption wrapper.
                        console.error("Missing required fields (data, iv, salt)", json);
                        setError(t('settings.invalidFile'));
                    }
                } catch (e) {
                    console.error("JSON parse error", e);
                    setError(t('settings.invalidFile'));
                }
            }
        } catch (err) {
            console.error(err);
            setError(t('common.failedToReadFile'));
        }
    };

    const handleDecrypt = async () => {
        if (!encryptedContent) return;

        try {
            const decryptedJson = await decryptData(encryptedContent, password);
            const data = JSON.parse(decryptedJson);

            if (!data.connections || !Array.isArray(data.connections)) {
                throw new Error("Invalid data format");
            }

            const groups = data.groups || [];
            processImportData(data.connections, groups);
        } catch (err) {
            console.error(err);
            setError(t('settings.decryptFailed'));
        }
    };

    const processImportData = (connections: Partial<Connection>[], groups: Partial<ConnectionGroup>[]) => {
        const items: ImportItem[] = connections.map(conn => {
            const existing = existingConnections.find(c => c.name === conn.name);
            if (existing) {
                return {
                    original: conn,
                    status: 'duplicate',
                    action: 'skip',
                    targetId: existing.id
                };
            } else {
                return {
                    original: conn,
                    status: 'new',
                    action: 'create'
                };
            }
        });

        setImportItems(items);
        setImportGroups(groups);
        setStep('preview');
        setError(null);
    };

    const handleActionChange = (index: number, action: ImportAction) => {
        const newItems = [...importItems];
        newItems[index].action = action;

        if (action === 'rename') {
            // Auto generate a new name: "Name (Imported)" or "Name (1)"
            let baseName = newItems[index].original.name || t('settings.untitled');
            let newName = `${baseName} (${t('settings.imported')})`;
            let counter = 1;
            while (existingConnections.some(c => c.name === newName) || newItems.some((item, i) => i !== index && item.newName === newName)) {
                newName = `${baseName} (${counter++})`;
            }
            newItems[index].newName = newName;
        } else {
            newItems[index].newName = undefined;
        }

        setImportItems(newItems);
    };

    const handleImport = async () => {
        setStep('importing');
        try {
            const groupNameToIdMap = new Map<string, number>();
            
            const existingGroups = await getAllConnectionGroups();
            
            for (const group of importGroups) {
                if (!group.name) continue;
                
                const existing = existingGroups.find(g => g.name === group.name);
                if (existing) {
                    groupNameToIdMap.set(group.name, existing.id);
                } else {
                    await createConnectionGroup({
                        name: group.name,
                        description: group.description,
                        color: group.color || '#3b82f6',
                        sort_order: group.sort_order || 0
                    });
                    
                    const newGroups = await getAllConnectionGroups();
                    const newGroup = newGroups.find(g => g.name === group.name);
                    if (newGroup) {
                        groupNameToIdMap.set(group.name, newGroup.id);
                    }
                }
            }

            let successCount = 0;

            for (const item of importItems) {
                if (item.action === 'skip') continue;

                const connData = { ...item.original };

                // @ts-ignore
                delete connData.id;
                // @ts-ignore
                delete connData.created_at;

                // Map group_name to group_id
                // @ts-ignore
                if (connData.group_name) {
                    // @ts-ignore
                    const groupId = groupNameToIdMap.get(connData.group_name);
                    if (groupId) {
                        connData.group_id = groupId;
                    }
                    // @ts-ignore
                    delete connData.group_name;
                }

                if (item.action === 'rename' && item.newName) {
                    connData.name = item.newName;
                    await createConnection(connData as any);
                } else if (item.action === 'overwrite' && item.targetId) {
                    await updateConnection({ ...connData, id: item.targetId } as any);
                } else if (item.action === 'create') {
                    await createConnection(connData as any);
                }
                successCount++;
            }

            onImportSuccess();
            onOpenChange(false);
            reset();
        } catch (err) {
            console.error(err);
            setError(t('settings.importFailed'));
            setStep('preview');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => {
            if (!v) reset();
            onOpenChange(v);
        }}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{t('settings.importConnections')}</DialogTitle>
                    <DialogDescription>
                        {step === 'select' && t('settings.selectFile')}
                        {step === 'decrypt' && t('settings.encryptionKey')}
                        {step === 'preview' && t('settings.preview')}
                        {step === 'importing' && t('common.loading')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 -mx-6">
                    {error && (
                        <div className="mx-6 p-3 bg-destructive/10 text-destructive rounded-md flex items-center gap-2 text-sm">
                            <AlertTriangle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    {step === 'select' && (
                        <div className="mx-6 flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleFileSelect}>
                            <FileJson className="h-10 w-10 text-muted-foreground mb-4" />
                            <p className="text-sm text-muted-foreground">{t('settings.selectFile')}</p>
                            <Button variant="secondary" className="mt-4" onClick={(e) => { e.stopPropagation(); handleFileSelect(); }}>
                                {t('common.browse')}
                            </Button>
                        </div>
                    )}

                    {step === 'decrypt' && (
                        <div className="mx-6 space-y-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                                <FileJson className="h-4 w-4" />
                                {fileName}
                            </div>
                            <div className="space-y-2">
                                <Label>{t('settings.encryptionKey')}</Label>
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder={t('settings.encryptionKeyPlaceholder')}
                                    onKeyDown={e => e.key === 'Enter' && handleDecrypt()}
                                />
                            </div>
                        </div>
                    )}

                    {step === 'preview' && (
                        <ScrollArea className="h-[300px] border rounded-md">
                            <div className="space-y-1 p-4">
                                {(() => {
                                    // Build tree structure: group connections by group_name
                                    type TreeNode = 
                                        | { type: 'group'; group: Partial<ConnectionGroup>; items: ImportItem[] }
                                        | { type: 'connection'; item: ImportItem; index: number };
                                    
                                    const nodes: TreeNode[] = [];
                                    const ungroupedItems: { item: ImportItem; index: number }[] = [];
                                    
                                    // Separate grouped and ungrouped connections
                                    importItems.forEach((item, index) => {
                                        // @ts-ignore
                                        if (item.original.group_name) {
                                            // Will be processed later
                                        } else {
                                            ungroupedItems.push({ item, index });
                                        }
                                    });
                                    
                                    // Add group nodes
                                    importGroups.forEach(group => {
                                        const groupItems = importItems
                                            .map((item, index) => ({ item, index }))
                                            // @ts-ignore
                                            .filter(({ item }) => item.original.group_name === group.name);
                                        
                                        if (groupItems.length > 0) {
                                            nodes.push({
                                                type: 'group',
                                                group,
                                                items: groupItems.map(g => g.item)
                                            });
                                        }
                                    });
                                    
                                    // Add ungrouped connections as individual nodes
                                    ungroupedItems.forEach(({ item, index }) => {
                                        nodes.push({
                                            type: 'connection',
                                            item,
                                            index
                                        });
                                    });
                                    
                                    return nodes.flatMap((node) => {
                                        if (node.type === 'group') {
                                            const elements = [];
                                            
                                            // Group header
                                            elements.push(
                                                <div key={`group-${node.group.name}`} className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 rounded-md mb-1">
                                                    <div 
                                                        className="w-3 h-3 rounded-full" 
                                                        style={{ backgroundColor: node.group.color || '#3b82f6' }}
                                                    />
                                                    <span className="text-sm font-semibold">{node.group.name}</span>
                                                    <span className="text-xs text-muted-foreground">({node.items.length})</span>
                                                </div>
                                            );
                                            
                                            // Group connections
                                            node.items.forEach((item) => {
                                                const index = importItems.indexOf(item);
                                                elements.push(
                                                    <div key={index} className="flex items-center justify-between p-3 border rounded-md bg-card ml-4 mb-1">
                                                        <div className="flex flex-col gap-1 min-w-0 flex-1 mr-4">
                                                            <div className="font-medium truncate flex items-center gap-2">
                                                                {item.original.name}
                                                                {item.status === 'duplicate' && (
                                                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full dark:bg-yellow-900/30 dark:text-yellow-400">
                                                                        {t('settings.duplicateConnection')}
                                                                    </span>
                                                                )}
                                                                {item.status === 'new' && (
                                                                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full dark:bg-green-900/30 dark:text-green-400">
                                                                        {t('settings.new')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground truncate">
                                                                {item.original.db_type}://{item.original.host}
                                                            </div>
                                                            {item.action === 'rename' && (
                                                                <div className="text-xs text-blue-600 mt-1">
                                                                    {t('settings.renameTo')} {item.newName}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="w-[140px] shrink-0">
                                                            {item.status === 'duplicate' ? (
                                                                <Select
                                                                    value={item.action}
                                                                    onValueChange={(val) => handleActionChange(index, val as ImportAction)}
                                                                >
                                                                    <SelectTrigger className="h-8">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="skip">{t('settings.skip')}</SelectItem>
                                                                        <SelectItem value="overwrite">{t('settings.overwrite')}</SelectItem>
                                                                        <SelectItem value="rename">{t('settings.rename')}</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            ) : (
                                                                <div className="flex justify-end">
                                                                    <span className="text-xs text-muted-foreground px-2 py-1 bg-secondary rounded">
                                                                        {t('settings.import')}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            });
                                            
                                            return elements;
                                        } else {
                                            // Individual ungrouped connection
                                            const item = node.item;
                                            const index = node.index;
                                            
                                            return (
                                                <div key={index} className="flex items-center justify-between p-3 border rounded-md bg-card mb-1">
                                                    <div className="flex flex-col gap-1 min-w-0 flex-1 mr-4">
                                                        <div className="font-medium truncate flex items-center gap-2">
                                                            {item.original.name}
                                                            {item.status === 'duplicate' && (
                                                                <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full dark:bg-yellow-900/30 dark:text-yellow-400">
                                                                    {t('settings.duplicateConnection')}
                                                                </span>
                                                            )}
                                                            {item.status === 'new' && (
                                                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full dark:bg-green-900/30 dark:text-green-400">
                                                                    {t('settings.new')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {item.original.db_type}://{item.original.host}
                                                        </div>
                                                        {item.action === 'rename' && (
                                                            <div className="text-xs text-blue-600 mt-1">
                                                                {t('settings.renameTo')} {item.newName}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="w-[140px] shrink-0">
                                                        {item.status === 'duplicate' ? (
                                                            <Select
                                                                value={item.action}
                                                                onValueChange={(val) => handleActionChange(index, val as ImportAction)}
                                                            >
                                                                <SelectTrigger className="h-8">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="skip">{t('settings.skip')}</SelectItem>
                                                                    <SelectItem value="overwrite">{t('settings.overwrite')}</SelectItem>
                                                                    <SelectItem value="rename">{t('settings.rename')}</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            <div className="flex justify-end">
                                                                <span className="text-xs text-muted-foreground px-2 py-1 bg-secondary rounded">
                                                                    {t('settings.import')}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }
                                    });
                                })()}
                            </div>
                        </ScrollArea>
                    )}

                    {step === 'importing' && (
                        <div className="mx-6 flex flex-col items-center justify-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                            <p className="text-muted-foreground">{t('common.loading')}</p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {step !== 'importing' && (
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel')}
                        </Button>
                    )}

                    {step === 'decrypt' && (
                        <Button onClick={handleDecrypt}>
                            {t('common.confirm')}
                        </Button>
                    )}

                    {step === 'preview' && (
                        <Button onClick={handleImport} disabled={importItems.every(i => i.action === 'skip')}>
                            {t('settings.import')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
