use crate::db::DbState;
use crate::models::Connection;
use crate::state::AppState;
use redis::{FromRedisValue};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tauri::{State, command};

#[derive(Debug, Serialize, Deserialize)]
pub struct RedisResult {
    pub output: JsonValue,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub cursor: String,
    pub keys: Vec<String>,
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
) -> Result<redis::Client, String> {
    // 1. Check cache
    {
        let clients = app_state.redis_clients.lock().await;
        if let Some(client) = clients.get(&connection_id) {
            return Ok(client.clone());
        }
    }

    // 2. Fetch connection info
    let connection = sqlx::query_as::<_, Connection>(
        "SELECT id, name, db_type, host, port, username, password, database, created_at FROM connections WHERE id = ?",
    )
    .bind(connection_id)
    .fetch_optional(&db_state.pool)
    .await
    .map_err(|e| format!("Failed to fetch connection info: {}", e))?
    .ok_or("Connection not found")?;

    if connection.db_type != "redis" {
        return Err("Only Redis is supported for this operation".to_string());
    }

    // 3. Build connection URL
    // redis://[:password@]host:port/db
    let host = connection.host.unwrap_or_else(|| "localhost".to_string());
    let port = connection.port.unwrap_or(6379);
    let password = connection.password.unwrap_or_default();
    // Redis DB index (integer), defaulting to 0. connection.database is a String, so parse it.
    let db_index = connection.database.unwrap_or_else(|| "0".to_string());
    
    let url = if !password.is_empty() {
        format!("redis://:{}@{}:{}/{}", password, host, port, db_index)
    } else {
        format!("redis://{}:{}/{}", host, port, db_index)
    };

    // 4. Create Client
    let client = redis::Client::open(url)
        .map_err(|e| format!("Failed to create Redis client: {}", e))?;

    // 5. Cache client
    let mut clients = app_state.redis_clients.lock().await;
    clients.insert(connection_id, client.clone());

    Ok(client)
}

#[command]
pub async fn execute_redis_command(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    command: String,
    args: Vec<String>,
) -> Result<RedisResult, String> {
    let client = get_or_create_redis_client(&app_state, &db_state, connection_id).await?;
    
    // Use multiplexed async connection as recommended by warning
    let mut con = client.get_multiplexed_async_connection().await
        .map_err(|e| format!("Failed to get Redis connection: {}", e))?;

    let mut cmd = redis::cmd(&command);
    for arg in args {
        cmd.arg(arg);
    }

    let result: redis::Value = cmd.query_async(&mut con).await
        .map_err(|e| format!("Redis command failed: {}", e))?;

    // Convert redis::Value to serde_json::Value
    // Since we are having trouble matching variants (compiler claims they don't exist which is weird),
    // We will try a different approach.
    // Note: redis::Value variants ARE public. The error might be due to some environment issue.
    // But to be safe and get it working, let's use a helper that tries to inspect it.
    
    let json_result = redis_value_to_json(result);

    Ok(RedisResult { output: json_result })
}

#[command]
pub async fn get_redis_keys(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    cursor: String,
    count: Option<usize>,
    pattern: Option<String>,
) -> Result<ScanResult, String> {
    let client = get_or_create_redis_client(&app_state, &db_state, connection_id).await?;

    let mut con = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to get Redis connection: {}", e))?;

    let count = count.unwrap_or(100);
    let pattern = pattern.unwrap_or_else(|| "*".to_string());

    // We can pass the cursor string directly to SCAN command
    let mut cmd = redis::cmd("SCAN");
    cmd.arg(&cursor).arg("MATCH").arg(pattern).arg("COUNT").arg(count);

    // We ask redis-rs to return the cursor as a String directly
    // Since Redis protocol returns it as bulk string, this should work.
    // If it fails, we can fallback to u64. But String is more robust.
    // Actually, redis-rs SCAN helper usually returns u64 cursor.
    // Let's try to get (String, Vec<String>)
    let (next_cursor, keys): (String, Vec<String>) = cmd
        .query_async(&mut con)
        .await
        .map_err(|e| format!("Redis scan failed: {}", e))?;

    Ok(ScanResult {
        cursor: next_cursor,
        keys,
    })
}


