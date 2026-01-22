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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/store/useAppStore";
import { encryptData } from "@/lib/crypto";
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

interface ExportConnectionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ExportConnectionsDialog({ open, onOpenChange }: ExportConnectionsDialogProps) {
    const { t } = useTranslation();
    const connections = useAppStore((state) => state.connections);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [includePasswords, setIncludePasswords] = useState(false);
    const [password, setPassword] = useState("");
    const [isExporting, setIsExporting] = useState(false);

    // Initialize selectedIds when dialog opens
    // Note: useEffect approach might be better if connections change, 
    // but for now we'll just handle selection logic in render/handlers
    
    const handleSelectAll = () => {
        if (selectedIds.length === connections.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(connections.map(c => c.id));
        }
    };

    const handleToggleSelect = (id: number) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(sid => sid !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleExport = async () => {
        if (selectedIds.length === 0) return;

        try {
            setIsExporting(true);
            
            const connectionsToExport = connections
                .filter(c => selectedIds.includes(c.id))
                .map(c => {
                    const exportConn = { ...c };
                    // If not including passwords, remove them
                    if (!includePasswords) {
                        delete exportConn.password;
                    }
                    // Clean up internal IDs if needed, but keeping them might help with diffing later?
                    // Usually exports shouldn't depend on local DB IDs. Let's remove ID.
                    // @ts-ignore
                    delete exportConn.id;
                    // @ts-ignore
                    delete exportConn.created_at;
                    return exportConn;
                });

            const dataToEncrypt = JSON.stringify({
                connections: connectionsToExport,
                exportedAt: new Date().toISOString(),
                passwordsIncluded: includePasswords
            });

            // Encrypt data (even if empty password)
            const encrypted = await encryptData(dataToEncrypt, password);
            
            const fileContent = JSON.stringify(encrypted, null, 2);

            // Save file dialog
            const filePath = await save({
                filters: [{
                    name: t('settings.connectionFileName'),
                    extensions: ['xdb']
                }],
                defaultPath: t('settings.defaultExportFileName'),
            });

            if (filePath) {
                await writeTextFile(filePath, fileContent);
                // alert(t('settings.exportSuccess'));
                onOpenChange(false);
            }

        } catch (error) {
            console.error("Export failed:", error);
            // alert("Export failed: " + error);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{t('settings.exportConnections')}</DialogTitle>
                    <DialogDescription>
                        {t('settings.selectConnectionsToExport')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4">
                    <div className="flex items-center justify-between px-1">
                        <Label className="text-sm text-muted-foreground">
                            {selectedIds.length} / {connections.length} {t('common.selected')}
                        </Label>
                        <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                            {selectedIds.length === connections.length ? t('settings.deselectAll') : t('settings.selectAll')}
                        </Button>
                    </div>

                    <ScrollArea className="h-[200px] border rounded-md p-2">
                        <div className="flex flex-col gap-2">
                            {connections.map((conn) => (
                                <div key={conn.id} className="flex items-center space-x-2 p-2 hover:bg-accent rounded-sm">
                                    <Checkbox 
                                        id={`conn-${conn.id}`} 
                                        checked={selectedIds.includes(conn.id)}
                                        onCheckedChange={() => handleToggleSelect(conn.id)}
                                    />
                                    <Label htmlFor={`conn-${conn.id}`} className="flex-1 cursor-pointer font-normal">
                                        {conn.name} <span className="text-xs text-muted-foreground ml-2">({conn.db_type})</span>
                                    </Label>
                                </div>
                            ))}
                            {connections.length === 0 && (
                                <div className="text-center text-muted-foreground py-8">
                                    {t('common.noConnectionsFound')}
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    <div className="space-y-4 pt-2">
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="include-passwords" 
                                checked={includePasswords}
                                onCheckedChange={(checked) => setIncludePasswords(!!checked)}
                            />
                            <Label htmlFor="include-passwords">{t('settings.includePasswords')}</Label>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="encryption-key">{t('settings.encryptionKey')}</Label>
                            <Input 
                                id="encryption-key" 
                                type="password" 
                                placeholder={t('settings.encryptionKeyPlaceholder')}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Button 
                        onClick={handleExport} 
                        disabled={selectedIds.length === 0 || isExporting}
                    >
                        {isExporting ? t('common.loading') : t('settings.export')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
