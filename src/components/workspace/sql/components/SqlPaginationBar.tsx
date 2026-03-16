import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

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
}: SqlPaginationBarProps) {
    const { t } = useTranslation();

    return (
        <div className="mt-1 shrink-0 flex items-center gap-3 text-xs text-muted-foreground">
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
        </div>
    );
}
