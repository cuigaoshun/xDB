import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";

interface SqlPaginationBarProps {
    currentPage: number;
    pageSize: number;
    pageSizeInput: string;
    totalRows: number;
    filteredRows: number;
    affectedRows: number;
    hasActiveInlineFilters: boolean;
    isEditable: boolean;
    editDisabledReason: string;
    onPageChange: (nextPage: number) => void;
    onPageSizeInputChange: (value: string) => void;
    onExportData?: (format: 'csv' | 'excel' | 'json') => void;
}

export function SqlPaginationBar({
    currentPage,
    pageSize,
    pageSizeInput,
    totalRows,
    filteredRows,
    affectedRows,
    hasActiveInlineFilters,
    isEditable,
    editDisabledReason,
    onPageChange,
    onPageSizeInputChange,
    onExportData,
}: SqlPaginationBarProps) {
    const { t } = useTranslation();

    return (
        <div className="mt-1 pl-2 shrink-0 flex items-center gap-3 text-xs text-muted-foreground">
            {hasActiveInlineFilters ? (
                <span>{filteredRows} / {totalRows} {t("common.rowsReturned", "rows returned")}</span>
            ) : (
                <span>{totalRows} {t("common.rowsReturned", "rows returned")}</span>
            )}
            {affectedRows > 0 && <span>| {t("common.affectedRows", "Affected Rows")}: {affectedRows}</span>}
            {!isEditable && editDisabledReason && (
                <span className="text-yellow-600 dark:text-yellow-400">
                    ⚠️ {editDisabledReason}
                </span>
            )}
            <div className="h-4 w-[1px] bg-border"></div>
            <Button
                size="sm"
                variant="outline"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 0}
                className="h-6 text-xs"
            >
                <ChevronLeft className="h-3 w-3" />
            </Button>
            <span>{t("common.page", "页")} {currentPage + 1}</span>
            <Button
                size="sm"
                variant="outline"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={totalRows < pageSize}
                className="h-6 text-xs"
            >
                <ChevronRight className="h-3 w-3" />
            </Button>
            <div className="h-4 w-[1px] bg-border"></div>
            <span>Limit:</span>
            <Input
                type="number"
                value={pageSizeInput}
                onChange={(event) => onPageSizeInputChange(event.target.value)}
                min="1"
                className="w-20 h-6 text-xs"
            />
            
            <div className="h-4 w-[1px] bg-border"></div>
            
            {onExportData && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 p-0"
                            title={t("common.exportData", "Export Data")}
                        >
                            <Upload className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onExportData('csv')}>
                            {t("common.exportCSV", "Export CSV")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onExportData('excel')}>
                            {t("common.exportExcel", "Export Excel")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onExportData('json')}>
                            {t("common.exportJSON", "Export JSON")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
}
