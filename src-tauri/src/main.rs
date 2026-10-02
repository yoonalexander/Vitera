#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod backup;
mod db;
mod file_dialog;
mod food_parser;
mod metrics;
mod nutrition;
mod palette;
mod photo;
mod recipes;

use db::{Database, Day, Entry, EntryInput, Library, Settings, Week};
use metrics::{Metric, MetricHistory};
use nutrition::{Estimate, EstimateInput, Food, FoodPortion, Goal, Nutrients};
use recipes::{MealLog, Recipe, RecipeLibrary, RecipeNutrition, RecipePortion, SavedMeal};
use std::sync::Mutex;
use tauri::Manager;

struct Storage(Mutex<Result<Database, String>>);
#[derive(Default)]
struct RestorePreview(Mutex<Option<(String, backup::Backup)>>);

// Product rename: new automation names take precedence; existing scripts still work.
fn environment(name: &str) -> Option<std::ffi::OsString> {
    std::env::var_os(format!("VITERA_{name}"))
        .or_else(|| std::env::var_os(format!("CALPAL_{name}")))
}

#[tauri::command]
async fn export_data(
    kind: String,
    state: tauri::State<'_, Storage>,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let extension = if kind == "backup" {
        "vitera"
    } else if ["diary", "metrics"].contains(&kind.as_str()) {
        "csv"
    } else {
        return Err("Choose a Vitera export.".into());
    };
    let filename = format!(
        "Vitera-{kind}-{}.{}",
        chrono::Local::now().format("%Y-%m-%d"),
        extension
    );
    // Explicit process-local automation override only works with isolated app data.
    // Web content cannot supply a destination path or turn this mode on.
    let path =
        if let (Some(_), Some(directory)) = (environment("DATA_DIR"), environment("EXPORT_DIR")) {
            Some(std::path::PathBuf::from(directory).join(&filename))
        } else {
            let window = app
                .get_webview_window("main")
                .ok_or("The main window is unavailable.")?;
            let extension = extension.to_string();
            #[cfg(windows)]
            let parent = window
                .hwnd()
                .map_err(|_| "The main window is unavailable.")?
                .0 as isize;
            #[cfg(not(windows))]
            let parent = 0;
            tauri::async_runtime::spawn_blocking(move || {
                file_dialog::save(parent, &filename, &extension)
            })
            .await
            .map_err(|_| "The save dialog could not open. Try again.")??
        };
    let Some(mut path) = path else {
        return Ok(None);
    };
    if !path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(extension))
    {
        path.set_extension(extension);
        if path.exists() {
            return Err("That export filename already exists. Choose it explicitly in the save dialog to replace it.".into());
        }
    }
    let data = with_db(state, |db| {
        if kind == "backup" {
            db.backup()?.encode()
        } else {
            db.export_csv(&kind)
        }
    })?;
    backup::write_atomic(&path, data.as_bytes())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupPreview {
    token: String,
    incoming: backup::Summary,
    current: backup::Summary,
}
#[tauri::command]
async fn preview_backup(
    data: String,
    state: tauri::State<'_, Storage>,
    preview: tauri::State<'_, RestorePreview>,
) -> Result<BackupPreview, String> {
    // Clear any previous approval token before validating a different selection.
    let mut pending = preview
        .0
        .lock()
        .map_err(|_| "Backup preview is unavailable. Restart and retry.")?;
    *pending = None;
    let backup = backup::Backup::parse(&data)?;
    let current = with_db(state, |db| Ok(db.backup()?.summary()))?;
    let incoming = backup.summary();
    let token = uuid::Uuid::new_v4().to_string();
    *pending = Some((token.clone(), backup));
    Ok(BackupPreview {
        token,
        incoming,
        current,
    })
}
#[tauri::command]
fn discard_backup(preview: tauri::State<'_, RestorePreview>) -> Result<(), String> {
    *preview
        .0
        .lock()
        .map_err(|_| "Backup preview is unavailable.")? = None;
    Ok(())
}
#[tauri::command]
async fn restore_backup(
    token: String,
    state: tauri::State<'_, Storage>,
    preview: tauri::State<'_, RestorePreview>,
) -> Result<String, String> {
    let mut pending = preview
        .0
        .lock()
        .map_err(|_| "Backup preview is unavailable. Restart and retry.")?;
    let (expected, backup) = pending
        .as_ref()
        .ok_or("Choose and preview a backup before restoring.")?;
    if expected != &token {
        return Err("This preview expired. Choose the backup again.".into());
    }
    let result = with_db(state, |db| {
        let path = db
            .connection
            .path()
            .ok_or("The data folder is unavailable. Current records are unchanged.")?;
        let directory = std::path::Path::new(path)
            .parent()
            .ok_or("The data folder is unavailable.")?
            .join("recovery");
        db.restore_backup(backup, &directory)
    })?;
    *pending = None;
    Ok(result)
}

