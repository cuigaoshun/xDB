import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    Check,
    Copy,
    Eye,
    Filter,
    MousePointerClick,
    Pencil,
    Trash2,
    Wand2,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { cn } from "@/lib/utils.ts";
import type { EditingCell, FilteredRowEntry, SqlResult } from "@/types/sql";
import { getCellDisplayValue, getInitialColumnWidths } from "../utils/resultTable";

interface SqlResultTableProps {
    result: SqlResult;
    isEditable: boolean;
    newRows: Record<string, any>[];
    editingCell: EditingCell | null;
    editValue: string;
    filteredRowEntries: FilteredRowEntry[];
    hasActiveInlineFilters: boolean;
    inlineFilters: Record<string, string>;
    uniqueColumnValueMap: Record<string, string[]>;
    selectedRowIndices: number[];
    selectedRowIndexSet: Set<number>;
    onEditValueChange: (value: string) => void;
    onCellEdit: (rowIdx: number, colName: string, currentValue: any, isNewRow: boolean) => void;
    onCellSubmit: () => void;
    onCellCancel: () => void;
    onOpenExistingRow: (row: Record<string, any>, rowIdx: number) => void;
    onOpenNewRow: (row: Record<string, any>, rowIdx: number) => void;
    onDeleteNewRow: (rowIdx: number) => void;
    onCopySingleRow: (rowIdx: number) => void;
    onDeleteSingleRow: (rowIdx: number) => void;
    onToggleRowSelection: (rowIdx: number) => void;
    onSelectAllRows: (rowIndices: number[]) => void;
    onClearSelection: () => void;
    onInlineFilterChange: (columnName: string, value: string) => void;
    onOpenFormatter: (rowIdx: number, colName: string, value: any) => void;
    renderColumnTypeIcon: (typeName: string) => ReactNode;
}

