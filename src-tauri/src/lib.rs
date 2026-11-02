mod history;
mod lock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![
            lock::machine_name,
            lock::process_id,
            lock::process_alive,
            history::history_check,
            history::history_status,
            history::history_commit,
            history::history_log,
            history::history_changed_files,
            history::history_tree,
            history::history_read
        ])
        .run(tauri::generate_context!())
        .expect("error while running Storyworks");
}
