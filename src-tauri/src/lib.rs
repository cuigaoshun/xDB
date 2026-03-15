mod db;
mod memcached_manager;
mod models;
mod mysql_manager;
mod redis_manager;
mod sqlite_manager;
mod state;

use db::{get_db_path, DB_FILE_NAME};
use memcached_manager::{
    delete_memcached_key, get_memcached_keys, get_memcached_value, set_memcached_value,
};
use mysql_manager::execute_sql;
use redis_manager::{
    execute_redis_command, execute_redis_pipeline, get_keys_details, get_redis_keys,
    scan_hash_values, scan_list_values, scan_set_members, scan_zset_members,
};
use sqlite_manager::execute_sqlite_sql;
use state::AppState;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/0001_initial_tables.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = get_migrations();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&format!("sqlite:{}", DB_FILE_NAME), migrations)
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 初始化全局状态
            app.manage(AppState::new());

            // 初始化数据库连接池 (迁移已由 Tauri SQL 插件处理)
            tauri::async_runtime::block_on(async move {
                match db::init_db_pool(app.handle()).await {
                    Ok(db_state) => {
                        app.manage(db_state);
                    }
                    Err(e) => {
                        eprintln!("Error initializing database pool: {}", e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_db_path,
            execute_sql,
            execute_sqlite_sql,
            execute_redis_command,
            execute_redis_pipeline,
            get_redis_keys,
            get_keys_details,
            scan_hash_values,
            scan_set_members,
            scan_zset_members,
            scan_list_values,
            get_memcached_keys,
            get_memcached_value,
            set_memcached_value,
            delete_memcached_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
