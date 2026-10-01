#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{Database, Day, Entry, EntryInput, Settings};
use std::sync::Mutex;
use tauri::Manager;

struct Storage(Mutex<Result<Database, String>>);

fn with_db<T>(
    state: tauri::State<'_, Storage>,
    action: impl FnOnce(&mut Database) -> Result<T, String>,
) -> Result<T, String> {
    let mut database = state
        .0
        .lock()
        .map_err(|_| "Local storage is unavailable. Restart CalPal and try again.".to_string())?;
    action(database.as_mut().map_err(|error| error.clone())?)
}

#[tauri::command]
fn get_day(date: String, state: tauri::State<'_, Storage>) -> Result<Day, String> {
    with_db(state, |db| db.day(&date))
}

#[tauri::command]
fn save_entry(input: EntryInput, state: tauri::State<'_, Storage>) -> Result<Entry, String> {
    with_db(state, |db| db.save(input))
}

#[tauri::command]
fn delete_entry(
    id: String,
    revision: i64,
    state: tauri::State<'_, Storage>,
) -> Result<Entry, String> {
    with_db(state, |db| db.set_deleted(&id, revision, true))
}

#[tauri::command]
fn restore_entry(
    id: String,
    revision: i64,
    state: tauri::State<'_, Storage>,
) -> Result<Entry, String> {
    with_db(state, |db| db.set_deleted(&id, revision, false))
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, Storage>) -> Result<Settings, String> {
    with_db(state, |db| db.settings())
}

#[tauri::command]
fn save_settings(settings: Settings, state: tauri::State<'_, Storage>) -> Result<Settings, String> {
    with_db(state, |db| db.save_settings(settings))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Optional process-local override keeps automated test records separate.
            let database = (|| {
                let directory = match std::env::var_os("CALPAL_DATA_DIR") {
                    Some(path) => std::path::PathBuf::from(path),
                    None => app.path().app_data_dir().map_err(|error| error.to_string())?,
                };
                std::fs::create_dir_all(&directory)
                    .map_err(|error| format!("CalPal could not open its data folder: {error}. Restart the app after resolving the folder problem."))?;
                Database::open(&directory.join("calpal.sqlite3"))
            })();
            app.manage(Storage(Mutex::new(database)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_day,
            save_entry,
            delete_entry,
            restore_entry,
            get_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("CalPal could not start. Existing records have been left intact.");
}
