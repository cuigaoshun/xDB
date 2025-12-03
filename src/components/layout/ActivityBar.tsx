import { useAppStore, Connection } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { 
  Database,
  ChevronLeft,
  Home
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { SettingsMenu } from "./SettingsMenu";
import { ConnectionTreeItem } from "./ConnectionTree";

interface ActivityBarProps {
    activeView: 'home' | 'connections';
    onViewChange: (view: 'home' | 'connections') => void;
}

export function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
    const { t } = useTranslation();

    return (
        <div className="w-12 bg-slate-900 flex flex-col items-center py-4 border-r border-slate-800 text-slate-300 z-20">
             <div className="flex flex-col gap-4 w-full items-center">
                <TooltipProvider delayDuration={0}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button 
                                onClick={() => onViewChange('home')}
                                className={cn(
                                    "p-2 rounded-md transition-colors hover:bg-slate-800 hover:text-white",
                                    activeView === 'home' ? "bg-blue-600 text-white" : ""
                                )}
                            >
                                <Home className="h-5 w-5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-slate-900 border-slate-700 text-white">
                            <p>{t('menu.home')}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <TooltipProvider delayDuration={0}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button 
                                onClick={() => onViewChange('connections')}
                                className={cn(
                                    "p-2 rounded-md transition-colors hover:bg-slate-800 hover:text-white",
                                    activeView === 'connections' ? "bg-blue-600 text-white" : ""
                                )}
                            >
                                <Database className="h-5 w-5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-slate-900 border-slate-700 text-white">
                            <p>{t('sidebar.connections')}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
             </div>

             <div className="mt-auto flex flex-col gap-4 w-full items-center">
                 <SettingsMenu />
             </div>
        </div>
    );
}

// Sidebar List for Quick Connection Switching (Collapsible)
export function ConnectionSidebar({ collapsed, onToggle }: { collapsed: boolean, onToggle: () => void }) {
    const connections = useAppStore((state) => state.connections);
    const activeTabId = useAppStore((state) => state.activeTabId);
    const setActiveTab = useAppStore((state) => state.setActiveTab);
    const addTab = useAppStore((state) => state.addTab);
    const tabs = useAppStore((state) => state.tabs);
    const { t } = useTranslation();
    
    // If a connection is already open in a tab, switch to it. Otherwise open new tab.
    const handleConnectionClick = (conn: Connection) => {
        const existingTab = tabs.find(t => t.connectionId === conn.id && !t.id.startsWith('table-'));
        if (existingTab) {
            setActiveTab(existingTab.id);
        } else {
            addTab({
                id: `conn-${conn.id}`,
                title: conn.name,
                type: conn.db_type,
                connectionId: conn.id,
            });
        }
    };

    const handleTableSelect = (conn: Connection, db: string, table: string) => {
        const tabId = `table-${conn.id}-${db}-${table}`;
        const existingTab = tabs.find(t => t.id === tabId);
        
        if (existingTab) {
            setActiveTab(existingTab.id);
        } else {
            addTab({
                id: tabId,
                title: table,
                type: conn.db_type,
                connectionId: conn.id,
                initialSql: `SELECT * FROM \`${db}\`.\`${table}\` LIMIT 100;`
            });
        }
    };

    if (collapsed) {
        return null; 
    }

    return (
        <div className="w-full h-full bg-muted/10 border-r flex flex-col text-foreground">
             <div className="p-4 flex items-center justify-between border-b">
                <span className="font-semibold text-sm uppercase tracking-wider">{t('sidebar.explorer')}</span>
                <button onClick={onToggle} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="h-4 w-4" />
                </button>
             </div>
             <div className="flex-1 overflow-y-auto p-2">
                {connections.map((conn) => (
                    <ConnectionTreeItem
                        key={conn.id}
                        connection={conn}
                        isActive={!!tabs.find(t => t.connectionId === conn.id && t.id === activeTabId)}
                        onSelect={handleConnectionClick}
                        onSelectTable={handleTableSelect}
                    />
                ))}
             </div>
        </div>
    );
}
