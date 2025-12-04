use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::fs;
use tauri::{AppHandle, Manager};

pub type DbPool = Pool<Sqlite>;

#[derive(Clone)]
pub struct DbState {
    pub pool: DbPool,
}

const DB_FILE_NAME: &str = "neodb.sqlite";

pub async fn init_db(app: &AppHandle) -> Result<DbState, Box<dyn std::error::Error>> {
    // 1. 获取应用数据目录
    let app_data_dir = app.path().app_local_data_dir()?;
    
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)?;
    }

    let db_path = app_data_dir.join(DB_FILE_NAME);
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    // 2. 如果文件不存在，SqlitePoolOptions 不会自动创建文件，
    // 但 sqlx::sqlite::SqliteConnectOptions 可以。
    // 或者我们简单地用 File::create 创建一个空文件
    if !db_path.exists() {
        fs::File::create(&db_path)?;
    }

    // 3. 创建连接池
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // 4. 运行迁移 (创建表)
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            db_type TEXT NOT NULL,
            host TEXT,
            port INTEGER,
            username TEXT,
            password TEXT,
            database TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        "#,
    )
    .execute(&pool)
    .await?;

    Ok(DbState { pool })
}
