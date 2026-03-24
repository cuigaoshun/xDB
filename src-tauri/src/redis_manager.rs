use crate::db::DbState;
use crate::models::Connection;
use crate::state::AppState;
use redis::FromRedisValue;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::future::Future;
use tauri::{command, State};
use tokio::time::{timeout, Duration};
use urlencoding::encode;

const REDIS_COMMAND_TIMEOUT_SECS: u64 = 10;

#[derive(Debug, Serialize, Deserialize)]
pub struct RedisResult {
    pub output: JsonValue,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub cursor: String,
    pub keys: Vec<KeyDetail>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValueScanResult {
    pub cursor: String,
    pub values: Vec<JsonValue>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyDetail {
    pub key: String,
    pub r#type: String,
    pub ttl: i64,
    pub length: Option<i64>,
}

async fn get_or_create_redis_client(
    app_state: &State<'_, AppState>,
    db_state: &State<'_, DbState>,
    connection_id: i64,
    db: Option<u32>,
) -> Result<redis::Client, String> {
    // 1. If db is specified, check cache directly
    if let Some(db_index) = db {
        let key = format!("{}:{}", connection_id, db_index);
        let clients = app_state.redis_clients.lock().await;
        if let Some(client) = clients.get(&key) {
            return Ok(client.clone());
        }
    }

    // 2. Fetch connection info (needed for connection or to resolve default db)
    let connection = sqlx::query_as::<_, Connection>(
        "SELECT * FROM connections WHERE id = ?",
    )
    .bind(connection_id)
    .fetch_optional(&db_state.pool)
    .await
    .map_err(|e| format!("Failed to fetch connection info: {}", e))?
    .ok_or("Connection not found")?;

    if connection.db_type != "redis" {
        return Err("Only Redis is supported for this operation".to_string());
    }

    // 3. Resolve effective DB index
    let db_index = if let Some(db_idx) = db {
        db_idx
    } else {
        connection
            .database
            .as_deref()
            .unwrap_or("0")
            .parse::<u32>()
            .unwrap_or(0)
    };

    // 4. Check cache again with resolved db_index
    let key = format!("{}:{}", connection_id, db_index);
    {
        let clients = app_state.redis_clients.lock().await;
        if let Some(client) = clients.get(&key) {
            return Ok(client.clone());
        }
    }

    // 5. Build connection URL
    let host = connection.host.ok_or("Host is required")?;
    let port = connection.port.unwrap_or(6379);
    let password = connection.password.unwrap_or_default();

    let url = if !password.is_empty() {
        format!("redis://:{}@{}:{}/{}", encode(&password), host, port, db_index)
    } else {
        format!("redis://{}:{}/{}", host, port, db_index)
    };

    // 6. Create Client
    let client =
        redis::Client::open(url).map_err(|e| format!("Failed to create Redis client: {}", e))?;

    // 7. Cache client
    let mut clients = app_state.redis_clients.lock().await;
    clients.insert(key, client.clone());

    Ok(client)
}

async fn get_redis_connection_with_retry(
    client: &redis::Client,
) -> Result<redis::aio::MultiplexedConnection, String> {
    client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get Redis connection: {}", e))
}

async fn query_with_timeout<T, F>(future: F, context: &str) -> Result<T, String>
where
    F: Future<Output = Result<T, redis::RedisError>>,
{
    match timeout(Duration::from_secs(REDIS_COMMAND_TIMEOUT_SECS), future).await {
        Ok(result) => result.map_err(|e| format!("{} failed: {}", context, e)),
        Err(_) => Err(format!(
            "{} timed out after {}s",
            context, REDIS_COMMAND_TIMEOUT_SECS
        )),
    }
}

// 辅助函数：从 pipeline 结果解析 KeyDetail
fn parse_key_details_from_pipeline(keys: &[String], results: &[redis::Value]) -> Vec<KeyDetail> {
    keys.iter()
        .enumerate()
        .map(|(i, key)| {
            let type_val = &results[i * 3];
            let ttl_val = &results[i * 3 + 1];
            let mem_val = &results[i * 3 + 2];

            let type_str: String = String::from_redis_value(type_val.clone())
                .unwrap_or_else(|_| "unknown".to_string());
            let ttl: i64 = i64::from_redis_value(ttl_val.clone()).unwrap_or(-1);
            let memory: Option<i64> = Option::<i64>::from_redis_value(mem_val.clone())
                .ok()
                .flatten();

            KeyDetail {
                key: key.clone(),
                r#type: type_str,
                ttl,
                length: memory,
            }
        })
        .collect()
}

// 辅助函数：通用的 SCAN 类命令执行
async fn execute_scan_command(
    con: &mut redis::aio::MultiplexedConnection,
    scan_cmd: &str,
    key: &str,
    cursor: &str,
    pattern: &str,
    count: usize,
) -> Result<ValueScanResult, String> {
    let mut cmd = redis::cmd(scan_cmd);
    cmd.arg(key)
        .arg(cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(count);

    let (next_cursor, values): (String, Vec<redis::Value>) = query_with_timeout(
        cmd.query_async(con),
        &format!("Redis {}", scan_cmd),
    )
    .await?;

    let json_values: Vec<JsonValue> = values.into_iter().map(redis_value_to_json).collect();

    Ok(ValueScanResult {
        cursor: next_cursor,
        values: json_values,
    })
}

#[command]
pub async fn execute_redis_command(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    command: String,
    args: Vec<String>,
    db: Option<u32>,
) -> Result<RedisResult, String> {
    let client = get_or_create_redis_client(&app_state, &db_state, connection_id, db).await?;

    // Use multiplexed async connection as recommended by warning
    let mut con = get_redis_connection_with_retry(&client).await?;

    let mut cmd = redis::cmd(&command);
    for arg in args {
        cmd.arg(arg);
    }

    let result: redis::Value =
        query_with_timeout(cmd.query_async(&mut con), "Redis command").await?;

    let json_result = redis_value_to_json(result);

    Ok(RedisResult {
        output: json_result,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PipelineCommand {
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PipelineResult {
    pub outputs: Vec<JsonValue>,
}

#[command]
pub async fn execute_redis_pipeline(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    commands: Vec<PipelineCommand>,
    db: Option<u32>,
) -> Result<PipelineResult, String> {
    let client = get_or_create_redis_client(&app_state, &db_state, connection_id, db).await?;
    let mut con = get_redis_connection_with_retry(&client).await?;

    let mut pipe = redis::pipe();
    for cmd in &commands {
        let mut redis_cmd = redis::cmd(&cmd.command);
        for arg in &cmd.args {
            redis_cmd.arg(arg);
        }
        pipe.add_command(redis_cmd);
    }

    let results: Vec<redis::Value> =
        query_with_timeout(pipe.query_async(&mut con), "Pipeline").await?;

    let json_results: Vec<JsonValue> = results.into_iter().map(redis_value_to_json).collect();

    Ok(PipelineResult {
        outputs: json_results,
    })
}

#[command]
pub async fn get_redis_keys(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    cursor: String,
    count: Option<usize>,
    pattern: Option<String>,
    db: Option<u32>,
) -> Result<ScanResult, String> {
    let client = get_or_create_redis_client(&app_state, &db_state, connection_id, db).await?;

    let mut con = get_redis_connection_with_retry(&client).await?;

    let count = count.unwrap_or(100);
    let pattern = pattern.unwrap_or_else(|| "*".to_string());

    let mut cmd = redis::cmd("SCAN");
    cmd.arg(&cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(count);

    let (next_cursor, key_strings): (String, Vec<String>) =
        query_with_timeout(cmd.query_async(&mut con), "Redis scan").await?;

    // Fetch details pipeline if we have keys
    let details = if !key_strings.is_empty() {
        let mut pipe = redis::pipe();
        for key in &key_strings {
            pipe.cmd("TYPE").arg(key);
            pipe.cmd("TTL").arg(key);
            pipe.cmd("MEMORY").arg("USAGE").arg(key);
        }

        let results: Vec<redis::Value> =
            query_with_timeout(pipe.query_async(&mut con), "Pipeline").await?;

        parse_key_details_from_pipeline(&key_strings, &results)
    } else {
        Vec::new()
    };

    Ok(ScanResult {
        cursor: next_cursor,
        keys: details,
    })
}

#[command]
pub async fn get_keys_details(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    keys: Vec<String>,
    db: Option<u32>,
) -> Result<Vec<KeyDetail>, String> {
    if keys.is_empty() {
        return Ok(vec![]);
    }

    let client = get_or_create_redis_client(&app_state, &db_state, connection_id, db).await?;
    let mut con = get_redis_connection_with_retry(&client).await?;

    let mut pipe = redis::pipe();
    for key in &keys {
        pipe.cmd("TYPE").arg(key);
        pipe.cmd("TTL").arg(key);
        pipe.cmd("MEMORY").arg("USAGE").arg(key);
    }

    let results: Vec<redis::Value> =
        query_with_timeout(pipe.query_async(&mut con), "Pipeline").await?;

    Ok(parse_key_details_from_pipeline(&keys, &results))
}

#[command]
pub async fn scan_hash_values(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    key: String,
    cursor: String,
    count: Option<usize>,
    pattern: Option<String>,
    db: Option<u32>,
) -> Result<ValueScanResult, String> {
    let client = get_or_create_redis_client(&app_state, &db_state, connection_id, db).await?;
    let mut con = get_redis_connection_with_retry(&client).await?;
    execute_scan_command(
        &mut con,
        "HSCAN",
        &key,
        &cursor,
        &pattern.unwrap_or_else(|| "*".to_string()),
        count.unwrap_or(100),
    )
    .await
}

#[command]
pub async fn scan_set_members(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    key: String,
    cursor: String,
    count: Option<usize>,
    pattern: Option<String>,
    db: Option<u32>,
) -> Result<ValueScanResult, String> {
    let client = get_or_create_redis_client(&app_state, &db_state, connection_id, db).await?;
    let mut con = get_redis_connection_with_retry(&client).await?;
    execute_scan_command(
        &mut con,
        "SSCAN",
        &key,
        &cursor,
        &pattern.unwrap_or_else(|| "*".to_string()),
        count.unwrap_or(100),
    )
    .await
}

#[command]
pub async fn scan_zset_members(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    key: String,
    cursor: String,
    count: Option<usize>,
    pattern: Option<String>,
    db: Option<u32>,
) -> Result<ValueScanResult, String> {
    let client = get_or_create_redis_client(&app_state, &db_state, connection_id, db).await?;
    let mut con = get_redis_connection_with_retry(&client).await?;
    execute_scan_command(
        &mut con,
        "ZSCAN",
        &key,
        &cursor,
        &pattern.unwrap_or_else(|| "*".to_string()),
        count.unwrap_or(100),
    )
    .await
}

#[command]
pub async fn scan_list_values(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    key: String,
    start: i64,
    end: i64,
    db: Option<u32>,
) -> Result<RedisResult, String> {
    let client = get_or_create_redis_client(&app_state, &db_state, connection_id, db).await?;
    let mut con = get_redis_connection_with_retry(&client).await?;

    let mut cmd = redis::cmd("LRANGE");
    cmd.arg(&key).arg(start).arg(end);

    let result: redis::Value =
        query_with_timeout(cmd.query_async(&mut con), "Redis LRANGE").await?;

    let json_result = redis_value_to_json(result);

    Ok(RedisResult {
        output: json_result,
    })
}

fn redis_value_to_json(v: redis::Value) -> JsonValue {
    match &v {
        redis::Value::Nil => JsonValue::Null,
        redis::Value::Int(i) => JsonValue::Number((*i).into()),
        _ => {
            // Try to convert to string generically first (handles Data, Status, Okay, etc.)
            // This covers most non-list cases including valid UTF-8 strings.
            if let Ok(s) = String::from_redis_value(v.clone()) {
                return JsonValue::String(s);
            }

            // Try as a list of values (Bulk/Array)
            // Note: Vec::from_redis_value wraps single non-bulk items in a Vec.
            // We must detect this to avoid infinite recursion.
            if let Ok(items) = Vec::<redis::Value>::from_redis_value(v.clone()) {
                // Check for auto-wrapping
                // If we have exactly 1 item and it is equal to the original value, it was wrapped.
                if items.len() == 1 && items[0] == v {
                    // This means v was NOT a Bulk/Array, but a single value that failed String conversion
                    // Fallback to debug string below
                } else {
                    // It is a real list/set/map structure
                    let json_items: Vec<JsonValue> =
                        items.into_iter().map(redis_value_to_json).collect();
                    return JsonValue::Array(json_items);
                }
            }

            // Fallback for binary data or unknown types
            JsonValue::String(format!("{:?}", v))
        }
    }
}
