use sqlx::{MySqlPool, SqlitePool};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub pools: Arc<Mutex<HashMap<String, MySqlPool>>>,
    pub sqlite_pools: Arc<Mutex<HashMap<i64, SqlitePool>>>,
    pub redis_clients: Arc<Mutex<HashMap<String, redis::Client>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            pools: Arc::new(Mutex::new(HashMap::new())),
            sqlite_pools: Arc::new(Mutex::new(HashMap::new())),
            redis_clients: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
