#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod db;
mod metrics;
mod nutrition;
mod recipes;

use db::{Database, Day, Entry, EntryInput, Library, Settings, Week};
use metrics::{Metric, MetricHistory};
use nutrition::{Estimate, EstimateInput, Food, FoodPortion, Goal, Nutrients};
use recipes::{MealLog, Recipe, RecipeLibrary, RecipeNutrition, RecipePortion, SavedMeal};
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

#[tauri::command]
fn save_metric(metric: Metric, state: tauri::State<'_, Storage>) -> Result<Metric, String> {
    with_db(state, |db| db.save_metric(metric))
}
#[tauri::command]
fn delete_metric(
    id: String,
    revision: i64,
    state: tauri::State<'_, Storage>,
) -> Result<(), String> {
    with_db(state, |db| db.delete_metric(&id, revision))
}
#[tauri::command]
fn get_metric_history(
    end: String,
    days: i64,
    kind: String,
    label: String,
    state: tauri::State<'_, Storage>,
) -> Result<MetricHistory, String> {
    with_db(state, |db| db.metric_history(&end, days, &kind, &label))
}
#[tauri::command]
fn get_metric_labels(state: tauri::State<'_, Storage>) -> Result<Vec<String>, String> {
    with_db(state, |db| db.metric_labels())
}
#[tauri::command]
fn get_recipe_library(state: tauri::State<'_, Storage>) -> Result<RecipeLibrary, String> {
    with_db(state, |db| db.recipe_library())
}
#[tauri::command]
fn get_recipe_history(id: String, state: tauri::State<'_, Storage>) -> Result<Vec<Recipe>, String> {
    with_db(state, |db| db.recipe_history(Some(&id)))
}
#[tauri::command]
fn save_recipe(recipe: Recipe, state: tauri::State<'_, Storage>) -> Result<Recipe, String> {
    with_db(state, |db| db.save_recipe(recipe))
}
#[tauri::command]
fn preview_recipe(recipe: Recipe) -> Result<RecipeNutrition, String> {
    recipe.calculate()
}
#[tauri::command]
fn preview_recipe_portion(portion: RecipePortion) -> Result<RecipeNutrition, String> {
    portion.calculate()
}
#[tauri::command]
fn save_meal(meal: SavedMeal, state: tauri::State<'_, Storage>) -> Result<SavedMeal, String> {
    with_db(state, |db| db.save_meal(meal))
}
#[tauri::command]
fn log_meal(input: MealLog, state: tauri::State<'_, Storage>) -> Result<Vec<Entry>, String> {
    with_db(state, |db| db.log_meal(input))
}

#[tauri::command]
fn get_ai_config(state: tauri::State<'_, Storage>) -> Result<ai::AiConfig, String> {
    with_db(state, |db| db.ai_config().map(|v| v.0))
}
#[tauri::command]
fn save_ai_config(
    config: ai::AiConfig,
    state: tauri::State<'_, Storage>,
) -> Result<ai::AiConfig, String> {
    with_db(state, |db| db.save_ai_config(config))
}
#[tauri::command]
fn ai_credential_present(state: tauri::State<'_, Storage>) -> Result<bool, String> {
    let reference = with_db(state, |db| db.ai_config().map(|v| v.1))?;
    Ok(ai::read_secret(&reference)?.is_some())
}
#[tauri::command]
fn set_ai_credential(
    secret: Option<String>,
    state: tauri::State<'_, Storage>,
) -> Result<(), String> {
    let reference = with_db(state, |db| db.ai_config().map(|v| v.1))?;
    ai::set_secret(&reference, secret)
}
#[tauri::command]
async fn check_ai(
    config: ai::AiConfig,
    state: tauri::State<'_, Storage>,
) -> Result<ai::Readiness, String> {
    let reference = with_db(state, |db| db.ai_config().map(|v| v.1))?;
    let secret = ai::read_secret(&reference)?;
    ai::readiness(&config, secret.as_deref()).await
}
#[tauri::command]
async fn describe_meal(
    input: ai::TextInput,
    state: tauri::State<'_, Storage>,
    jobs: tauri::State<'_, ai::AiJobs>,
) -> Result<ai::TextDraft, String> {
    let (config, reference, foods) = with_db(state, |db| {
        let (config, reference) = db.ai_config()?;
        Ok((config, reference, db.library()?.foods))
    })?;
    let secret = ai::read_secret(&reference)?;
    jobs.describe(config, secret, input, foods).await
}
#[tauri::command]
fn cancel_description(
    request_id: String,
    jobs: tauri::State<'_, ai::AiJobs>,
) -> Result<(), String> {
    jobs.cancel(&request_id)
}
#[tauri::command]
fn save_ai_draft(
    entries: Vec<EntryInput>,
    state: tauri::State<'_, Storage>,
) -> Result<Vec<Entry>, String> {
    with_db(state, |db| db.save_ai_entries(entries))
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
            app.manage(ai::AiJobs::default());
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
            preview_estimate, preview_portion, set_day_complete, get_week,
            save_metric,delete_metric,get_metric_history,get_metric_labels,
            get_recipe_library,get_recipe_history,save_recipe,preview_recipe,preview_recipe_portion,
            save_meal,log_meal,
            get_ai_config,save_ai_config,ai_credential_present,set_ai_credential,check_ai,
            describe_meal,cancel_description,save_ai_draft
        ])
        .run(tauri::generate_context!())
        .expect("CalPal could not start. Existing records have been left intact.");
}
