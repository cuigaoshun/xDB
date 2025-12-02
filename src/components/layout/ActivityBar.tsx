import { useAppStore, Connection } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { 
  Database, 
  Server,
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
        const existingTab = tabs.find(t => t.connectionId === conn.id);
        if (existingTab) {
            setActiveTab(existingTab.id);
        } else {
            addTab({
                id: `conn-${conn.id}`,
                title: conn.name,
                type: conn.type,
                connectionId: conn.id,
            });
        }
    };

    if (collapsed) {
        return null; 
    }

    return (
        <div className="w-64 bg-muted/10 border-r flex flex-col text-foreground">
             <div className="p-4 flex items-center justify-between border-b">
                <span className="font-semibold text-sm uppercase tracking-wider">{t('sidebar.explorer')}</span>
                <button onClick={onToggle} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="h-4 w-4" />
                </button>
             </div>
             <div className="flex-1 overflow-y-auto p-2">
                {connections.map((conn) => (
                    <div
                        key={conn.id}
                        onClick={() => handleConnectionClick(conn)}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors mb-1 text-sm",
                            // Highlight if this connection has an active tab
                            tabs.find(t => t.connectionId === conn.id && t.id === activeTabId)
                                ? "bg-primary text-primary-foreground font-medium"
                                : "hover:bg-accent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {conn.type === 'mysql' ? (
                            <Database className={cn("h-4 w-4", conn.type === 'mysql' ? "text-blue-500" : "")} />
                        ) : (
                            <Server className={cn("h-4 w-4", conn.type === 'redis' ? "text-red-500" : "")} />
                        )}
                        <span className="truncate">{conn.name}</span>
                    </div>
                ))}
             </div>
        </div>
    );
}
