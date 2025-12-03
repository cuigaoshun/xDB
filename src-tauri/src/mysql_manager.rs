use crate::db::DbState;
use crate::models::Connection;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::mysql::{MySqlPoolOptions, MySqlRow};
use sqlx::{Column, MySqlPool, Row, TypeInfo};
use tauri::{State, command};

#[derive(Debug, Serialize, Deserialize)]
pub struct SqlResult {
    pub columns: Vec<String>,
    pub rows: Vec<Map<String, Value>>,
    pub affected_rows: u64,
}

// 辅助函数：获取或创建 MySQL 连接池
async fn get_or_create_pool(
    app_state: &State<'_, AppState>,
    db_state: &State<'_, DbState>,
    connection_id: i64,
) -> Result<MySqlPool, String> {
    // 1. 先检查缓存中是否已有连接池
    {
        let pools = app_state.pools.lock().await;
        if let Some(pool) = pools.get(&connection_id) {
            // 简单的健康检查，如果连接已关闭则需要重新创建
            if !pool.is_closed() {
                return Ok(pool.clone());
            }
        }
    }

    // 2. 如果没有或已关闭，从 SQLite 读取连接配置
    // 这里我们需要调用之前定义的 get_connection_by_id 逻辑，或者直接查询
    // 为了解耦，我们直接查询 SQLite
    let connection = sqlx::query_as::<_, Connection>(
        "SELECT id, name, db_type, host, port, username, password, database, created_at FROM connections WHERE id = ?",
    )
    .bind(connection_id)
    .fetch_optional(&db_state.pool)
    .await
    .map_err(|e| format!("Failed to fetch connection info: {}", e))?
    .ok_or("Connection not found")?;

    if connection.db_type != "mysql" {
        return Err("Only MySQL is supported for now".to_string());
    }

    // 3. 构建 MySQL 连接字符串
    // mysql://user:password@host:port/database
    let host = connection.host.unwrap_or_else(|| "localhost".to_string());
    let port = connection.port.unwrap_or(3306);
    let username = connection.username.unwrap_or_else(|| "root".to_string());
    let password = connection.password.unwrap_or_default();
    let database = connection.database.unwrap_or_default();

    let url = format!(
        "mysql://{}:{}@{}:{}/{}",
        username, password, host, port, database
    );

    // 4. 创建连接池
    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .map_err(|e| format!("Failed to connect to MySQL: {}", e))?;

    // 5. 存入缓存
    let mut pools = app_state.pools.lock().await;
    pools.insert(connection_id, pool.clone());

    Ok(pool)
}

// 将 MySQL 的 Row 转换为 JSON Object
fn row_to_json(row: &MySqlRow) -> Map<String, Value> {
    let mut json_row = Map::new();

    for (i, column) in row.columns().iter().enumerate() {
        let name = column.name();
        let type_info = column.type_info();
        let type_name = type_info.name();

        // 根据类型动态获取值
        // 注意：这里只覆盖了常见类型，更复杂的类型可能需要额外处理
        let value: Value = match type_name {
            "BOOLEAN" | "TINYINT" => {
                 // SQLx 可能会把 TINYINT(1) 映射为 boolean 或 i8
                 if let Ok(v) = row.try_get::<bool, _>(i) {
                     Value::Bool(v)
                 } else {
                     row.try_get::<i8, _>(i).map(|v| Value::Number(v.into())).unwrap_or(Value::Null)
                 }
            },
            "SMALLINT" => row.try_get::<i16, _>(i).map(|v| Value::Number(v.into())).unwrap_or(Value::Null),
            "INT" | "INTEGER" => row.try_get::<i32, _>(i).map(|v| Value::Number(v.into())).unwrap_or(Value::Null),
            "BIGINT" => row.try_get::<i64, _>(i).map(|v| Value::Number(v.into())).unwrap_or(Value::Null),
            "FLOAT" => row.try_get::<f32, _>(i).map(|v| Value::from(v)).unwrap_or(Value::Null),
            "DOUBLE" | "REAL" => row.try_get::<f64, _>(i).map(|v| Value::from(v)).unwrap_or(Value::Null),
            "VARCHAR" | "CHAR" | "TEXT" | "TINYTEXT" | "MEDIUMTEXT" | "LONGTEXT" | "ENUM" => {
                row.try_get::<String, _>(i).map(Value::String).unwrap_or(Value::Null)
            },
            "DATETIME" | "TIMESTAMP" => {
                // 使用 chrono 处理时间，转为字符串 ISO 8601
                row.try_get::<chrono::NaiveDateTime, _>(i).map(|v| Value::String(v.to_string())).unwrap_or(Value::Null)
            },
            "DATE" => {
                row.try_get::<chrono::NaiveDate, _>(i).map(|v| Value::String(v.to_string())).unwrap_or(Value::Null)
            },
            "TIME" => {
                row.try_get::<chrono::NaiveTime, _>(i).map(|v| Value::String(v.to_string())).unwrap_or(Value::Null)
            },
            _ => {
                // 默认尝试作为字符串获取，或者返回 Null
                 match row.try_get::<String, _>(i) {
                     Ok(v) => Value::String(v),
                     Err(_) => Value::Null
                 }
            }
        };

        json_row.insert(name.to_string(), value);
    }

    json_row
}

#[command]
pub async fn execute_sql(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    sql: String,
) -> Result<SqlResult, String> {
    let pool = get_or_create_pool(&app_state, &db_state, connection_id).await?;

    // 判断是查询还是执行
    let sql_upper = sql.trim().to_uppercase();
    if sql_upper.starts_with("SELECT") || sql_upper.starts_with("SHOW") || sql_upper.starts_with("DESCRIBE") || sql_upper.starts_with("EXPLAIN") {
        let rows = sqlx::query(&sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Query execution failed: {}", e))?;

        let mut columns = Vec::new();
        let mut result_rows = Vec::new();

        if let Some(first_row) = rows.first() {
            for col in first_row.columns() {
                columns.push(col.name().to_string());
            }
        }

        for row in rows {
            result_rows.push(row_to_json(&row));
        }
        
        // println!("Result rows: {:?}", result_rows);

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
