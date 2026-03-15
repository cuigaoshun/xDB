import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import type { Connection, ConnectionGroup } from '@/store/useAppStore';

let db: Database | null = null;

/**
 * 获取本地 SQLite 数据库连接（单例）
 * 通过 invoke 从 Rust 端获取数据库绝对路径，确保前后端一致
 * 注意：表的创建和迁移由 Tauri SQL 插件自动处理
 */
async function getDb(): Promise<Database> {
    if (!db) {
        const dbPath = await invoke<string>('get_db_path');
        db = await Database.load(`sqlite:${dbPath}`);
    }
    return db;
}

/**
 * 查询所有连接，按 sort_order 升序、created_at 降序
 */
export async function getAllConnections(): Promise<Connection[]> {
    const database = await getDb();
    const rows = await database.select<Connection[]>(
        'SELECT id, name, db_type, host, port, username, password, database, created_at, sort_order, group_id FROM connections ORDER BY sort_order ASC, created_at DESC'
    );
    return rows;
}

/**
 * 创建新连接
 */
export async function createConnection(data: Omit<Connection, 'id' | 'created_at'>): Promise<void> {
    const database = await getDb();
    await database.execute(
        'INSERT INTO connections (name, db_type, host, port, username, password, database, group_id, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [data.name, data.db_type, data.host ?? null, data.port ?? null, data.username ?? null, data.password ?? null, data.database ?? null, data.group_id ?? null, data.sort_order ?? 0]
    );
}

/**
 * 更新连接（全量更新非空字段）
 */
export async function updateConnection(data: { id: number } & Partial<Omit<Connection, 'id' | 'created_at'>>): Promise<void> {
    const database = await getDb();
    await database.execute(
        `UPDATE connections
         SET name = COALESCE($1, name),
             db_type = COALESCE($2, db_type),
             host = COALESCE($3, host),
             port = COALESCE($4, port),
             username = COALESCE($5, username),
             password = COALESCE($6, password),
             database = COALESCE($7, database),
             group_id = $8
         WHERE id = $9`,
        [data.name ?? null, data.db_type ?? null, data.host ?? null, data.port ?? null, data.username ?? null, data.password ?? null, data.database ?? null, data.group_id !== undefined ? data.group_id : null, data.id]
    );
}

/**
 * 删除连接
 */
export async function deleteConnection(id: number): Promise<void> {
    const database = await getDb();
    await database.execute('DELETE FROM connections WHERE id = $1', [id]);
}

/**
 * 批量更新排序
 */
export async function updateConnectionsSortOrder(orders: [number, number][]): Promise<void> {
    const database = await getDb();
    for (const [id, order] of orders) {
        await database.execute('UPDATE connections SET sort_order = $1 WHERE id = $2', [order, id]);
    }
}

/**
 * 查询所有连接分组，按 sort_order 升序、created_at 降序
 */
export async function getAllConnectionGroups(): Promise<ConnectionGroup[]> {
    const database = await getDb();
    const rows = await database.select<ConnectionGroup[]>(
        'SELECT id, name, description, color, sort_order, created_at FROM connection_groups ORDER BY sort_order ASC, created_at DESC'
    );
    return rows;
}

/**
 * 创建新分组
 */
export async function createConnectionGroup(data: Omit<ConnectionGroup, 'id' | 'created_at'>): Promise<void> {
    const database = await getDb();
    await database.execute(
        'INSERT INTO connection_groups (name, description, color, sort_order) VALUES ($1, $2, $3, $4)',
        [data.name, data.description ?? null, data.color, data.sort_order]
    );
}

/**
 * 更新分组
 */
export async function updateConnectionGroup(data: ConnectionGroup): Promise<void> {
    const database = await getDb();
    await database.execute(
        `UPDATE connection_groups 
         SET name = $1, 
             description = $2, 
             color = $3, 
             sort_order = $4 
         WHERE id = $5`,
        [data.name, data.description ?? null, data.color, data.sort_order, data.id]
    );

    // 验证更新是否成功
    await database.select<ConnectionGroup[]>(
        'SELECT * FROM connection_groups WHERE id = $1',
        [data.id]
    );
}

/**
 * 删除分组
 */
export async function deleteConnectionGroup(id: number): Promise<void> {
    const database = await getDb();
    await database.execute('DELETE FROM connection_groups WHERE id = $1', [id]);
}

/**
 * 批量更新分组排序
 */
export async function updateGroupsSortOrder(orders: [number, number][]): Promise<void> {
    const database = await getDb();
    for (const [id, order] of orders) {
        await database.execute('UPDATE connection_groups SET sort_order = $1 WHERE id = $2', [order, id]);
    }
}