export function SqlResultTable({
    result,
    isEditable,
    newRows,
    editingCell,
    editValue,
    filteredRowEntries,
    hasActiveInlineFilters,
    inlineFilters,
    uniqueColumnValueMap,
    selectedRowIndices,
    selectedRowIndexSet,
    onEditValueChange,
    onCellEdit,
    onCellSubmit,
    onCellCancel,
    onOpenExistingRow,
    onOpenNewRow,
    onDeleteNewRow,
    onCopySingleRow,
    onDeleteSingleRow,
    onToggleRowSelection,
    onSelectAllRows,
    onClearSelection,
    onInlineFilterChange,
    onOpenFormatter,
    renderColumnTypeIcon,
}: SqlResultTableProps) {
    const { t } = useTranslation();
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
    const resizingRef = useRef<{ colName: string; startX: number; startWidth: number; startTotalWidth: number } | null>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setColumnWidths(getInitialColumnWidths(result.columns));
    }, [result.columns]);

    const totalTableWidth = useMemo(() => {
        const columnsWidth = result.columns.reduce((total, column) => total + (columnWidths[column.name] || 120), 0);
        return columnsWidth + (selectedRowIndices.length > 0 ? 50 : 0);
    }, [columnWidths, result.columns, selectedRowIndices.length]);

    const tableCssVars = useMemo(() => {
        const nextVars: Record<string, string> = {
            "--table-total-width": `${totalTableWidth}px`,
        };

        result.columns.forEach((column, index) => {
            nextVars[`--col-width-${index}`] = `${columnWidths[column.name] || 120}px`;
        });

        return nextVars as CSSProperties;
    }, [columnWidths, result.columns, totalTableWidth]);

    const handleResizeStart = (event: ReactMouseEvent, colName: string, colIndex: number) => {
        event.preventDefault();
        event.stopPropagation();

        const startWidth = columnWidths[colName] || 120;
        resizingRef.current = {
            colName,
            startX: event.clientX,
            startWidth,
            startTotalWidth: totalTableWidth,
        };

        const handleResizeMove = (moveEvent: MouseEvent) => {
            if (!resizingRef.current || !tableContainerRef.current) {
                return;
            }

            const diff = moveEvent.clientX - resizingRef.current.startX;
            const newWidth = Math.max(80, resizingRef.current.startWidth + diff);
            tableContainerRef.current.style.setProperty(`--col-width-${colIndex}`, `${newWidth}px`);
            tableContainerRef.current.style.setProperty(
                "--table-total-width",
                `${resizingRef.current.startTotalWidth + (newWidth - resizingRef.current.startWidth)}px`,
            );
        };

        const handleResizeEnd = (upEvent: MouseEvent) => {
            if (!resizingRef.current) {
                return;
            }

            const diff = upEvent.clientX - resizingRef.current.startX;
            const newWidth = Math.max(80, resizingRef.current.startWidth + diff);

            setColumnWidths((previousWidths) => ({
                ...previousWidths,
                [resizingRef.current!.colName]: newWidth,
            }));

            resizingRef.current = null;
            document.removeEventListener("mousemove", handleResizeMove);
            document.removeEventListener("mouseup", handleResizeEnd);
            document.body.style.cursor = "";
        };

        document.addEventListener("mousemove", handleResizeMove);
        document.addEventListener("mouseup", handleResizeEnd);
        document.body.style.cursor = "col-resize";
    };

    const filteredRowIndices = useMemo(
        () => filteredRowEntries.map((entry) => entry.originalIndex),
        [filteredRowEntries],
    );

    return (
        <div className="h-full min-h-0 flex flex-col gap-0">
            <div
                className="border rounded-md bg-background flex-1 min-h-0 overflow-auto"
                style={{
                    WebkitOverflowScrolling: "touch",
                    transform: "translateZ(0)",
                }}
            >
                <div
                    ref={tableContainerRef}
                    style={{
                        minWidth: "var(--table-total-width)",
                        ...tableCssVars,
                    }}
                >
                    <Table className="table-fixed" containerClassName="overflow-visible">
                        <colgroup>
                            {selectedRowIndices.length > 0 && <col style={{ width: "50px" }} />}
                            {result.columns.map((_, index) => (
                                <col key={index} style={{ width: `var(--col-width-${index})` }} />
                            ))}
                        </colgroup>
                        <TableHeader className="sticky top-0 bg-muted z-10">
                            <TableRow>
                                {selectedRowIndices.length > 0 && (
                                    <TableHead className="w-[50px] min-w-[50px] p-0">
                                        <div className="flex items-center justify-center h-full w-full">
                                            <input
                                                type="checkbox"
                                                className="cursor-pointer"
                                                checked={filteredRowEntries.length > 0 && filteredRowEntries.every((entry) => selectedRowIndexSet.has(entry.originalIndex))}
                                                onChange={(event) => {
                                                    if (event.target.checked) {
                                                        onSelectAllRows(filteredRowIndices);
                                                    } else {
                                                        onClearSelection();
                                                    }
                                                }}
                                            />
                                        </div>
                                    </TableHead>
                                )}
                                {result.columns.map((column, index) => (
                                    <TableHead key={column.name} className="whitespace-nowrap p-0">
                                        <div className={cn("flex items-center justify-between relative group h-full w-full", index === 0 && "px-2")}>
                                            <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0 truncate pr-2">
                                                <span className="font-semibold text-foreground truncate" title={column.name}>{column.name}</span>
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    {renderColumnTypeIcon(column.type_name)}
                                                    <span className="lowercase truncate">({column.type_name})</span>
                                                </div>
                                            </div>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className={cn(
                                                            "absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 transition-all opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 bg-background/90 shadow-sm border border-border/50",
                                                            inlineFilters[column.name] && "text-blue-600 opacity-100",
                                                        )}
                                                    >
                                                        <Filter className="h-3 w-3" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48 max-h-60 overflow-auto">
                                                    <DropdownMenuItem
                                                        onClick={() => onInlineFilterChange(column.name, "")}
                                                        className="text-xs"
                                                    >
                                                        (清除筛选)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    {uniqueColumnValueMap[column.name]?.map((value, valueIndex) => (
                                                        <DropdownMenuItem
                                                            key={`${column.name}-${valueIndex}`}
                                                            onClick={() => onInlineFilterChange(column.name, value)}
                                                            className={cn(
                                                                "text-xs truncate",
                                                                inlineFilters[column.name] === value && "bg-accent",
                                                            )}
                                                        >
                                                            {value.length > 30 ? `${value.substring(0, 30)}...` : value}
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>

                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors"
                                                onMouseDown={(event) => handleResizeStart(event, column.name, index)}
                                            />
                                        </div>
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {newRows.map((row, rowIdx) => (
                                <TableRow key={`new-${rowIdx}`} className="bg-blue-50/50 dark:bg-blue-950/20">
                                    {selectedRowIndices.length > 0 && <TableCell className="w-[50px] min-w-[50px]"></TableCell>}
                                    {result.columns.map((column, colIdx) => (
                                        <TableCell key={`${column.name}-${colIdx}`} className="whitespace-nowrap">
                                            {editingCell?.rowIdx === rowIdx && editingCell?.colName === column.name && editingCell?.isNewRow ? (
                                                <div className="relative w-full">
                                                    <Input
                                                        value={editValue}
                                                        onChange={(event) => onEditValueChange(event.target.value)}
                                                        className="h-7 text-xs w-full pr-14"
                                                        autoFocus
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter") {
                                                                onCellSubmit();
                                                            }
                                                            if (event.key === "Escape") {
                                                                onCellCancel();
                                                            }
                                                        }}
                                                    />
                                                    <div className="absolute right-0 top-0 h-full flex items-center gap-0.5 pr-1">
                                                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={onCellSubmit}>
                                                            <Check className="h-3 w-3 text-green-600" />
                                                        </Button>
                                                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={onCellCancel}>
                                                            <X className="h-3 w-3 text-red-600" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <ContextMenu>
                                                    <ContextMenuTrigger asChild>
                                                        <div className="truncate cursor-context-menu">
                                                            {row[column.name] === null || row[column.name] === "" ? (
                                                                <span className="text-muted-foreground italic">NULL</span>
                                                            ) : (
                                                                getCellDisplayValue(row[column.name])
                                                            )}
                                                        </div>
                                                    </ContextMenuTrigger>
                                                    <ContextMenuContent>
                                                        <ContextMenuItem onClick={() => onCellEdit(rowIdx, column.name, row[column.name], true)}>
                                                            <Pencil className="h-3 w-3 mr-2" />
                                                            {t("common.edit", "编辑")}
                                                        </ContextMenuItem>
                                                        <ContextMenuItem onClick={() => onOpenNewRow(row, rowIdx)}>
                                                            <Pencil className="h-3 w-3 mr-2" />
                                                            {t("common.editRow", "编辑行")}
                                                        </ContextMenuItem>
                                                        <ContextMenuSeparator />
                                                        <ContextMenuItem
                                                            onClick={() => onDeleteNewRow(rowIdx)}
                                                            className="text-red-600 focus:text-red-600"
                                                        >
                                                            <Trash2 className="h-3 w-3 mr-2" />
                                                            {t("common.deleteRow", "删除行")}
                                                        </ContextMenuItem>
                                                    </ContextMenuContent>
                                                </ContextMenu>
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}

                            {filteredRowEntries.map(({ row, originalIndex }) => {
                                const isRowSelected = selectedRowIndexSet.has(originalIndex);

                                return (
                                    <TableRow key={originalIndex} className="hover:bg-muted/50">
                                        {selectedRowIndices.length > 0 && (
                                            <TableCell className="w-[50px] min-w-[50px] text-center">
                                                <input
                                                    type="checkbox"
                                                    className="cursor-pointer"
                                                    checked={isRowSelected}
                                                    onChange={() => onToggleRowSelection(originalIndex)}
                                                />
                                            </TableCell>
                                        )}
                                        {result.columns.map((column, colIdx) => (
                                            <TableCell key={`${column.name}-${originalIndex}`} className="p-0 whitespace-nowrap">
                                                {editingCell?.rowIdx === originalIndex && editingCell?.colName === column.name && !editingCell?.isNewRow ? (
                                                    <div className="relative w-full px-2 py-1">
                                                        <Input
                                                            value={editValue}
                                                            onChange={(event) => onEditValueChange(event.target.value)}
                                                            className="h-7 text-xs w-full pr-14"
                                                            autoFocus
                                                            onKeyDown={(event) => {
                                                                if (event.key === "Enter") {
                                                                    onCellSubmit();
                                                                }
                                                                if (event.key === "Escape") {
                                                                    onCellCancel();
                                                                }
                                                            }}
                                                        />
                                                        <div className="absolute right-0 top-0 h-full flex items-center gap-0.5 pr-1">
                                                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={onCellSubmit}>
                                                                <Check className="h-3 w-3 text-green-600" />
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={onCellCancel}>
                                                                <X className="h-3 w-3 text-red-600" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <ContextMenu>
                                                        <ContextMenuTrigger asChild>
                                                            <div className={cn("py-2 cursor-context-menu min-h-[36px] flex items-center pr-2", colIdx === 0 && "pl-2")}>
                                                                {row[column.name] === null ? (
                                                                    <span className="text-muted-foreground italic truncate">NULL</span>
                                                                ) : (
                                                                    <span className="flex-1 truncate">{getCellDisplayValue(row[column.name])}</span>
                                                                )}
                                                            </div>
                                                        </ContextMenuTrigger>
                                                        <ContextMenuContent>
                                                            {isEditable && (
                                                                <ContextMenuItem onClick={() => onCellEdit(originalIndex, column.name, row[column.name], false)}>
                                                                    <Pencil className="h-3 w-3 mr-2" />
                                                                    {t("common.edit", "编辑")}
                                                                </ContextMenuItem>
                                                            )}

                                                            <ContextMenuItem onClick={() => onOpenExistingRow(row, originalIndex)}>
                                                                {isEditable ? <Pencil className="h-3 w-3 mr-2" /> : <Eye className="h-3 w-3 mr-2" />}
                                                                {isEditable ? t("common.editRow", "编辑行") : t("common.viewRow", "查看行")}
                                                            </ContextMenuItem>

                                                            <ContextMenuItem onClick={() => onOpenFormatter(originalIndex, column.name, row[column.name])}>
                                                                <Wand2 className="h-3 w-3 mr-2" />
                                                                {t("common.viewFormatted", "格式化完整内容")}
                                                            </ContextMenuItem>

                                                            <ContextMenuSeparator />

                                                            <ContextMenuItem onClick={() => onToggleRowSelection(originalIndex)}>
                                                                <MousePointerClick className="h-3 w-3 mr-2" />
                                                                {isRowSelected ? t("common.deselect", "取消选中") : t("common.select", "选中")}
                                                            </ContextMenuItem>

                                                            {isEditable && (
                                                                <ContextMenuItem onClick={() => onCopySingleRow(originalIndex)}>
                                                                    <Copy className="h-3 w-3 mr-2" />
                                                                    {t("common.duplicateRow", "复制行")}
                                                                </ContextMenuItem>
                                                            )}

                                                            {isEditable && (
                                                                <ContextMenuItem
                                                                    onClick={() => onDeleteSingleRow(originalIndex)}
                                                                    className="text-red-600 focus:text-red-600"
                                                                >
                                                                    <Trash2 className="h-3 w-3 mr-2" />
                                                                    {t("common.deleteRow", "删除行")}
                                                                </ContextMenuItem>
                                                            )}
                                                        </ContextMenuContent>
                                                    </ContextMenu>
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })}

                            {filteredRowEntries.length === 0 && newRows.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={selectedRowIndices.length > 0 ? (result.columns.length || 1) + 1 : (result.columns.length || 1)}
                                        className="text-center h-24 text-muted-foreground"
                                    >
                                        {hasActiveInlineFilters ? t("common.noFilterResults", "无匹配结果") : t("common.noResults", "No results")}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
