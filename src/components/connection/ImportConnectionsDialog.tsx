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
import { useAppStore, Connection } from "@/store/useAppStore";
import { decryptData, EncryptedData } from "@/lib/crypto";
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from "@tauri-apps/api/core";
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
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>("");

    const reset = () => {
        setStep('select');
        setPassword("");
        setEncryptedContent(null);
        setImportItems([]);
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

            processImportData(data.connections);
        } catch (err) {
            console.error(err);
            setError(t('settings.decryptFailed'));
        }
    };

    const processImportData = (connections: Partial<Connection>[]) => {
        const items: ImportItem[] = connections.map(conn => {
            const existing = existingConnections.find(c => c.name === conn.name);
            if (existing) {
                return {
                    original: conn,
                    status: 'duplicate',
                    action: 'skip', // Default action for duplicate
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
            let successCount = 0;
            
            for (const item of importItems) {
                if (item.action === 'skip') continue;

                const connData = { ...item.original };
                
                // Remove ID if present, we want DB to generate it
                // @ts-ignore
                delete connData.id;
                // @ts-ignore
                delete connData.created_at;

                if (item.action === 'rename' && item.newName) {
                    connData.name = item.newName;
                    await invoke("create_connection", { args: connData });
                } else if (item.action === 'overwrite' && item.targetId) {
                    // Update existing
                    await invoke("update_connection", { 
                        args: { ...connData, id: item.targetId } 
                    });
                } else if (item.action === 'create') {
                    // Create new
                    await invoke("create_connection", { args: connData });
                }
                successCount++;
            }
            
            // alert(t('settings.importSuccess') + ` (${successCount})`);
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

                <div className="py-4">
                    {error && (
                        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md flex items-center gap-2 text-sm">
                            <AlertTriangle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    {step === 'select' && (
                        <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleFileSelect}>
                            <FileJson className="h-10 w-10 text-muted-foreground mb-4" />
                            <p className="text-sm text-muted-foreground">{t('settings.selectFile')}</p>
                            <Button variant="secondary" className="mt-4" onClick={(e) => { e.stopPropagation(); handleFileSelect(); }}>
                                {t('common.browse')}
                            </Button>
                        </div>
                    )}

                    {step === 'decrypt' && (
                        <div className="space-y-4">
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
                        <ScrollArea className="h-[300px] border rounded-md p-2">
                            <div className="space-y-2">
                                {importItems.map((item, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 border rounded-md bg-card">
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
                                ))}
                            </div>
                        </ScrollArea>
                    )}

                    {step === 'importing' && (
                        <div className="flex flex-col items-center justify-center py-10">
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
