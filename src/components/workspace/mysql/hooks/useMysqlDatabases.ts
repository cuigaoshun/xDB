import { useCallback } from "react";
import { invokeSql } from "@/lib/api.ts";

interface SqlResult {
    rows: Record<string, any>[];
}

const SYSTEM_DBS = new Set(["information_schema", "mysql", "performance_schema", "sys"]);

export function useMysqlDatabases() {
    const fetchMysqlDatabases = useCallback(async (connectionId: number, showSystemDatabases: boolean) => {
        const result = await invokeSql<SqlResult>({
            connectionId,
            sql: "SHOW DATABASES",
        });

        const dbs = result.rows
            .map((row) => Object.values(row)[0] as string)
            .filter(Boolean)
            .filter((db) => showSystemDatabases || !SYSTEM_DBS.has(db.toLowerCase()));

        return dbs;
    }, []);

    return { fetchMysqlDatabases };
}
