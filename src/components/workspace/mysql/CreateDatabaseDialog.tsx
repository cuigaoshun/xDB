import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/useToast.ts";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { invokeSql } from "@/lib/api.ts";

interface CreateDatabaseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connectionId: number;
    onSuccess?: () => void;
}

const CHARSETS = ['utf8mb4', 'utf8', 'latin1', 'gbk', 'ascii'];
const COLLATIONS = {
    'utf8mb4': ['utf8mb4_general_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin'],
    'utf8': ['utf8_general_ci', 'utf8_unicode_ci', 'utf8_bin'],
    'latin1': ['latin1_swedish_ci', 'latin1_bin'],
    'gbk': ['gbk_chinese_ci', 'gbk_bin'],
    'ascii': ['ascii_general_ci', 'ascii_bin']
};

export function CreateDatabaseDialog({ open, onOpenChange, connectionId, onSuccess }: CreateDatabaseDialogProps) {
    const { t } = useTranslation();
    const [dbName, setDbName] = useState('');
    const [charset, setCharset] = useState('utf8mb4');
    const [collation, setCollation] = useState('utf8mb4_general_ci');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCharsetChange = (val: string) => {
        setCharset(val);
        // Reset collation when charset changes
        const availableCollations = COLLATIONS[val as keyof typeof COLLATIONS];
        if (availableCollations && availableCollations.length > 0) {
            setCollation(availableCollations[0]);
        } else {
            setCollation('');
        }
    };

    const handleCreate = async () => {
        if (!dbName.trim()) {
            setError(t('mysql.databaseName') + ' ' + t('common.name_required'));
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            let sql = `CREATE DATABASE \`${dbName}\``;
            if (charset) {
                sql += ` CHARACTER SET ${charset}`;
            }
            if (collation) {
                sql += ` COLLATE ${collation}`;
            }
            sql += ';';

            await invokeSql({ connectionId, sql });
            toast({
                title: t('common.success'),
                description: t('mysql.createDatabaseSuccess', { db: dbName }),
                variant: 'success'
            });

            onSuccess?.();
            onOpenChange(false);
            setDbName('');
        } catch (err: any) {
            console.error("Failed to create database:", err);
            setError(typeof err === 'string' ? err : JSON.stringify(err));
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{t('mysql.createDatabase')}</DialogTitle>
                    <DialogDescription>
                        {t('mysql.createDatabaseDescription', 'Create a new database with specified character set and collation')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="db-name" className="text-right">
                            {t('mysql.databaseName')} *
                        </Label>
                        <Input
                            id="db-name"
                            value={dbName}
                            onChange={(e) => setDbName(e.target.value)}
                            className="col-span-3"
                            placeholder="database_name"
                        />
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">{t('mysql.charset')}</Label>
                        <Select value={charset} onValueChange={handleCharsetChange}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CHARSETS.map(cs => (
                                    <SelectItem key={cs} value={cs}>{cs}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">{t('mysql.collation')}</Label>
                        <Select value={collation} onValueChange={setCollation}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {COLLATIONS[charset as keyof typeof COLLATIONS]?.map(cl => (
                                    <SelectItem key={cl} value={cl}>{cl}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleCreate} disabled={isCreating}>
                        {isCreating ? t('common.loading') : t('mysql.createDatabase')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
