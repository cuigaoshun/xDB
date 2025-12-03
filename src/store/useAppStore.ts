import { create } from 'zustand';

export type DbType = 'mysql' | 'redis' | 'sqlite' | 'postgres';

export interface Connection {
  id: number;
  name: string;
  db_type: DbType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  created_at?: string;
}

export interface Tab {
  id: string;
  title: string;
  type: DbType;
  connectionId: number;
  active?: boolean;
  initialSql?: string;
}

interface AppState {
  connections: Connection[];
  tabs: Tab[];
  activeTabId: string | null;
  
  setConnections: (connections: Connection[]) => void;
  addTab: (tab: Omit<Tab, 'active'>) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  
  addConnection: (conn: Connection) => void;
  removeConnection: (id: number) => void;
  updateConnection: (conn: Connection) => void;
}

export const useAppStore = create<AppState>((set) => ({
  connections: [],
  tabs: [],
  activeTabId: null,

  setConnections: (connections) => set({ connections }),

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
    connections: [conn, ...state.connections]
  })),

  removeConnection: (id) => set((state) => ({
    connections: state.connections.filter(c => c.id !== id)
  })),
  
  updateConnection: (conn) => set((state) => ({
    connections: state.connections.map(c => c.id === conn.id ? conn : c)
  }))
}));
