import { useState } from "react";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Wand2 } from "lucide-react";
import { TextFormatterDialog } from "./TextFormatterDialog";

interface TextFormatterWrapperProps {
    children: React.ReactNode;
    content: string;
    onSave?: (newContent: string) => void;
    title?: string;
    readonly?: boolean;
}

export function TextFormatterWrapper({
    children,
    content,
    onSave,
    title = "Format text",
    readonly = false,
}: TextFormatterWrapperProps) {
    const [open, setOpen] = useState(false);

    if (!content) return <>{children}</>;

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    {children}
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                    <ContextMenuItem onClick={() => setOpen(true)} className="gap-2 cursor-pointer">
                        <Wand2 className="h-4 w-4" />
                        <span>Format/View Text</span>
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
            />
        </>
    );
}
