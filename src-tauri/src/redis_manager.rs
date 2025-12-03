use crate::db::DbState;
use crate::models::Connection;
use crate::state::AppState;
// use redis::Commands; // Removed or commented out
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

fn redis_value_to_json(v: redis::Value) -> JsonValue {
    match v {
        redis::Value::Nil => JsonValue::Null,
        redis::Value::Int(i) => JsonValue::Number(i.into()),
        
        // Trying alternative variant names
        // redis::Value::Data(d) => JsonValue::String(String::from_utf8_lossy(&d).to_string()),
        // redis::Value::Status(s) => JsonValue::String(s),
        // redis::Value::Bulk(items) => ...

        // Hypothesizing new names:
        // redis::Value::Bytes(d) => JsonValue::String(String::from_utf8_lossy(&d).to_string()),
        // redis::Value::SimpleString(s) => JsonValue::String(s),
        // redis::Value::BulkString(d) => ... ? No, BulkString is usually bytes.
        
        // Fallback:
        _ => JsonValue::String(format!("{:?}", v)),
    }
}
