use crate::db::DbState;
use crate::models::{ColumnInfo, Connection, SqlResult};
use crate::state::AppState;
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use rust_decimal::Decimal;
use serde_json::{Map, Value};
use sqlx::mysql::{MySqlPoolOptions, MySqlRow};
use sqlx::{Column, MySqlPool, Row, Statement, TypeInfo};
use tauri::{command, State};
use urlencoding::encode;

// 辅助函数：获取或创建 MySQL 连接池
async fn get_or_create_pool(
    app_state: &State<'_, AppState>,
    db_state: &State<'_, DbState>,
    connection_id: i64,
    db_name: Option<String>,
) -> Result<MySqlPool, String> {
    let cache_key = if let Some(ref db) = db_name {
        format!("{}:{}", connection_id, db)
    } else {
        connection_id.to_string()
    };

    {
        let pools = app_state.pools.lock().await;
        if let Some(pool) = pools.get(&cache_key) {
            if !pool.is_closed() {
                return Ok(pool.clone());
            }
        }
    }

    let connection = sqlx::query_as::<_, Connection>(
        "SELECT * FROM connections WHERE id = ?",
    )
    .bind(connection_id)
    .fetch_optional(&db_state.pool)
    .await
    .map_err(|e| format!("Failed to fetch connection info: {}", e))?
    .ok_or("Connection not found")?;

    if connection.db_type != "mysql" {
        return Err("Only MySQL is supported for now".to_string());
    }

    let host = connection.host.ok_or("Host is required")?;
    let port = connection.port.unwrap_or(3306);
    let username = connection.username.unwrap_or_else(|| "root".to_string());
    let password = connection.password.unwrap_or_default();
    let database_to_use = db_name.or(connection.database).unwrap_or_default();

    let url = format!(
        "mysql://{}:{}@{}:{}/{}",
        encode(&username), encode(&password), host, port, database_to_use
    );

    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .map_err(|e| format!("Failed to connect to MySQL: {}", e))?;

    let mut pools = app_state.pools.lock().await;
    pools.insert(cache_key, pool.clone());

    Ok(pool)
}

// 辅助：Vec<u8> 转字符串，非 UTF-8 则转 hex
fn bytes_to_value(v: Vec<u8>) -> Value {
    match String::from_utf8(v.clone()) {
        Ok(s) => Value::String(s),
        Err(_) => {
            let hex: String = v.iter().map(|b| format!("{:02X}", b)).collect();
            Value::String(format!("0x{}", hex))
        }
    }
}

// 辅助：解析 MySQL 内部几何格式 (4字节SRID + WKB) → WKT 可读文本
fn geometry_bytes_to_wkt(data: &[u8]) -> String {
    if data.len() < 9 {
        return format!(
            "0x{}",
            data.iter()
                .map(|b| format!("{:02X}", b))
                .collect::<String>()
        );
    }
    // 跳过 4 字节 SRID
    let wkb = &data[4..];
    wkb_to_wkt(wkb).unwrap_or_else(|| {
        format!(
            "0x{}",
            data.iter()
                .map(|b| format!("{:02X}", b))
                .collect::<String>()
        )
    })
}

fn read_f64_le(data: &[u8], offset: usize) -> Option<f64> {
    if offset + 8 > data.len() {
        return None;
    }
    Some(f64::from_le_bytes(
        data[offset..offset + 8].try_into().ok()?,
    ))
}

fn read_u32_le(data: &[u8], offset: usize) -> Option<u32> {
    if offset + 4 > data.len() {
        return None;
    }
    Some(u32::from_le_bytes(
        data[offset..offset + 4].try_into().ok()?,
    ))
}

