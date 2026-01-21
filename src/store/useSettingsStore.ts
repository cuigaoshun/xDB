import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Redis 视图偏好设置
export interface RedisViewPreference {
  viewMode: 'list' | 'tree';
  delimiter: string;
}

export interface Settings {
  // Redis settings
  redisScanCount: number;
  // Redis 视图偏好: key 格式为 `${connectionId}:${db}`
  redisViewPreferences: Record<string, RedisViewPreference>;
  // Redis 搜索历史: key 格式为 `${connectionId}:${db}`, 值为最近10条搜索记录
  redisSearchHistory: Record<string, string[]>;
}

interface SettingsState extends Settings {
  setRedisScanCount: (count: number) => void;
  resetSettings: () => void;
  // Redis 视图偏好方法
  getRedisViewPreference: (connectionId: number, db: number) => RedisViewPreference;
  setRedisViewMode: (connectionId: number, db: number, mode: 'list' | 'tree') => void;
  setRedisDelimiter: (connectionId: number, db: number, delimiter: string) => void;
  // Redis 搜索历史方法
  getRedisSearchHistory: (connectionId: number, db: number) => string[];
  addRedisSearchHistory: (connectionId: number, db: number, keyword: string) => void;
  clearRedisSearchHistory: (connectionId: number, db: number) => void;
}

const defaultViewPreference: RedisViewPreference = {
  viewMode: 'list',
  delimiter: ':',
};

const defaultSettings: Settings = {
  redisScanCount: 1000,
  redisViewPreferences: {},
  redisSearchHistory: {},
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      setRedisScanCount: (count) => set({ redisScanCount: count }),

      resetSettings: () => set(defaultSettings),

      // Redis 视图偏好方法
      getRedisViewPreference: (connectionId, db) => {
        const key = `${connectionId}:${db}`;
        return get().redisViewPreferences[key] ?? defaultViewPreference;
      },

      setRedisViewMode: (connectionId, db, mode) => {
        const key = `${connectionId}:${db}`;
        set((state) => ({
          redisViewPreferences: {
            ...state.redisViewPreferences,
            [key]: {
              ...defaultViewPreference,
              ...state.redisViewPreferences[key],
              viewMode: mode,
            },
          },
        }));
      },

      setRedisDelimiter: (connectionId, db, delimiter) => {
        const key = `${connectionId}:${db}`;
        set((state) => ({
          redisViewPreferences: {
            ...state.redisViewPreferences,
            [key]: {
              ...defaultViewPreference,
              ...state.redisViewPreferences[key],
              delimiter,
            },
          },
        }));
      },

      // Redis 搜索历史方法
      getRedisSearchHistory: (connectionId, db) => {
        const key = `${connectionId}:${db}`;
        return get().redisSearchHistory[key] ?? [];
      },

      addRedisSearchHistory: (connectionId, db, keyword) => {
        if (!keyword.trim()) return;
        const key = `${connectionId}:${db}`;
        set((state) => {
          const currentHistory = state.redisSearchHistory[key] ?? [];
          // 去重：移除已存在的相同关键词
          const filtered = currentHistory.filter((item) => item !== keyword);
          // 添加到头部，保留最多10条
          const newHistory = [keyword, ...filtered].slice(0, 10);
          return {
            redisSearchHistory: {
              ...state.redisSearchHistory,
              [key]: newHistory,
            },
          };
        });
      },

      clearRedisSearchHistory: (connectionId, db) => {
        const key = `${connectionId}:${db}`;
        set((state) => ({
          redisSearchHistory: {
            ...state.redisSearchHistory,
            [key]: [],
          },
        }));
      },
    }),
    {
      name: 'neodb-settings',
    }
  )
);
