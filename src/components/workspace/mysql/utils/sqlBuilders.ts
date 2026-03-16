export function escapeSqlIdentifier(identifier: string): string {
    return `\`${identifier.replace(/`/g, "``")}\``;
}

export function normalizeEditableValue(value: any) {
    return value === "" ? null : value;
}

export function toSqlLiteral(value: any): string {
    if (value === null || value === undefined) {
        return "NULL";
    }

    const rawValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `'${rawValue.replace(/'/g, "''")}'`;
}

export function buildPkWhereClause(
    row: Record<string, any>,
    primaryKeys: string[],
    noPrimaryKeyMessage: string,
): string {
    if (primaryKeys.length === 0) {
        throw new Error(noPrimaryKeyMessage);
    }

    return primaryKeys
        .map((key) => {
            const value = row[key];
            if (value === null || value === undefined) {
                return `${escapeSqlIdentifier(key)} IS NULL`;
            }

            return `${escapeSqlIdentifier(key)} = ${toSqlLiteral(value)}`;
        })
        .join(" AND ");
}

export function buildInsertSql(
    dbName: string,
    tableName: string,
    row: Record<string, any>,
): string | null {
    const fields: string[] = [];
    const values: string[] = [];

    Object.entries(row).forEach(([key, value]) => {
        if (value !== null && value !== "") {
            fields.push(escapeSqlIdentifier(key));
            values.push(toSqlLiteral(value));
        }
    });

    if (fields.length === 0) {
        return null;
    }

    return `INSERT INTO ${escapeSqlIdentifier(dbName)}.${escapeSqlIdentifier(tableName)} (${fields.join(", ")}) VALUES (${values.join(", ")})`;
}

export function buildUpdateSql(
    dbName: string,
    tableName: string,
    originalRow: Record<string, any>,
    editedRow: Record<string, any>,
    primaryKeys: string[],
    noPrimaryKeyMessage: string,
): string | null {
    const updates: string[] = [];

    Object.keys(editedRow).forEach((key) => {
        const nextValue = normalizeEditableValue(editedRow[key]);
        const prevValue = normalizeEditableValue(originalRow[key]);

        if (nextValue !== prevValue) {
            updates.push(`${escapeSqlIdentifier(key)} = ${toSqlLiteral(nextValue)}`);
        }
    });

    if (updates.length === 0) {
        return null;
    }

    const whereClause = buildPkWhereClause(originalRow, primaryKeys, noPrimaryKeyMessage);
    return `UPDATE ${escapeSqlIdentifier(dbName)}.${escapeSqlIdentifier(tableName)} SET ${updates.join(", ")} WHERE ${whereClause}`;
}

export function buildDeleteSql(
    dbName: string,
    tableName: string,
    row: Record<string, any>,
    primaryKeys: string[],
    noPrimaryKeyMessage: string,
): string {
    const whereClause = buildPkWhereClause(row, primaryKeys, noPrimaryKeyMessage);
    return `DELETE FROM ${escapeSqlIdentifier(dbName)}.${escapeSqlIdentifier(tableName)} WHERE ${whereClause}`;
}
