import { create } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';

interface UpdateState {
  updateInfo: { update: Update; version: string } | null;
  downloading: boolean;
  downloadProgress: number;
  readyToInstall: boolean;
  
  setUpdateInfo: (info: { update: Update; version: string } | null) => void;
  setDownloading: (downloading: boolean) => void;
  setDownloadProgress: (progress: number) => void;
  setReadyToInstall: (ready: boolean) => void;
  reset: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  updateInfo: null,
  downloading: false,
  downloadProgress: 0,
  readyToInstall: false,
  
  setUpdateInfo: (info) => set({ updateInfo: info }),
  setDownloading: (downloading) => set({ downloading }),
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),
  setReadyToInstall: (ready) => set({ readyToInstall: ready }),
  reset: () => set({ 
    updateInfo: null, 
    downloading: false, 
    downloadProgress: 0, 
    readyToInstall: false 
  }),
}));
