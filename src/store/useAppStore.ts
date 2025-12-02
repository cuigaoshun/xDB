import { create } from 'zustand';
import { ReactNode } from 'react';

export type DbType = 'mysql' | 'redis';

export interface Connection {
  id: string;
  name: string;
  type: DbType;
  host: string;
  port: number;
}

export interface Tab {
  id: string;
  title: string;
  type: DbType;
  connectionId: string;
  active?: boolean;
  // 可以在这里扩展更多 Tab 状态，比如查询内容、滚动位置等
}

interface AppState {
  connections: Connection[];
  tabs: Tab[];
  activeTabId: string | null;
  
  addTab: (tab: Omit<Tab, 'active'>) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  
  // Mock action to add connection
  addConnection: (conn: Connection) => void;
}

export const useAppStore = create<AppState>((set) => ({
  connections: [
    { id: '1', name: 'Local MySQL', type: 'mysql', host: 'localhost', port: 3306 },
    { id: '2', name: 'Prod Redis', type: 'redis', host: '192.168.1.100', port: 6379 },
  ],
  tabs: [],
  activeTabId: null,

  addTab: (newTab) => set((state) => {
    const existingTab = state.tabs.find(t => t.id === newTab.id);
    if (existingTab) {
      return { activeTabId: newTab.id };
    }
    return {
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    };
  }),

  closeTab: (id) => set((state) => {
    const newTabs = state.tabs.filter((t) => t.id !== id);
    let newActiveId = state.activeTabId;

    // 如果关闭的是当前激活的 tab，则激活最后一个，或者 null
    if (id === state.activeTabId) {
      newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
    }

    return {
      tabs: newTabs,
      activeTabId: newActiveId,
    };
  }),

  setActiveTab: (id) => set({ activeTabId: id }),

  addConnection: (conn) => set((state) => ({
    connections: [...state.connections, conn]
  })),
}));
