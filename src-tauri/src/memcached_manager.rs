use crate::db::DbState;
use crate::models::Connection;
use crate::state::AppState;
use memcache::Client;
use serde::{Deserialize, Serialize};
use tauri::{State, command};
use std::io::Read;
use flate2::read::ZlibDecoder;

#[derive(Debug, Serialize, Deserialize)]
pub struct MemcachedKey {
    pub key: String,
    pub size: u64,
    pub expiration: i64, // Unix timestamp
}

fn get_memcached_url(connection: &Connection) -> String {
    let host = connection.host.as_deref().unwrap_or("localhost");
    let port = connection.port.unwrap_or(11211);
    // memcache crate uses "memcache://host:port"
    format!("memcache://{}:{}", host, port)
}

// Helper to get client from cache or create new
// Note: memcache crate Client is synchronous. We might need to be careful.
// Ideally we should store it in AppState but the crate's Client might not be Clone or Send/Sync the way we want?
// memcache::Client is Send + Sync.
fn get_or_create_client(
    _app_state: &AppState,
    db_state: &DbState,
    connection_id: i64,
) -> Result<Client, String> {
    // Let's try to fetch connection details first
    let connection = tauri::async_runtime::block_on(async {
        sqlx::query_as::<_, Connection>(
            "SELECT id, name, db_type, host, port, username, password, database, created_at FROM connections WHERE id = ?",
        )
        .bind(connection_id)
        .fetch_optional(&db_state.pool)
        .await
    })
    .map_err(|e| format!("Failed to fetch connection info: {}", e))?
    .ok_or("Connection not found")?;

    if connection.db_type != "memcached" {
        return Err("Only Memcached is supported for this operation".to_string());
    }

    let url = get_memcached_url(&connection);
    let client = Client::connect(url).map_err(|e| format!("Failed to connect to Memcached: {}", e))?;
    
    Ok(client)
}

#[command]
pub async fn get_memcached_keys(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    filter: Option<String>,
) -> Result<Vec<MemcachedKey>, String> {
    // Since memcache ops are blocking, we use spawn_blocking
    let app_state_cloned = app_state.inner().clone();
    let db_state_cloned = db_state.inner().clone();
    
    // Check connection first using memcache crate
    tauri::async_runtime::spawn_blocking(move || {
        let client = get_or_create_client(&app_state_cloned, &db_state_cloned, connection_id)?;
        // Simple connectivity check
        client.stats().map_err(|e| format!("Failed to get stats: {}", e))?;
        Ok::<(), String>(())
    }).await.map_err(|e| e.to_string())??;
    
    // NOTE: Since `memcache` crate doesn't support key listing easily, 
    // I will implement a raw TCP helper for listing keys.
    
    let raw_keys = list_keys_via_tcp(&db_state, connection_id).await?;
    
    let mut result = Vec::new();
    let filter_str = filter.unwrap_or_default().to_lowercase();
    
    for k in raw_keys {
        if filter_str.is_empty() || k.to_lowercase().contains(&filter_str) {
             result.push(MemcachedKey {
                 key: k,
                 size: 0, // hard to get size efficiently without extra queries
                 expiration: 0,
             });
        }
    }
    
    Ok(result)
}

