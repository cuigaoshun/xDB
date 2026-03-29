import { useState, useRef } from "react";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubTrigger,
    ContextMenuSubContent,
    ContextMenuLabel,
} from "@/components/ui/context-menu";
import { Wand2, Pencil, Trash2 } from "lucide-react";
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
    onDelete?: () => void;
    deleteConfirmPrompt?: React.ReactNode;
    deleteItemName?: React.ReactNode;
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
    onDelete,
    deleteConfirmPrompt,
    deleteItemName,
    originalContent,
    initialFormat,
}: TextFormatterWrapperProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const isHandlingRef = useRef(false);

    const safeInvoke = (action?: () => void) => {
        if (!action || isHandlingRef.current) return;
        isHandlingRef.current = true;
        action();
        setTimeout(() => {
            isHandlingRef.current = false;
        }, 500);
    };

    if (!content) return <>{children}</>;

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    {children}
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                    {onEdit && (
                        <ContextMenuItem onSelect={() => safeInvoke(onEdit)} className="gap-2 cursor-pointer">
                            <Pencil className="h-4 w-4" />
                            <span>{t('common.edit', 'Edit')}</span>
                        </ContextMenuItem>
                    )}
                    {onDelete && (
                        <ContextMenuSub>
                            <ContextMenuSubTrigger className="gap-2 cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive data-[state=open]:bg-destructive/10 data-[state=open]:text-destructive">
                                <Trash2 className="h-4 w-4" />
                                <span>{t('common.delete', 'Delete')}</span>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-56">
                                <ContextMenuLabel>{t('common.confirmDeletion', 'Confirm Deletion')}</ContextMenuLabel>
                                {deleteConfirmPrompt && (
                                    <div className="px-2 pt-2 pb-0.5 text-xs text-muted-foreground">
                                        {deleteConfirmPrompt}
                                    </div>
                                )}
                                {deleteItemName && (
                                    <div className="px-2 pb-2 text-xs font-mono font-medium break-all">
                                        {deleteItemName}
                                    </div>
                                )}
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                    onSelect={(e) => {
                                        // Prevents React synthetic event bubbling just in case
                                        e.stopPropagation();
                                        safeInvoke(onDelete);
                                    }}
                                    className="gap-2 cursor-pointer text-destructive focus:bg-destructive focus:text-destructive-foreground"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>{t('common.delete', 'Delete')}</span>
                                </ContextMenuItem>
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                    )}
                    {(onEdit || onDelete) && <ContextMenuSeparator />}
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