fn wkb_to_wkt(wkb: &[u8]) -> Option<String> {
    if wkb.is_empty() {
        return None;
    }
    // byte 0: byte order (0x01=LE, 0x00=BE), 只处理 LE
    if wkb[0] != 0x01 {
        return None;
    }
    let geom_type = read_u32_le(wkb, 1)?;
    match geom_type {
        1 => {
            // Point
            let x = read_f64_le(wkb, 5)?;
            let y = read_f64_le(wkb, 13)?;
            Some(format!("POINT({} {})", x, y))
        }
        2 => {
            // LineString
            let n = read_u32_le(wkb, 5)? as usize;
            let mut pts = Vec::with_capacity(n);
            for i in 0..n {
                let off = 9 + i * 16;
                let x = read_f64_le(wkb, off)?;
                let y = read_f64_le(wkb, off + 8)?;
                pts.push(format!("{} {}", x, y));
            }
            Some(format!("LINESTRING({})", pts.join(",")))
        }
        3 => {
            // Polygon
            let num_rings = read_u32_le(wkb, 5)? as usize;
            let mut rings = Vec::new();
            let mut off = 9;
            for _ in 0..num_rings {
                let n = read_u32_le(wkb, off)? as usize;
                off += 4;
                let mut pts = Vec::with_capacity(n);
                for _ in 0..n {
                    let x = read_f64_le(wkb, off)?;
                    let y = read_f64_le(wkb, off + 8)?;
                    pts.push(format!("{} {}", x, y));
                    off += 16;
                }
                rings.push(format!("({})", pts.join(",")));
            }
            Some(format!("POLYGON({})", rings.join(",")))
        }
        _ => None, // 其他复杂几何类型暂不解析
    }
}