fn with_db<T>(
    state: tauri::State<'_, Storage>,
    action: impl FnOnce(&mut Database) -> Result<T, String>,
) -> Result<T, String> {
    let mut database = state
        .0
        .lock()
        .map_err(|_| "Local storage is unavailable. Restart Vitera and try again.".to_string())?;
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
    let mut ready = ai::readiness(&config, secret.as_deref()).await?;
    if let Some(model) = &config.vision_model {
        if model != &config.model {
            let mut vision = config.clone();
            vision.model = model.clone();
            vision.vision_model = None;
            let photo = ai::readiness(&vision, secret.as_deref()).await?;
            ready.vision = photo.vision;
            ready.message = format!(
                "{} Photo model: {} ({}).",
                ready.message,
                model,
                if photo.vision {
                    "vision supported"
                } else {
                    "text-only; photos unavailable"
                }
            );
        }
    }
    Ok(ready)
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
    photo_id: Option<String>,
    retain_photo: Option<bool>,
    photos: tauri::State<'_, photo::Photos>,
    state: tauri::State<'_, Storage>,
) -> Result<Vec<Entry>, String> {
    if let Some(id) = photo_id {
        let photo = photos.get(&id)?;
        with_db(state, |db| {
            db.save_photo_entries(entries, &photo, retain_photo.unwrap_or(false))
        })
    } else {
        if retain_photo.unwrap_or(false)
            || entries
                .iter()
                .any(|e| e.nutrition.ai.as_ref().is_some_and(|a| a.photo.is_some()))
        {
            return Err("Choose the photo belonging to this draft before saving.".into());
        }
        with_db(state, |db| db.save_ai_entries(entries))
    }
}

#[tauri::command]
async fn prepare_photo(
    data: String,
    photos: tauri::State<'_, photo::Photos>,
) -> Result<photo::PreparedPhoto, String> {
    photos.prepare(&data)
}
#[tauri::command]
fn release_photo(id: String, photos: tauri::State<'_, photo::Photos>) -> Result<(), String> {
    photos.release(&id)
}
#[tauri::command]
async fn describe_photo(
    input: ai::TextInput,
    photo_id: String,
    state: tauri::State<'_, Storage>,
    jobs: tauri::State<'_, ai::AiJobs>,
    photos: tauri::State<'_, photo::Photos>,
) -> Result<ai::TextDraft, String> {
    let photo = photos.get(&photo_id)?;
    let (config, reference, foods) = with_db(state, |db| {
        let (config, reference) = db.ai_config()?;
        Ok((config, reference, db.library()?.foods))
    })?;
    jobs.photo(config, ai::read_secret(&reference)?, input, foods, photo)
        .await
}
#[tauri::command]
fn get_photo_attachment(
    request_id: String,
    state: tauri::State<'_, Storage>,
) -> Result<Option<photo::PreparedPhoto>, String> {
    with_db(state, |db| db.attachment(&request_id))
}
#[tauri::command]
fn remove_photo_attachment(
    request_id: String,
    state: tauri::State<'_, Storage>,
) -> Result<(), String> {
    with_db(state, |db| db.remove_attachment(&request_id))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Optional process-local override keeps automated test records separate.
            let database = (|| {
                let directory = match environment("DATA_DIR") {
                    Some(path) => std::path::PathBuf::from(path),
                    None => app.path().app_data_dir().map_err(|error| error.to_string())?,
                };
                std::fs::create_dir_all(&directory)
                    .map_err(|error| format!("Vitera could not open its data folder: {error}. Restart the app after resolving the folder problem."))?;
                // Stable storage identity opens existing diaries without copying or resetting.
                Database::open(&directory.join("calpal.sqlite3"))
            })();
            app.manage(Storage(Mutex::new(database)));
            app.manage(RestorePreview::default());
            app.manage(ai::AiJobs::default());
            app.manage(photo::Photos::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_day,
            export_data,preview_backup,restore_backup,discard_backup,
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
            describe_meal,cancel_description,save_ai_draft,prepare_photo,release_photo,describe_photo,get_photo_attachment,remove_photo_attachment
        ])
        .run(tauri::generate_context!())
        .expect("Vitera could not start. Existing records have been left intact.");
}
