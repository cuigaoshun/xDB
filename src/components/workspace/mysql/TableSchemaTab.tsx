import { TableSchemaManager } from "./TableSchemaManager.tsx";

interface TableSchemaTabProps {
    tabId: string;
    connectionId: number;
    dbName: string;
    tableName: string;
}

export function TableSchemaTab({ connectionId, dbName, tableName }: TableSchemaTabProps) {
    return (
        <div className="h-full flex flex-col bg-background">
            {/* Content */}
            <div className="flex-1 overflow-hidden">
                <TableSchemaManager
                    connectionId={connectionId}
                    dbName={dbName}
                    tableName={tableName}
                />
            </div>
        </div>
    );
}
