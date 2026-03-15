import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useTranslation } from "react-i18next";
import { Moon, Sun, Laptop, Languages, Settings, Sliders, Upload, Download } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { ExportConnectionsDialog } from "../connection/ExportConnectionsDialog";
import { ImportConnectionsDialog } from "../connection/ImportConnectionsDialog";
import { getAllConnections, getAllConnectionGroups } from "@/lib/connectionDB";

export function SettingsMenu() {
    const { setTheme, theme } = useTheme();
    const { t, i18n } = useTranslation();
    const setActiveView = useAppStore((state) => state.setActiveView);
    const setConnections = useAppStore((state) => state.setConnections);
    const setConnectionGroups = useAppStore((state) => state.setConnectionGroups);

    const [exportOpen, setExportOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);

    const refreshConnections = async () => {
        try {
            const [connections, groups] = await Promise.all([
                getAllConnections(),
                getAllConnectionGroups()
            ]);
            setConnections(connections);
            setConnectionGroups(groups);
        } catch (error) {
            console.error("Failed to fetch connections:", error);
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" title={t('common.settings')}>
                        <Settings className="h-4 w-4" />
                        <span className="sr-only">Settings</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {/* Theme Selection */}
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                            <Sun className="mr-2 h-4 w-4 dark:hidden" />
                            <Moon className="mr-2 h-4 w-4 hidden dark:block" />
                            <span>{t('common.theme')}</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => setTheme("light")}>
                                <Sun className="mr-2 h-4 w-4" />
                                <span>Light</span>
                                {theme === 'light' && <span className="ml-auto text-xs">✓</span>}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTheme("dark")}>
                                <Moon className="mr-2 h-4 w-4" />
                                <span>Dark</span>
                                {theme === 'dark' && <span className="ml-auto text-xs">✓</span>}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTheme("system")}>
                                <Laptop className="mr-2 h-4 w-4" />
                                <span>System</span>
                                {theme === 'system' && <span className="ml-auto text-xs">✓</span>}
                            </DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    {/* Language Selection */}
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                            <Languages className="mr-2 h-4 w-4" />
                            <span>{t('common.language')}</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuRadioGroup value={i18n.language}>
                                <DropdownMenuRadioItem value="zh" onClick={() => i18n.changeLanguage('zh')}>
                                    中文
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="en" onClick={() => i18n.changeLanguage('en')}>
                                    English
                                </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    {/* Export / Import */}
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>
                        <Upload className="mr-2 h-4 w-4" />
                        <span>{t('settings.exportConnections')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setImportOpen(true)}>
                        <Download className="mr-2 h-4 w-4" />
                        <span>{t('settings.importConnections')}</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    {/* Settings Page */}
                    <DropdownMenuItem onClick={() => setActiveView('settings')}>
                        <Sliders className="mr-2 h-4 w-4" />
                        <span>{t('settings.title')}</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ExportConnectionsDialog
                open={exportOpen}
                onOpenChange={setExportOpen}
            />

            <ImportConnectionsDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                onImportSuccess={refreshConnections}
            />
        </>
    );
}
