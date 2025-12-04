use crate::db::DbState;
use crate::models::Connection;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::sqlite::{SqlitePoolOptions, SqliteRow};
use sqlx::{Column, SqlitePool, Row, TypeInfo};
use tauri::{State, command};

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub type_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SqlResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Map<String, Value>>,
    pub affected_rows: u64,
}

// 辅助函数：获取或创建 SQLite 连接池
async fn get_or_create_pool(
    app_state: &State<'_, AppState>,
    db_state: &State<'_, DbState>,
    connection_id: i64,
) -> Result<SqlitePool, String> {
    // 1. 先检查缓存中是否已有连接池
    {
        let pools = app_state.sqlite_pools.lock().await;
        if let Some(pool) = pools.get(&connection_id) {
            if !pool.is_closed() {
                return Ok(pool.clone());
            }
        }
    }

    // 2. 从 SQLite 读取连接配置
    let connection = sqlx::query_as::<_, Connection>(
        "SELECT id, name, db_type, host, port, username, password, database, created_at FROM connections WHERE id = ?",
    )
    .bind(connection_id)
    .fetch_optional(&db_state.pool)
    .await
    .map_err(|e| format!("Failed to fetch connection info: {}", e))?
    .ok_or("Connection not found")?;

    if connection.db_type != "sqlite" {
        return Err("Only SQLite is supported for this operation".to_string());
    }

    // 3. 构建 SQLite 连接字符串
    // connection.database 存储文件路径
    let db_path = connection.database.ok_or("Database path is required")?;
    let url = format!("sqlite://{}", db_path);

    // 4. 创建连接池
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .map_err(|e| format!("Failed to connect to SQLite: {}", e))?;

    // 5. 存入缓存
    let mut pools = app_state.sqlite_pools.lock().await;
    pools.insert(connection_id, pool.clone());

    Ok(pool)
}

// 将 SQLite 的 Row 转换为 JSON Object
fn row_to_json(row: &SqliteRow) -> Map<String, Value> {
    let mut json_row = Map::new();

    for (i, column) in row.columns().iter().enumerate() {
        let name = column.name();
        let type_info = column.type_info();
        let type_name = type_info.name();

        // SQLite 类型比较简单: NULL, INTEGER, REAL, TEXT, BLOB
        // sqlx 映射:
        // INTEGER -> i64, i32, i16, i8, bool
        // REAL -> f64
        // TEXT -> String
        
        // 注意：SQLite 是弱类型，type_name 可能是建表时指定的类型，也可能是实际存储类型
        
        let value: Value = match type_name {
            "NULL" => Value::Null,
            "INTEGER" => {
                // Try as i64 first
                if let Ok(v) = row.try_get::<i64, _>(i) {
                    Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<bool, _>(i) {
                    Value::Bool(v)
                } else {
                    Value::Null
                }
            },
            "REAL" => {
                if let Ok(v) = row.try_get::<f64, _>(i) {
                    Value::from(v)
                } else {
                    Value::Null
                }
            },
            "TEXT" => {
                row.try_get::<String, _>(i).map(Value::String).unwrap_or(Value::Null)
            },
            "BLOB" => {
                // Blob 暂不显示或显示占位符
                Value::String("<BLOB>".to_string())
            },
            _ => {
                // Fallback strategies for other declared types (e.g. VARCHAR, DATETIME) which are stored as TEXT or INTEGER or REAL in SQLite
                
                // Try common types
                if let Ok(v) = row.try_get::<i64, _>(i) {
                    Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<f64, _>(i) {
                    Value::from(v)
                } else if let Ok(v) = row.try_get::<String, _>(i) {
                    Value::String(v)
                } else {
                    Value::Null
                }
            }
        };

        json_row.insert(name.to_string(), value);
    }

    json_row
}

#[command]
pub async fn execute_sqlite_sql(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    sql: String,
) -> Result<SqlResult, String> {
    let pool = get_or_create_pool(&app_state, &db_state, connection_id).await?;

    let sql_upper = sql.trim().to_uppercase();
    if sql_upper.starts_with("SELECT") || sql_upper.starts_with("PRAGMA") || sql_upper.starts_with("EXPLAIN") {
        let rows = sqlx::query(&sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Query execution failed: {}", e))?;

        let mut columns = Vec::new();
        let mut result_rows = Vec::new();

        if let Some(first_row) = rows.first() {
            for col in first_row.columns() {
                columns.push(ColumnInfo {
                    name: col.name().to_string(),
                    type_name: col.type_info().name().to_string(),
                });
            }
        }

        for row in rows {
            result_rows.push(row_to_json(&row));
        }
        
        Ok(SqlResult {
            columns,
            rows: result_rows,
            affected_rows: 0,
        })
    } else {
        let result = sqlx::query(&sql)
            .execute(&pool)
            .await
            .map_err(|e| format!("Statement execution failed: {}", e))?;

        Ok(SqlResult {
            columns: vec![],
            rows: vec![],
            affected_rows: result.rows_affected(),
        })
    }
}
