import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface RedisAddKeyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connectionId: number;
    db: number;
    onSuccess: () => void;
}

export function RedisAddKeyDialog({
    open,
    onOpenChange,
    connectionId,
    db,
    onSuccess,
}: RedisAddKeyDialogProps) {
    const { t } = useTranslation();
    const [keyType, setKeyType] = useState("string");
    const [keyName, setKeyName] = useState("");
    const [value, setValue] = useState("");
    // For specialized types
    const [hashField, setHashField] = useState("");
    const [zsetScore, setZsetScore] = useState("0");

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!keyName) {
            setError(t('redis.keyNameRequired'));
            return;
        }
        setError(null);
        setIsSubmitting(true);

        try {
            let command = "";
            let args: string[] = [];

            switch (keyType) {
                case "string":
                    command = "SET";
                    args = [keyName, value || ""];
                    break;
                case "list":
                    command = "RPUSH";
                    args = [keyName, value || "element"];
                    break;
                case "set":
                    command = "SADD";
                    args = [keyName, value || "member"];
                    break;
                case "zset":
                    command = "ZADD";
                    args = [keyName, zsetScore || "0", value || "member"];
                    break;
                case "hash":
                    command = "HSET";
                    args = [keyName, hashField || "field", value || "value"];
                    break;
            }

            await invoke("execute_redis_command", {
                connectionId,
                command,
                args,
                db,
            });

            onSuccess();
            onOpenChange(false);
            // Reset form
            setKeyName("");
            setValue("");
            setHashField("");
            setZsetScore("0");
            setKeyType("string");
        } catch (err: any) {
            console.error("Failed to create key", err);
            setError(t('redis.failedToCreate') + ": " + (typeof err === "string" ? err : err.message));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{t('redis.addNewKey')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="key-type" className="text-right">
                            {t('redis.type')}
                        </Label>
                        <Select value={keyType} onValueChange={setKeyType}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder={t('redis.selectType')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="string">String</SelectItem>
                                <SelectItem value="list">List</SelectItem>
                                <SelectItem value="set">Set</SelectItem>
                                <SelectItem value="zset">{t('redis.sortedSet')}</SelectItem>
                                <SelectItem value="hash">Hash</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="key-name" className="text-right">
                            {t('redis.key')}
                        </Label>
                        <Input
                            id="key-name"
                            value={keyName}
                            onChange={(e) => setKeyName(e.target.value)}
                            className="col-span-3"
                            placeholder={t('redis.enterKeyName')}
                        />
                    </div>

                    {/* Conditional Fields based on Type */}

                    {keyType === "hash" && (
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="hash-field" className="text-right">
                                {t('redis.field')}
                            </Label>
                            <Input
                                id="hash-field"
                                value={hashField}
                                onChange={(e) => setHashField(e.target.value)}
                                className="col-span-3"
                                placeholder={t('redis.enterField')}
                            />
                        </div>
                    )}

                    {keyType === "zset" && (
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="zset-score" className="text-right">
                                {t('redis.score')}
                            </Label>
                            <Input
                                id="zset-score"
                                type="number"
                                value={zsetScore}
                                onChange={(e) => setZsetScore(e.target.value)}
                                className="col-span-3"
                                placeholder={t('redis.enterScore')}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label htmlFor="value" className="text-right pt-2">
                            {keyType === "string" ? t('redis.value') :
                                keyType === "list" ? t('redis.element') :
                                    keyType === "set" ? t('redis.member') :
                                        keyType === "zset" ? t('redis.member') :
                                            t('redis.value')}
                        </Label>
                        <Textarea
                            id="value"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="col-span-3"
                            placeholder={keyType === "string" ? t('redis.enterValue') : t('redis.enterInitialMember')}
                        />
                    </div>

                    {error && (
                        <div className="text-sm text-destructive text-right">
                            {error}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('common.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
