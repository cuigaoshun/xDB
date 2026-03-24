import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { useTranslation } from "react-i18next";
import { toast, useNotificationStore } from "@/hooks/useToast";
import { useUpdateStore } from "@/store/useUpdateStore";

const UPDATE_CHECK_INTERVAL = 2 * 60 * 60 * 1000; // 2 小时

export function useUpdater() {
  const { t } = useTranslation();
  const hasNotifiedRef = useRef(false);
  const hasCheckedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const { setUpdateInfo, setDownloading, setDownloadProgress, setReadyToInstall } = useUpdateStore();

  useEffect(() => {
    // 防止重复执行
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const pollUpdate = async () => {
      // 防止重复通知
      if (hasNotifiedRef.current) return;

      try {
        const update = await check();

        if (!update) return;

        // 保存更新信息到全局状态
        setUpdateInfo({ update, version: update.version || "" });

        // 显示通知，带操作按钮
        hasNotifiedRef.current = true;
        const toastId = toast({
          persistent: true,
          title: t("updater.available.title"),
          description: t("updater.available.description", {
            version: update.version ?? "",
          }),
          actions: [
            {
              label: t("updater.install"),
              onClick: async () => {
                // 关闭 Toast
                useNotificationStore.getState().removeToast(toastId);

                // 开始下载
                setDownloading(true);
                setDownloadProgress(0);
                setReadyToInstall(false);

                let totalDownloaded = 0;
                let contentLength = 0;

                try {
                  await update.downloadAndInstall((event) => {
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

                  // 下载完成，提示用户到设置页安装
                  toast({
                    title: t("updater.available.title"),
                    description: "请到设置页面点击安装",
                    duration: 10000,
                  });
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
              },
            },
            {
              label: t("updater.notYet"),
              onClick: "dismiss",
            },
          ],
        });
      } catch (error) {
        console.error("Update check failed:", error);
      }
    };

    // 启动时检查一次
    pollUpdate();

    // 设置定时轮询
    intervalRef.current = setInterval(pollUpdate, UPDATE_CHECK_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
