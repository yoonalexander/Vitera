#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod nutrition;

use db::{Database, Day, Entry, EntryInput, Library, Settings, Week};
use nutrition::{Estimate, EstimateInput, Food, FoodPortion, Goal, Nutrients};
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

#[tauri::command]
fn get_library(state: tauri::State<'_, Storage>) -> Result<Library, String> {
    with_db(state, |db| db.library())
}
#[tauri::command]
fn save_food(food: Food, state: tauri::State<'_, Storage>) -> Result<Food, String> {
    with_db(state, |db| db.save_food(food))
}
#[tauri::command]
fn set_favorite(
    id: String,
    favorite: bool,
    state: tauri::State<'_, Storage>,
) -> Result<Food, String> {
    with_db(state, |db| db.favorite(&id, favorite))
}
#[tauri::command]
fn get_goals(state: tauri::State<'_, Storage>) -> Result<Vec<Goal>, String> {
    with_db(state, |db| db.goals())
}
#[tauri::command]
fn save_goal(goal: Goal, state: tauri::State<'_, Storage>) -> Result<Goal, String> {
    with_db(state, |db| {
        db.save_goal(goal, &chrono::Local::now().format("%Y-%m-%d").to_string())
    })
}
#[tauri::command]
fn preview_estimate(input: EstimateInput) -> Result<Estimate, String> {
    nutrition::estimate(&input)
}
#[tauri::command]
fn preview_portion(portion: FoodPortion) -> Result<(Nutrients, String), String> {
    portion.calculate()
}
#[tauri::command]
fn set_day_complete(
    date: String,
    complete: bool,
    state: tauri::State<'_, Storage>,
) -> Result<Day, String> {
    with_db(state, |db| db.complete_day(&date, complete))
}
#[tauri::command]
fn get_week(end: String, state: tauri::State<'_, Storage>) -> Result<Week, String> {
    with_db(state, |db| db.week(&end))
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
            save_settings,
            get_library, save_food, set_favorite, get_goals, save_goal,
            preview_estimate, preview_portion, set_day_complete, get_week
        ])
        .run(tauri::generate_context!())
        .expect("CalPal could not start. Existing records have been left intact.");
}
