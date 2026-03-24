import { useCallback } from "react";

export function useSqliteDatabases() {
    const fetchSqliteDatabases = useCallback(async (_connectionId: number) => {
        return ["main"];
    }, []);

    return { fetchSqliteDatabases };
}
