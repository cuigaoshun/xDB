import { useTranslation } from "react-i18next";
import { AlignLeft, Check, Copy, Database, FileCode, Loader2, Play, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { Connection } from "@/store/useAppStore";

interface SqlWorkspaceToolbarProps {
    connection?: Connection;
    connectionName: string;
    dbName?: string;
    tableName?: string;
    isLoading: boolean;
    isEditable: boolean;
    editDisabledReason: string;
    selectedCount: number;
    newRowsCount: number;
    showDDL: boolean;
    showSchemaButton?: boolean;
    onExecute: () => void;
    onFormatSql: () => void;
    onAddRow: () => void;
    onCopyRows: () => void;
    onDeleteRows: () => void;
    onSubmitChanges: () => void;
    onCancelChanges: () => void;
    onOpenSchemaTab: () => void;
    onToggleDDL: () => void;
}

export function SqlWorkspaceToolbar({
    connection,
    connectionName,
    dbName,
    tableName,
    isLoading,
    isEditable,
    editDisabledReason,
    selectedCount,
    newRowsCount,
    showDDL,
    showSchemaButton = true,
    onExecute,
    onFormatSql,
    onAddRow,
    onCopyRows,
    onDeleteRows,
    onSubmitChanges,
    onCancelChanges,
    onOpenSchemaTab,
    onToggleDDL,
}: SqlWorkspaceToolbarProps) {
    const { t } = useTranslation();

    return (
        <div className="p-2 flex gap-2 items-center bg-muted/30 justify-between">
            <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/50 rounded">
                    <span className="text-sm font-semibold text-foreground whitespace-nowrap">{connectionName}</span>
                    {dbName && (
                        <>
                            <div className="h-3 w-[1px] bg-border mx-1"></div>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">{dbName}</span>
                        </>
                    )}
                    {tableName && (
                        <>
                            <div className="h-3 w-[1px] bg-border mx-1"></div>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">{tableName}</span>
                        </>
                    )}
                </div>

                <div className="h-4 w-[1px] bg-border mx-2"></div>

                <Button
                    size="sm"
                    onClick={onExecute}
                    disabled={isLoading}
                    className="bg-green-600 hover:bg-green-700 text-white gap-1"
                    title={t("common.run", "执行")}
                >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    {t("common.run", "执行")}
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={onFormatSql}
                    disabled={isLoading}
                    className="gap-1"
                    title={t("common.formatSql", "美化")}
                >
                    <AlignLeft className="h-3.5 w-3.5" />
                    {t("common.formatSql", "美化")}
                </Button>

                {tableName && (
                    <>
                        <div className="h-4 w-[1px] bg-border mx-2"></div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onAddRow}
                            disabled={!isEditable}
                            className="gap-1.5"
                            title={!isEditable ? editDisabledReason : t("common.add", "新增")}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {t("common.add", "新增")}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onCopyRows}
                            disabled={!isEditable || selectedCount === 0}
                            title={!isEditable ? editDisabledReason : `${t("common.duplicate", "复制")} ${selectedCount} ${t("common.items", "项")}`}
                            className="gap-1.5"
                        >
                            <Copy className="h-3.5 w-3.5" />
                            {t("common.duplicate", "复制")} {selectedCount > 0 && `(${selectedCount})`}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onDeleteRows}
                            disabled={!isEditable || selectedCount === 0}
                            className="gap-1.5 text-red-600 hover:text-red-700"
                            title={!isEditable ? editDisabledReason : `${t("common.delete", "删除")} ${selectedCount} ${t("common.items", "项")}`}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("common.delete", "删除")} {selectedCount > 0 && `(${selectedCount})`}
                        </Button>

                        {newRowsCount > 0 && (
                            <>
                                <div className="h-4 w-[1px] bg-border mx-2"></div>
                                <Button
                                    size="sm"
                                    onClick={onSubmitChanges}
                                    disabled={isLoading}
                                    className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                    {t("common.submitChanges", "提交修改")}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={onCancelChanges}
                                    disabled={isLoading}
                                    className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                    <X className="h-3.5 w-3.5" />
                                    {t("common.cancel", "取消")}
                                </Button>
                            </>
                        )}
                    </>
                )}
            </div>

            <div className="flex gap-2 items-center">
                {tableName && connection && (
                    <>
                        {showSchemaButton && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onOpenSchemaTab}
                                title={t("mysql.viewSchema")}
                            >
                                <Database className="h-4 w-4 mr-1" />
                                {t("mysql.structure", "Structure")}
                            </Button>
                        )}
                        <Button
                            variant={showDDL ? "secondary" : "ghost"}
                            size="sm"
                            onClick={onToggleDDL}
                            title="Show DDL"
                            className={cn(showDDL && "bg-muted")}
                        >
                            <FileCode className="h-4 w-4 mr-1" />
                            {t("mysql.viewDDL", "DDL")}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
