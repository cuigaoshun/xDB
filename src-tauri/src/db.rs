use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use tauri::{AppHandle, Manager};

pub type DbPool = Pool<Sqlite>;

#[derive(Clone)]
pub struct DbState {
    pub pool: DbPool,
}

pub const DB_FILE_NAME: &str = "xDB.sqlite";

#[tauri::command]
pub fn get_db_path(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join(DB_FILE_NAME);
    Ok(db_path.to_string_lossy().to_string())
}

// 获取数据库 URL (供内部使用)
fn get_db_url_internal(app: &AppHandle) -> Result<String, Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_config_dir()?;
    let db_path = app_data_dir.join(DB_FILE_NAME);
    Ok(format!("sqlite://{}", db_path.to_string_lossy()))
}

// 初始化数据库连接池 (迁移由 Tauri SQL 插件处理)
pub async fn init_db_pool(app: &AppHandle) -> Result<DbState, Box<dyn std::error::Error>> {
    // 使用统一的方法获取数据库 URL
    let db_url = get_db_url_internal(app)?;

    // 创建连接池
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    Ok(DbState { pool })
}