// 将 MySQL 的 Row 转换为 JSON Object，按类型分组精确解码
fn row_to_json(row: &MySqlRow) -> Map<String, Value> {
    let mut json_row = Map::new();

    for (i, column) in row.columns().iter().enumerate() {
        let name = column.name();
        let type_name = column.type_info().name();

        let value: Value = match type_name {
            // 有符号整数
            "BOOLEAN" | "TINYINT" => row
                .try_get::<i8, _>(i)
                .map(|v| Value::Number(v.into()))
                .unwrap_or(Value::Null),
            "SMALLINT" => row
                .try_get::<i16, _>(i)
                .map(|v| Value::Number(v.into()))
                .unwrap_or(Value::Null),
            "MEDIUMINT" | "INT" | "INTEGER" => row
                .try_get::<i32, _>(i)
                .map(|v| Value::Number(v.into()))
                .unwrap_or(Value::Null),
            "BIGINT" => row
                .try_get::<i64, _>(i)
                .map(|v| Value::String(v.to_string()))
                .unwrap_or(Value::Null),
            // 无符号整数
            "TINYINT UNSIGNED" => row
                .try_get::<u8, _>(i)
                .map(|v| Value::Number(v.into()))
                .unwrap_or(Value::Null),
            "SMALLINT UNSIGNED" => row
                .try_get::<u16, _>(i)
                .map(|v| Value::Number(v.into()))
                .unwrap_or(Value::Null),
            "MEDIUMINT UNSIGNED" | "INT UNSIGNED" | "INTEGER UNSIGNED" => row
                .try_get::<u32, _>(i)
                .map(|v| Value::Number(v.into()))
                .unwrap_or(Value::Null),
            "BIGINT UNSIGNED" => row
                .try_get::<u64, _>(i)
                .map(|v| Value::String(v.to_string()))
                .unwrap_or(Value::Null),
            // 浮点
            "FLOAT" => row
                .try_get::<f32, _>(i)
                .map(|v| {
                    v.to_string()
                        .parse::<f64>()
                        .ok()
                        .map(Value::from)
                        .unwrap_or(Value::Null)
                })
                .unwrap_or(Value::Null),
            "DOUBLE" | "REAL" => row
                .try_get::<f64, _>(i)
                .map(Value::from)
                .unwrap_or(Value::Null),
            // 高精度 → 字符串保精度
            "DECIMAL" | "NEWDECIMAL" => row
                .try_get::<Decimal, _>(i)
                .map(|v| Value::String(v.to_string()))
                .or_else(|_| row.try_get::<String, _>(i).map(Value::String))
                .unwrap_or(Value::Null),
            // 字符串族
            "VARCHAR" | "CHAR" | "TEXT" | "TINYTEXT" | "MEDIUMTEXT" | "LONGTEXT" | "ENUM"
            | "SET" => row
                .try_get::<String, _>(i)
                .map(Value::String)
                .unwrap_or(Value::Null),
            // 日期时间
            "DATETIME" | "TIMESTAMP" => row
                .try_get::<NaiveDateTime, _>(i)
                .map(|v| Value::String(v.to_string()))
                .or_else(|_| {
                    row.try_get::<DateTime<Utc>, _>(i)
                        .map(|v| Value::String(v.naive_utc().to_string()))
                })
                .unwrap_or(Value::Null),
            "DATE" => row
                .try_get::<NaiveDate, _>(i)
                .map(|v| Value::String(v.to_string()))
                .unwrap_or(Value::Null),
            "TIME" => row
                .try_get::<NaiveTime, _>(i)
                .map(|v| Value::String(v.to_string()))
                .unwrap_or(Value::Null),
            "YEAR" => row
                .try_get::<i16, _>(i)
                .map(|v| Value::Number(v.into()))
                .or_else(|_| row.try_get::<u16, _>(i).map(|v| Value::Number(v.into())))
                .unwrap_or(Value::Null),
            // JSON → 直接传原生 JSON
            "JSON" => row.try_get::<Value, _>(i).unwrap_or(Value::Null),
            // BINARY 定长：去掉尾部 \0 补齐再转换
            "BINARY" => row
                .try_get::<Vec<u8>, _>(i)
                .map(|v| {
                    let trimmed: Vec<u8> = v
                        .into_iter()
                        .rev()
                        .skip_while(|&b| b == 0)
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect();
                    bytes_to_value(trimmed)
                })
                .unwrap_or(Value::Null),
            // 变长二进制族
            "VARBINARY" | "BLOB" | "TINYBLOB" | "MEDIUMBLOB" | "LONGBLOB" => row
                .try_get::<Vec<u8>, _>(i)
                .map(bytes_to_value)
                .unwrap_or(Value::Null),
            // BIT → 二进制字符串
            "BIT" => row
                .try_get::<Vec<u8>, _>(i)
                .map(|v| {
                    Value::String(
                        v.iter()
                            .map(|b| format!("{:08b}", b))
                            .collect::<Vec<_>>()
                            .join(""),
                    )
                })
                .or_else(|_| {
                    row.try_get::<u64, _>(i)
                        .map(|v| Value::String(format!("{:b}", v)))
                })
                .unwrap_or(Value::Null),
            // 未知类型：逐个尝试
            _ => {
                let upper = type_name.to_uppercase();
                if upper.contains("GEOMETRY")
                    || upper.contains("POINT")
                    || upper.contains("POLYGON")
                    || upper.contains("LINESTRING")
                {
                    // 空间类型：用 try_get_unchecked 绕过 sqlx 类型校验，解析为 WKT 文本
                    row.try_get_unchecked::<Vec<u8>, _>(i)
                        .map(|v| Value::String(geometry_bytes_to_wkt(&v)))
                        .unwrap_or(Value::Null)
                } else {
                    row.try_get::<String, _>(i)
                        .map(Value::String)
                        .or_else(|_| row.try_get::<i64, _>(i).map(|v| Value::Number(v.into())))
                        .or_else(|_| row.try_get::<f64, _>(i).map(Value::from))
                        .or_else(|_| row.try_get::<Vec<u8>, _>(i).map(bytes_to_value))
                        .unwrap_or(Value::Null)
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
    db_name: Option<String>,
) -> Result<SqlResult, String> {
    // Use the db_name to get/create a pool connected to that specific DB
    let pool = get_or_create_pool(&app_state, &db_state, connection_id, db_name.clone()).await?;

    // Explicitly acquire connection?
    // Actually, if the POOL is already connected to the right DB, we don't need to manually acquire and USE.
    // However, execute_sql normally used `pool` directly.
    // Let's use `pool` directly unless we really want a transaction or something.
    // But wait, user queries might affect session state? usually fine.

    // No need to USE db;

    // 判断是查询还是执行
    let sql_upper = sql.trim().to_uppercase();
    if sql_upper.starts_with("SELECT")
        || sql_upper.starts_with("SHOW")
        || sql_upper.starts_with("DESCRIBE")
        || sql_upper.starts_with("EXPLAIN")
    {
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
        } else {
            // Try to prepare the statement to fetch column metadata if there are no rows
            if let Ok(stmt) = sqlx::Executor::prepare(&pool, sql.as_str()).await {
                for col in stmt.columns() {
                    columns.push(ColumnInfo {
                        name: col.name().to_string(),
                        type_name: col.type_info().name().to_string(),
                    });
                }
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
