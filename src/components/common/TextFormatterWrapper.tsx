import { useState } from "react";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Wand2, Pencil } from "lucide-react";
import { TextFormatterDialog } from "./TextFormatterDialog";
import { useTranslation } from "react-i18next";

import {
    type FormatType,
} from "@/lib/formatters";

interface TextFormatterWrapperProps {
    children: React.ReactNode;
    content: string;
    onSave?: (newContent: string) => void;
    title?: string;
    readonly?: boolean;
    onEdit?: () => void;
    originalContent?: string;
    initialFormat?: FormatType;
}

export function TextFormatterWrapper({
    children,
    content,
    onSave,
    title = "Format text",
    readonly = false,
    onEdit,
    originalContent,
    initialFormat,
}: TextFormatterWrapperProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    if (!content) return <>{children}</>;

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    {children}
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                    {onEdit && (
                        <>
                            <ContextMenuItem onClick={onEdit} className="gap-2 cursor-pointer">
                                <Pencil className="h-4 w-4" />
                                <span>{t('common.edit', 'Edit')}</span>
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                        </>
                    )}
                    <ContextMenuItem onClick={() => setOpen(true)} className="gap-2 cursor-pointer">
                        <Wand2 className="h-4 w-4" />
                        <span>{t('common.viewFormatted', 'Format/View Text')}</span>
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            <TextFormatterDialog
                open={open}
                onOpenChange={setOpen}
                content={content}
                onSave={onSave}
                readonly={readonly}
                title={title}
                originalContent={originalContent}
                initialFormat={initialFormat}
            />
        </>
    );
}

