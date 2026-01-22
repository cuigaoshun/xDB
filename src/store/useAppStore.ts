import { create } from 'zustand';

export type DbType = 'mysql' | 'redis' | 'sqlite' | 'postgres' | 'memcached';

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

export type TabType = 'connection' | 'query' | 'table-schema' | 'database-tables' | 'redis-db';

export interface TableInfo {
  name: string;
  comment?: string;
  rowCount?: number;
}

export interface Tab {
  id: string;
  title: string;
  type: DbType; // 数据库类型
  tabType?: TabType; // 标签页类型，默认为 'query'
  connectionId: number;
  active?: boolean;
  initialSql?: string;
  currentSql?: string;
  dbName?: string;
  tableName?: string;
  savedResult?: any;
  // 表结构标签页专用字段
  schemaInfo?: {
    dbName: string;
    tableName: string;
  };
  // 数据库表列表专用字段
  databaseTablesInfo?: {
    dbName: string;
  };
  // Redis数据库专用字段
  redisDbInfo?: {
    db: number;
  };
}

interface AppState {
  connections: Connection[];
  tabs: Tab[];
  activeTabId: string | null;
  activeView: 'home' | 'connections' | 'settings';
  expandedConnectionId: number | null;
  // 表信息缓存：key 为 "connectionId-dbName"
  tablesCache: Record<string, TableInfo[]>;
  // 表信息加载状态：key 为 "connectionId-dbName"
  tablesLoading: Record<string, boolean>;

  setConnections: (connections: Connection[]) => void;
  addTab: (tab: Omit<Tab, 'active'>) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  replaceTab: (oldId: string, newTab: Tab) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  closeTabsToLeft: (id: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (id: string) => void;
  setActiveView: (view: 'home' | 'connections' | 'settings') => void;
  setExpandedConnectionId: (id: number | null) => void;

  addConnection: (conn: Connection) => void;
  removeConnection: (id: number) => void;
  updateConnection: (conn: Connection) => void;

  // 表信息缓存方法
  setTablesCache: (connectionId: number, dbName: string, tables: TableInfo[]) => void;
  getTablesCache: (connectionId: number, dbName: string) => TableInfo[] | undefined;
  clearTablesCache: (connectionId: number, dbName: string) => void;
  // 表信息加载状态方法
  setTablesLoading: (connectionId: number, dbName: string, loading: boolean) => void;
  isTablesLoading: (connectionId: number, dbName: string) => boolean;
}

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  tabs: [],
  activeTabId: null,
  activeView: 'home',
  expandedConnectionId: null,
  tablesCache: {},
  tablesLoading: {},

  setConnections: (connections) => set({ connections }),

  addTab: (newTab) => set((state) => {
    const existingTab = state.tabs.find(t => t.id === newTab.id);
    if (existingTab) {
      return { activeTabId: newTab.id, activeView: 'connections' };
    }
    return {
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
      activeView: 'connections',
    };
  }),

  updateTab: (id, updates) => set((state) => ({
    tabs: state.tabs.map(t => t.id === id ? { ...t, ...updates } : t)
  })),

  replaceTab: (oldId, newTab) => set((state) => {
    const newTabs = state.tabs.map(t => t.id === oldId ? newTab : t);
    return {
      tabs: newTabs,
      activeTabId: newTab.id, // Switch to new tab
      activeView: 'connections'
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

  closeOtherTabs: (id) => set((state) => {
    const tabToKeep = state.tabs.find(t => t.id === id);
    return {
      tabs: tabToKeep ? [tabToKeep] : [],
      activeTabId: tabToKeep ? tabToKeep.id : null
    };
  }),

  closeTabsToRight: (id) => set((state) => {
    const index = state.tabs.findIndex(t => t.id === id);
    if (index === -1) return {};

    const newTabs = state.tabs.slice(0, index + 1);

    // If active tab was removed (was to the right), set active to the current tab
    // Actually, if active tab is preserved, keep it. If not, set to id.
    // But if we close to right, the current tab `id` is definitely preserved.
    // If active tab was one of the closed ones, switch to `id`.
    let newActiveId = state.activeTabId;
    if (!newTabs.find(t => t.id === state.activeTabId)) {
      newActiveId = id;
    }

    return {
      tabs: newTabs,
      activeTabId: newActiveId
    };
  }),

  closeTabsToLeft: (id) => set((state) => {
    const index = state.tabs.findIndex(t => t.id === id);
    if (index === -1) return {};

    const newTabs = state.tabs.slice(index);

    let newActiveId = state.activeTabId;
    if (!newTabs.find(t => t.id === state.activeTabId)) {
      newActiveId = id;
    }

    return {
      tabs: newTabs,
      activeTabId: newActiveId
    };
  }),

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),

  setActiveTab: (id) => set({ activeTabId: id, activeView: 'connections' }),

  setActiveView: (view) => set({ activeView: view }),

  setExpandedConnectionId: (id) => set({ expandedConnectionId: id, activeView: 'connections' }),

  addConnection: (conn) => set((state) => ({
    connections: [conn, ...state.connections]
  })),

  removeConnection: (id) => set((state) => ({
    connections: state.connections.filter(c => c.id !== id)
  })),

  updateConnection: (conn) => set((state) => ({
    connections: state.connections.map(c => c.id === conn.id ? conn : c)
  })),

  // 表信息缓存方法
  setTablesCache: (connectionId, dbName, tables) => set((state) => ({
    tablesCache: {
      ...state.tablesCache,
      [`${connectionId}-${dbName}`]: tables
    }
  })),

  getTablesCache: (connectionId, dbName) => {
    const state = get();
    return state.tablesCache[`${connectionId}-${dbName}`];
  },

  clearTablesCache: (connectionId, dbName) => set((state) => {
    const newCache = { ...state.tablesCache };
    delete newCache[`${connectionId}-${dbName}`];
    return { tablesCache: newCache };
  }),

  // 表信息加载状态方法
  setTablesLoading: (connectionId, dbName, loading) => set((state) => ({
    tablesLoading: {
      ...state.tablesLoading,
      [`${connectionId}-${dbName}`]: loading
    }
  })),

  isTablesLoading: (connectionId, dbName) => {
    const state = get();
    return state.tablesLoading[`${connectionId}-${dbName}`] ?? false;
  }
}));