// Helper to list keys via raw TCP
async fn list_keys_via_tcp(db_state: &State<'_, DbState>, connection_id: i64) -> Result<Vec<String>, String> {
     let connection = sqlx::query_as::<_, Connection>(
        "SELECT id, name, db_type, host, port, username, password, database, created_at FROM connections WHERE id = ?",
    )
    .bind(connection_id)
    .fetch_optional(&db_state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Connection not found")?;

    let host = connection.host.as_deref().unwrap_or("localhost");
    let port = connection.port.unwrap_or(11211);
    let addr = format!("{}:{}", host, port);

    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpStream;

    let mut stream = TcpStream::connect(addr).await.map_err(|e| e.to_string())?;
    let (reader, mut writer) = stream.split();
    let mut reader = BufReader::new(reader);

    // 1. Get slabs
    writer.write_all(b"stats items\r\n").await.map_err(|e| e.to_string())?;
    
    let mut slabs = Vec::new();
    
    let mut line = String::new();
    while reader.read_line(&mut line).await.map_err(|e| e.to_string())? > 0 {
        if line.trim() == "END" {
            line.clear();
            break;
        }
        
        // STAT items:1:number 1
        if line.starts_with("STAT items:") {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() >= 2 {
                if let Ok(slab_id) = parts[1].parse::<u32>() {
                    if !slabs.contains(&slab_id) {
                        slabs.push(slab_id);
                    }
                }
            }
        }
        line.clear();
    }
    
    let mut keys = Vec::new();
    
    // 2. Get keys from each slab
    for slab_id in slabs {
        let cmd = format!("stats cachedump {} 100\r\n", slab_id); // Limit 100 per slab for performance
        writer.write_all(cmd.as_bytes()).await.map_err(|e| e.to_string())?;
        
        while reader.read_line(&mut line).await.map_err(|e| e.to_string())? > 0 {
            if line.trim() == "END" {
                line.clear();
                break;
            }
            
            // ITEM key_name [size b; expiration s]
            if line.starts_with("ITEM ") {
                let parts: Vec<&str> = line.split(' ').collect();
                if parts.len() >= 2 {
                    keys.push(parts[1].to_string());
                }
            }
            line.clear();
        }
    }
    
    Ok(keys)
}

#[command]
pub async fn get_memcached_value(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    key: String,
) -> Result<String, String> {
    let app_state_cloned = app_state.inner().clone();
    let db_state_cloned = db_state.inner().clone();
    
    let value = tauri::async_runtime::spawn_blocking(move || {
        let client = get_or_create_client(&app_state_cloned, &db_state_cloned, connection_id)?;
        // Use Vec<u8> to get raw bytes
        let val: Option<Vec<u8>> = client.get(&key).map_err(|e| e.to_string())?;
        
        match val {
            Some(bytes) => {
                // Try to decompress with Zlib (PHP Memcached often uses Zlib)
                let mut decoder = ZlibDecoder::new(&bytes[..]);
                let mut decompressed = Vec::new();
                
                let final_bytes = match decoder.read_to_end(&mut decompressed) {
                    Ok(_) => decompressed, // Decompression successful
                    Err(_) => bytes,       // Not compressed or failed, use original
                };

                Ok::<_, String>(Some(String::from_utf8_lossy(&final_bytes).to_string()))
            },
            None => Ok::<_, String>(None)
        }
    }).await.map_err(|e| e.to_string())??;
    
    Ok(value.unwrap_or_else(|| "(nil)".to_string()))
}

#[command]
pub async fn set_memcached_value(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    key: String,
    value: String,
    ttl: u32,
) -> Result<(), String> {
    let app_state_cloned = app_state.inner().clone();
    let db_state_cloned = db_state.inner().clone();
    
    tauri::async_runtime::spawn_blocking(move || {
        let client = get_or_create_client(&app_state_cloned, &db_state_cloned, connection_id)?;
        client.set(&key, value, ttl).map_err(|e| e.to_string())?;
        Ok::<_, String>(())
    }).await.map_err(|e| e.to_string())??;
    
    Ok(())
}

#[command]
pub async fn delete_memcached_key(
    app_state: State<'_, AppState>,
    db_state: State<'_, DbState>,
    connection_id: i64,
    key: String,
) -> Result<(), String> {
    let app_state_cloned = app_state.inner().clone();
    let db_state_cloned = db_state.inner().clone();
    
    tauri::async_runtime::spawn_blocking(move || {
        let client = get_or_create_client(&app_state_cloned, &db_state_cloned, connection_id)?;
        client.delete(&key).map_err(|e| e.to_string())?;
        Ok::<_, String>(())
    }).await.map_err(|e| e.to_string())??;
    
    Ok(())
}