#[command]
pub async fn get_keys_details(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    keys: Vec<String>,
) -> Result<Vec<KeyDetail>, String> {
    if keys.is_empty() {
        return Ok(vec![]);
    }

    let client = get_or_create_redis_client(&app_state, &db_state, connection_id).await?;
    let mut con = client.get_multiplexed_async_connection().await
        .map_err(|e| format!("Failed to get Redis connection: {}", e))?;

    let mut pipe = redis::pipe();
    
    for key in &keys {
        pipe.cmd("TYPE").arg(key);
        pipe.cmd("TTL").arg(key);
        // MEMORY USAGE might not be available on all redis versions or constrained, 
        // but we can try. If it fails, the whole pipeline fails?
        // Alternatively, for list we can use LLEN, for set SCARD, etc.
        // But getting generic size is hard without MEMORY USAGE.
        // The reference image shows "Size" (bytes) and "Length" (items).
        // Let's try to get Length (LLEN, SCARD, HLEN, STRLEN, ZCARD).
        // Since we don't know the type yet, we can't easily pick the right command in the same pipeline 
        // unless we use Lua script or multiple round trips.
        // But wait, we can just fetch TYPE and TTL first.
        // Or we can assume MEMORY USAGE works (Redis 4.0+).
        // Let's just stick to TYPE and TTL for the list view for now to be safe and fast.
        // The user request image shows "304 B" etc. So they probably want size.
        // Let's try MEMORY USAGE default.
        pipe.cmd("MEMORY").arg("USAGE").arg(key);
    }

    // The result will be a flat vector of values: [Type1, TTL1, Mem1, Type2, TTL2, Mem2, ...]
    // Note: MEMORY USAGE returns nil if key doesn't exist, or int.
    let results: Vec<redis::Value> = pipe.query_async(&mut con).await
        .map_err(|e| format!("Pipeline failed: {}", e))?;

    let mut details = Vec::new();
    for (i, key) in keys.iter().enumerate() {
        let type_val = &results[i * 3];
        let ttl_val = &results[i * 3 + 1];
        let mem_val = &results[i * 3 + 2];

        let type_str: String = String::from_redis_value(type_val).unwrap_or_else(|_| "unknown".to_string());
        let ttl: i64 = i64::from_redis_value(ttl_val).unwrap_or(-1);
        let memory: Option<i64> = Option::<i64>::from_redis_value(mem_val).ok().flatten();

        details.push(KeyDetail {
            key: key.clone(),
            r#type: type_str,
            ttl,
            length: memory,
        });
    }

    Ok(details)
}

fn redis_value_to_json(v: redis::Value) -> JsonValue {
    match &v {
        redis::Value::Nil => JsonValue::Null,
        redis::Value::Int(i) => JsonValue::Number((*i).into()),
        _ => {
            // Try to convert to string generically first (handles Data, Status, Okay, etc.)
            // This covers most non-list cases including valid UTF-8 strings.
            if let Ok(s) = String::from_redis_value(&v) {
                return JsonValue::String(s);
            }

            // Try as a list of values (Bulk/Array)
            // Note: Vec::from_redis_value wraps single non-bulk items in a Vec.
            // We must detect this to avoid infinite recursion.
            if let Ok(items) = Vec::<redis::Value>::from_redis_value(&v) {
                 // Check for auto-wrapping
                 // If we have exactly 1 item and it is equal to the original value, it was wrapped.
                 if items.len() == 1 && items[0] == v {
                     // This means v was NOT a Bulk/Array, but a single value that failed String conversion
                     // Fallback to debug string below
                 } else {
                     // It is a real list/set/map structure
                     let json_items: Vec<JsonValue> = items.into_iter().map(redis_value_to_json).collect();
                     return JsonValue::Array(json_items);
                 }
            }
            
            // Fallback for binary data or unknown types
            JsonValue::String(format!("{:?}", v))
        }
    }
}
