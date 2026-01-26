import { useTranslation } from "react-i18next";
import { TableSchemaManager } from "./TableSchemaManager.tsx";

interface TableSchemaTabProps {
    tabId: string;
    connectionId: number;
    dbName: string;
    tableName: string;
}

export function TableSchemaTab({ connectionId, dbName, tableName }: TableSchemaTabProps) {
    const { t } = useTranslation();

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="border-b p-3 bg-muted/5">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{t('mysql.tableStructure')}</span>
                    <span className="text-sm text-muted-foreground">
                        {dbName}.{tableName}
                    </span>
                </div>
            </div>

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
