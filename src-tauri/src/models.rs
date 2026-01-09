use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::FromRow;
use chrono::NaiveDateTime;

#[derive(Debug, Serialize, Deserialize, Clone)]
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

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Connection {
    pub id: i64,
    pub name: String,
    pub db_type: String, // e.g., "mysql", "postgres", "sqlite"
    pub host: Option<String>,
    pub port: Option<i32>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>, // default database
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateConnectionArgs {
    pub name: String,
    pub db_type: String,
    pub host: Option<String>,
    pub port: Option<i32>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateConnectionArgs {
    pub id: i64,
    pub name: Option<String>,
    pub db_type: Option<String>,
    pub host: Option<String>,
    pub port: Option<i32>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
}
