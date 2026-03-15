import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import Editor from "@monaco-editor/react";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Copy, Save, AlertCircle } from "lucide-react";
import {
    detectFormats,
    applyFormat,
    getFormatLabel,
    type FormatType,
    type FormatResult,
} from "@/lib/formatters";

interface TextFormatterDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    content: string;
    onSave?: (newContent: string) => void;
    title?: string;
    readonly?: boolean;
    originalContent?: string;
    initialFormat?: FormatType;
}

export function TextFormatterDialog({
    open,
    onOpenChange,
    content,
    onSave,
    title = "Text Formatter",
    readonly = false,
    originalContent,
    initialFormat = "raw",
}: TextFormatterDialogProps) {
    const { t } = useTranslation();
    const isDark = useIsDarkTheme();
    const [selectedFormat, setSelectedFormat] = useState<FormatType>(initialFormat);
    const [availableFormats, setAvailableFormats] = useState<FormatType[]>([]);
    const [formatResult, setFormatResult] = useState<FormatResult>({
        success: true,
        content: content,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    // The source of truth for formatting transformations
    // If originalContent is provided, we always start from there.
    // Otherwise we use the content passed in.
    const sourceContent = originalContent !== undefined ? originalContent : content;

    // Detect available formats when content changes or dialog opens
    useEffect(() => {
        if (open) {
            const formats = detectFormats(sourceContent);
            setAvailableFormats(formats);

            // Sync selection with prop when reopening
            setSelectedFormat(initialFormat);
        }
    }, [sourceContent, open, initialFormat]);

    // Apply formatting when format changes
    useEffect(() => {
        if (open) {
            const result = applyFormat(sourceContent, selectedFormat);
            setFormatResult(result);
        }
    }, [selectedFormat, sourceContent, open]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(formatResult.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error("Failed to copy:", error);
        }
    };

    const handleSave = async () => {
        if (!onSave) return;

        setIsSaving(true);
        try {
            await onSave(formatResult.content);
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{title || t('common.textFormatter')}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col gap-4 min-h-0">
                    {/* Format Selector */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium whitespace-nowrap">
                            {t('common.format')}:
                        </label>
                        <Select value={selectedFormat} onValueChange={(v) => setSelectedFormat(v as FormatType)}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {availableFormats.map((format) => (
                                    <SelectItem key={format} value={format}>
                                        {format === 'raw' ? t('common.originalData') : getFormatLabel(format)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="flex-1" />

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopy}
                            className="gap-2"
                        >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied ? t('common.copied') : t('common.copy')}
                        </Button>
                    </div>

                    {/* Error Alert */}
                    {!formatResult.success && formatResult.error && (
                        <div className="flex items-center gap-2 p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                            <AlertCircle className="h-4 w-4" />
                            <p>{formatResult.error}</p>
                        </div>
                    )}

                    {/* Content Display */}
                    <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                        <Editor
                            height="100%"
                            language={
                                selectedFormat === "json" || selectedFormat === "json-minified" ? "json" :
                                selectedFormat === "xml" ? "xml" : "plaintext"
                            }
                            theme={isDark ? "vs-dark" : "light"}
                            value={formatResult.content}
                            options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                wordWrap: "on",
                                scrollBeyondLastLine: false,
                                fontSize: 14,
                                formatOnPaste: false,
                                contextmenu: false,
                            }}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {readonly || !onSave ? t('common.close') : t('common.cancel')}
                    </Button>
                    {!readonly && onSave && (
                        <Button onClick={handleSave} disabled={isSaving}>
                            <Save className="h-4 w-4 mr-2" />
                            {isSaving ? t('redis.saving') : t('common.save')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Import Check icon
import { Check } from "lucide-react";
