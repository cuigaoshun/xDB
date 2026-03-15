/**
 * Workspace 相关常量
 */

/** 默认分页大小 */
export const DEFAULT_PAGE_SIZE = 20;

/** 防抖延迟时间 (ms) */
export const DEBOUNCE_DELAY = 500;

/** Redis key 项目高度 (px) */
export const KEY_ITEM_HEIGHT = 52;

/** Redis 默认 scan count */
export const DEFAULT_REDIS_SCAN_COUNT = 100;

/** 最大历史记录数量 */
export const MAX_HISTORY_COUNT = 10;

/**
 * SQL 操作符列表
 */
export const SQL_OPERATORS = [
    { label: '=', value: '=' },
    { label: '!=', value: '!=' },
    { label: '>', value: '>' },
    { label: '>=', value: '>=' },
    { label: '<', value: '<' },
    { label: '<=', value: '<=' },
    { label: 'LIKE', value: 'LIKE' },
    { label: 'NOT LIKE', value: 'NOT LIKE' },
    { label: 'IN', value: 'IN' },
    { label: 'IS NULL', value: 'IS NULL' },
    { label: 'IS NOT NULL', value: 'IS NOT NULL' },
] as const;

/**
 * 数据库类型颜色映射
 */
export const DB_TYPE_COLORS = {
    mysql: 'bg-blue-100 text-blue-600',
    redis: 'bg-red-100 text-red-600',
    sqlite: 'bg-green-100 text-green-600',
    postgres: 'bg-indigo-100 text-indigo-600',
    memcached: 'bg-orange-100 text-orange-600',
    default: 'bg-gray-100 text-gray-600',
} as const;

/**
 * Redis 数据类型颜色映射
 */
export const REDIS_TYPE_COLORS = {
    string: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200',
    hash: 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200',
    list: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200',
    set: 'bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200',
    zset: 'bg-pink-100 text-pink-700 hover:bg-pink-200 border-pink-200',
    default: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200',
} as const;
