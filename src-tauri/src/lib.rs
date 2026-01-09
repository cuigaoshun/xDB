mod commands;
mod db;
mod models;
mod mysql_manager;
mod redis_manager;
mod memcached_manager;
mod sqlite_manager;
mod state;

use commands::*;
use mysql_manager::execute_sql;
use sqlite_manager::execute_sqlite_sql;
use redis_manager::{execute_redis_command, get_redis_keys, get_keys_details, scan_hash_values, scan_set_members, scan_zset_members, scan_list_values};
use memcached_manager::{get_memcached_keys, get_memcached_value, set_memcached_value, delete_memcached_key};
use state::AppState;
use tauri::Manager;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 初始化全局状态
            app.manage(AppState::new());

            // 初始化数据库
            tauri::async_runtime::block_on(async move {
                match db::init_db(app.handle()).await {
                    Ok(db_state) => {
                        app.manage(db_state);
                    }
                    Err(e) => {
                        eprintln!("Error initializing database: {}", e);
                        // 这里可以选择 panic 或者只是打印错误，视情况而定
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_connection,
            get_all_connections,
            get_connection_by_id,
            update_connection,
            delete_connection,
            execute_sql,
            execute_sqlite_sql,
            execute_redis_command,
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
