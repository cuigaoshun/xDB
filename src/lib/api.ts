import { invoke } from '@tauri-apps/api/core';
import { executeWithLogging } from './commandLogger';

export async function invokeRedisCommand<T = any>(
    payload: { connectionId: number, db?: number, command: string, args?: any[], noLog?: boolean }
): Promise<T> {
    const { noLog, ...tauriPayload } = payload;
    const commandStr = `${tauriPayload.command} ${(tauriPayload.args || []).join(' ')}`.trim();

    if (noLog) {
        return invoke<T>("execute_redis_command", tauriPayload);
    }

    return executeWithLogging('redis', commandStr, () =>
        invoke<T>("execute_redis_command", tauriPayload)
    );
}

export async function invokeRedisPipeline<T = any>(
    payload: { connectionId: number, db?: number, commands: Array<{ command: string, args: string[] }>, noLog?: boolean }
): Promise<T> {
    const { noLog, ...tauriPayload } = payload;
    const commandStr = `[PIPELINE] ${payload.commands.map(c => `${c.command} ${c.args.join(' ')}`).join(' | ')}`.trim();

    if (noLog) {
        return invoke<T>("execute_redis_pipeline", tauriPayload);
    }

    return executeWithLogging('redis', commandStr, () =>
        invoke<T>("execute_redis_pipeline", tauriPayload)
    );
}

export async function invokeGetKeysDetails<T = any>(
    payload: { connectionId: number, keys: string[], db?: number }
): Promise<T> {
    const commandStr = `[PIPELINE] TYPE, TTL, DBSIZE ${payload.keys.join(' ')}`;
    return executeWithLogging('redis', commandStr, () =>
        invoke<T>("get_keys_details", payload)
    );
}

export async function invokeGetRedisKeys<T = any>(
    payload: { connectionId: number, cursor: string, count: number, pattern: string, db?: number }
): Promise<T> {
    const commandStr = `SCAN ${payload.cursor} MATCH ${payload.pattern} COUNT ${payload.count}`;
    return executeWithLogging('redis', commandStr, () =>
        invoke<T>("get_redis_keys", payload)
    );
}

export async function invokeScanHashValues<T = any>(
    payload: { connectionId: number, key: string, cursor: string, count: number, pattern: string, db?: number }
): Promise<T> {
    const commandStr = `HSCAN ${payload.key} ${payload.cursor} MATCH ${payload.pattern} COUNT ${payload.count}`;
    return executeWithLogging('redis', commandStr, () =>
        invoke<T>("scan_hash_values", payload)
    );
}

export async function invokeScanSetMembers<T = any>(
    payload: { connectionId: number, key: string, cursor: string, count: number, pattern: string, db?: number }
): Promise<T> {
    const commandStr = `SSCAN ${payload.key} ${payload.cursor} MATCH ${payload.pattern} COUNT ${payload.count}`;
    return executeWithLogging('redis', commandStr, () =>
        invoke<T>("scan_set_members", payload)
    );
}

export async function invokeScanZsetMembers<T = any>(
    payload: { connectionId: number, key: string, cursor: string, count: number, pattern: string, db?: number }
): Promise<T> {
    const commandStr = `ZSCAN ${payload.key} ${payload.cursor} MATCH ${payload.pattern} COUNT ${payload.count}`;
    return executeWithLogging('redis', commandStr, () =>
        invoke<T>("scan_zset_members", payload)
    );
}

export async function invokeScanListValues<T = any>(
    payload: { connectionId: number, key: string, start: number, end: number, db?: number }
): Promise<T> {
    const commandStr = `LRANGE ${payload.key} ${payload.start} ${payload.end}`;
    return executeWithLogging('redis', commandStr, () =>
        invoke<T>("scan_list_values", payload)
    );
}

export async function invokeSql<T = any>(
    payload: { connectionId: number, sql: string, dbName?: string }
): Promise<T> {
    return executeWithLogging('mysql', payload.sql, () =>
        invoke<T>("execute_sql", payload)
    );
}

export async function invokeSqliteSql<T = any>(
    payload: { connectionId: number, sql: string, dbName?: string }
): Promise<T> {
    return executeWithLogging('sqlite', payload.sql, () =>
        invoke<T>("execute_sqlite_sql", payload)
    );
}

export async function invokeSetMemcached<T = any>(
    payload: { connectionId: number, key: string, value: string, ttl: number }
): Promise<T> {
    const commandStr = `SET ${payload.key} ${payload.value} (TTL: ${payload.ttl})`;
    return executeWithLogging('memcached', commandStr, () =>
        invoke<T>("set_memcached_value", payload)
    );
}

export async function invokeGetMemcached<T = any>(
    payload: { connectionId: number, key: string }
): Promise<T> {
    const commandStr = `GET ${payload.key}`;
    return executeWithLogging('memcached', commandStr, () =>
        invoke<T>("get_memcached_value", payload)
    );
}

export async function invokeDeleteMemcached<T = any>(
    payload: { connectionId: number, key: string }
): Promise<T> {
    const commandStr = `DELETE ${payload.key}`;
    return executeWithLogging('memcached', commandStr, () =>
        invoke<T>("delete_memcached_key", payload)
    );
}
