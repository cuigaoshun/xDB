import type {
    ColumnInfo,
    EditableState,
    FilteredRowEntry,
    SchemaColumnMeta,
    SqlResult,
} from "@/types/sql";

export function isSingleTableQuery(sql: string): boolean {
    const trimmedSql = sql.trim().toUpperCase();

    if (!trimmedSql.startsWith("SELECT")) {
        return false;
    }

    const joinKeywords = ["JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "OUTER JOIN", "CROSS JOIN"];
    if (joinKeywords.some((keyword) => trimmedSql.includes(keyword))) {
        return false;
    }

    const fromMatch = trimmedSql.match(/FROM\s+(.+?)(?:WHERE|GROUP|ORDER|LIMIT|$)/i);
    if (fromMatch) {
        const fromClause = fromMatch[1].trim();
        if (fromClause.includes(",")) {
            return false;
        }
    }

    return true;
}

export function extractSchemaMetadata(rows: Record<string, any>[]) {
    const schemaColumns: SchemaColumnMeta[] = rows.map((row) => ({
        name: (row.Field || row.field || Object.values(row)[0]) as string,
        type: (row.Type || row.type || Object.values(row)[1] || "text") as string,
        comment: (row.Comment || row.comment || "") as string,
    }));

    const columns: ColumnInfo[] = schemaColumns.map((column) => ({
        name: column.name,
        type_name: column.type,
        comment: column.comment,
    }));

    const primaryKeys = rows
        .filter((row) => (row.Key || row.key || "").toString().toUpperCase() === "PRI")
        .map((row) => (row.Field || row.field || Object.values(row)[0]) as string);

    return { columns, schemaColumns, primaryKeys };
}

export function mergeSqlResultWithSchema(
    data: SqlResult,
    schemaColumns: SchemaColumnMeta[],
    isInitialOpen?: boolean,
): SqlResult {
    const nextData: SqlResult = {
        columns: [...(data.columns || [])],
        rows: data.rows || [],
        affected_rows: data.affected_rows || 0,
    };

    if (isInitialOpen && nextData.rows.length === 0 && nextData.columns.length === 0 && schemaColumns.length > 0) {
        nextData.columns = schemaColumns.map((column) => ({
            name: column.name,
            type_name: column.type,
            comment: column.comment,
        }));
    }

    if (nextData.columns.length === 0 || schemaColumns.length === 0) {
        return nextData;
    }

    const commentMap = new Map(schemaColumns.map((column) => [column.name, column]));
    nextData.columns = nextData.columns.map((column) => {
        const match = commentMap.get(column.name);
        return match && match.comment
            ? { ...column, comment: match.comment }
            : column;
    });

    return nextData;
}

export function haveColumnsChanged(previousColumns?: ColumnInfo[], nextColumns?: ColumnInfo[]): boolean {
    if (!previousColumns || !nextColumns || previousColumns.length !== nextColumns.length) {
        return true;
    }

    return !previousColumns.every((column, index) => {
        const nextColumn = nextColumns[index];
        return column.name === nextColumn.name && column.type_name === nextColumn.type_name;
    });
}

export function resolveEditableState(
    query: string,
    primaryKeys: string[],
    hasTableContext: boolean,
    messages: {
        noPrimaryKey: string;
        multiTable: string;
        unsupported: string;
    },
): EditableState {
    if (hasTableContext) {
        if (primaryKeys.length > 0 && isSingleTableQuery(query)) {
            return { isEditable: true, reason: "" };
        }

        if (primaryKeys.length === 0) {
            return { isEditable: false, reason: messages.noPrimaryKey };
        }

        return { isEditable: false, reason: messages.multiTable };
    }

    if (!isSingleTableQuery(query)) {
        return { isEditable: false, reason: messages.multiTable };
    }

    return { isEditable: false, reason: messages.unsupported };
}

export function getCellDisplayValue(value: any): string {
    if (value === null || value === undefined) {
        return "NULL";
    }

    return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function buildFilteredRowEntries(
    rows: Record<string, any>[],
    inlineFilters: Record<string, string>,
): FilteredRowEntry[] {
    const activeFilters = Object.entries(inlineFilters).filter(([, value]) => value.trim() !== "");

    if (activeFilters.length === 0) {
        return rows.map((row, originalIndex) => ({ row, originalIndex }));
    }

    return rows.reduce<FilteredRowEntry[]>((entries, row, originalIndex) => {
        const matches = activeFilters.every(([columnName, filterValue]) => {
            const cellValue = row[columnName];
            if (cellValue === null || cellValue === undefined) {
                return filterValue.toLowerCase() === "null";
            }

            return getCellDisplayValue(cellValue).toLowerCase().includes(filterValue.toLowerCase());
        });

        if (matches) {
            entries.push({ row, originalIndex });
        }

        return entries;
    }, []);
}

export function buildUniqueColumnValueMap(columns: ColumnInfo[], rows: Record<string, any>[]) {
    return columns.reduce<Record<string, string[]>>((accumulator, column) => {
        const uniqueValues = [...new Set(rows.map((row) => getCellDisplayValue(row[column.name])))]
            .slice(0, 50);
        accumulator[column.name] = uniqueValues;
        return accumulator;
    }, {});
}

export function getInitialColumnWidths(columns: ColumnInfo[]) {
    return columns.reduce<Record<string, number>>((widths, column) => {
        const type = column.type_name.toUpperCase();
        const nameWidth = column.name.length * 8.5 + 12;
        const typeWidth = column.type_name.length * 8.5 + 12;

        let width = Math.max(110, nameWidth, typeWidth);
        if (type.includes("DATE") || type.includes("TIME") || type.includes("TIMESTAMP")) {
            width = Math.max(150, width);
        }

        widths[column.name] = width;
        return widths;
    }, {});
}
