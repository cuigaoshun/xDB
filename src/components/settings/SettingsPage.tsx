import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useUpdateStore } from "@/store/useUpdateStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RotateCcw, Download, Github } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "@/hooks/useToast";

export function SettingsPage() {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);

  const {
    updateInfo,
    downloading,
    downloadProgress,
    readyToInstall,
    setUpdateInfo,
    setDownloading,
    setDownloadProgress,
    setReadyToInstall,
    reset: resetUpdate,
  } = useUpdateStore();

  const {
    redisScanCount,
    setRedisScanCount,
    mysqlPrefetchDbCount,
    setMysqlPrefetchDbCount,
    showSystemDatabases,
    setShowSystemDatabases,
    resetSettings
  } = useSettingsStore();

  const handleCheckUpdate = async () => {
    setChecking(true);
    try {
      const update = await check();

      if (!update) {
        toast({
          title: t("updater.none.title"),
          description: t("updater.none.message"),
        });
        setUpdateInfo(null);
        return;
      }

      // 保存更新信息到状态
      setUpdateInfo({ update, version: update.version || "" });

      toast({
        title: t("updater.available.title"),
        description: t("updater.available.description", { version: update.version }),
      });
    } catch (error) {
      console.error("Check update failed:", error);
      toast({
        title: t("updater.checkFailed.title"),
        description: t("updater.checkFailed.message"),
        variant: "destructive",
      });
    } finally {
      setChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updateInfo) return;

    setDownloading(true);
    setDownloadProgress(0);
    setReadyToInstall(false);

    let totalDownloaded = 0;
    let contentLength = 0;

    try {
      await updateInfo.update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setDownloadProgress(0);
            totalDownloaded = 0;
            contentLength = event.data.contentLength || 0;
            break;
          case "Progress":
            totalDownloaded += event.data.chunkLength || 0;
            if (contentLength > 0) {
              const progress = (totalDownloaded / contentLength) * 100;
              setDownloadProgress(Math.min(Math.round(progress), 99));
            }
            break;
          case "Finished":
            setDownloadProgress(100);
            setReadyToInstall(true);
            break;
        }
      });

      // 下载完成，等待用户点击安装
    } catch (error) {
      console.error("Download failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: t("updater.downloadFailed.title"),
        description: errorMessage || t("updater.downloadFailed.message"),
        variant: "destructive",
      });
      setDownloading(false);
      setDownloadProgress(0);
      setReadyToInstall(false);
    }
  };

  const handleInstallUpdate = async () => {
    try {
      toast({
        title: t("updater.installing"),
      });

      // 重启应用以完成安装
      await relaunch();
    } catch (error) {
      console.error("Install failed:", error);
      toast({
        title: t("updater.installFailed.title"),
        description: t("updater.installFailed.message"),
        variant: "destructive",
      });
    }
  };

  const handleCancelUpdate = () => {
    resetUpdate();
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
          <Button variant="outline" size="sm" onClick={resetSettings}>
            <RotateCcw className="h-4 w-4 mr-2" />
            {t('settings.resetToDefault')}
          </Button>
        </div>

        {/* MySQL Settings */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">{t('settings.mysql', 'MySQL')}</h2>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="mysqlPrefetchDbCount">{t('settings.mysqlPrefetchDbCount', 'Prefetch Databases Count')}</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={String(mysqlPrefetchDbCount)}
                  onValueChange={(val) => {
                    if (val === 'all') {
                      setMysqlPrefetchDbCount('all');
                    } else {
                      setMysqlPrefetchDbCount(parseInt(val));
                    }
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="all">{t('settings.all', 'All')}</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  {t('settings.mysqlPrefetchDbCountDesc', 'Preload table info for recently accessed databases when expanding connection')}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-2">
              <Checkbox
                id="showSystemDatabases"
                checked={showSystemDatabases}
                onCheckedChange={(checked) => setShowSystemDatabases(!!checked)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor="showSystemDatabases"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {t('settings.showSystemDatabases', 'Show system databases')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.showSystemDatabasesDesc', 'Show information_schema, mysql, performance_schema, sys, etc.')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Redis Settings */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">{t('settings.redis')}</h2>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="redisScanCount">{t('settings.redisScanCount')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="redisScanCount"
                  type="number"
                  min={10}
                  max={10000}
                  value={redisScanCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 10 && val <= 10000) {
                      setRedisScanCount(val);
                    }
                  }}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  {t('settings.redisScanCountDesc')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* App Update */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">{t('updater.available.title')}</h2>

          <div className="grid gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t('settings.checkForUpdates')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('app.name')} v{import.meta.env.PACKAGE_VERSION}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckUpdate}
                  disabled={checking || downloading}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {checking ? t('settings.checking') : t('settings.checkForUpdates')}
                </Button>
              </div>

              {/* 发现新版本 */}
              {updateInfo && !downloading && (
                <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {t('updater.available.title')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('updater.available.description', { version: updateInfo.version })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelUpdate}
                      >
                        {t('updater.notYet')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleDownloadUpdate}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {t('updater.download')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* 下载进度 */}
              {downloading && (
                <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {readyToInstall ? t('updater.available.title') : t('updater.downloading')}
                        </span>
                        <span className="text-muted-foreground">{downloadProgress}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* 下载完成后显示安装按钮 */}
                    {readyToInstall && (
                      <div className="flex items-center justify-between pt-2">
                        <p className="text-sm text-muted-foreground">
                          {t('updater.available.description', { version: updateInfo?.version || '' })}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelUpdate}
                          >
                            {t('updater.notYet')}
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleInstallUpdate}
                          >
                            {t('updater.install')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* GitHub */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">GitHub</h2>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">xDB</p>
              <p className="text-sm text-muted-foreground">
                {t('settings.github', 'Open Source Address')}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUrl('https://github.com/cuigaoshun/xDB')}
            >
              <Github className="h-4 w-4 mr-2" />
              GitHub
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
