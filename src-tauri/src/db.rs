use crate::nutrition::{
    estimate, macro_total, valid_name, validate_target, Food, Goal, MacroTotal, Nutrients,
    NutritionSnapshot,
};
use chrono::{NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

type Result<T> = std::result::Result<T, String>;
const COLUMNS: &str = "id, diary_date, meal, name, kcal, revision, deleted, nutrition";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub date: String,
    pub meal: String,
    pub name: String,
    pub kcal: f64,
    pub revision: i64,
    pub deleted: bool,
    #[serde(flatten)]
    pub nutrition: NutritionSnapshot,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntryInput {
    pub id: String,
    pub date: String,
    pub meal: String,
    pub name: String,
    pub kcal: f64,
    pub revision: Option<i64>,
    #[serde(default)]
    pub nutrition: NutritionSnapshot,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Day {
    pub entries: Vec<Entry>,
    pub total_kcal: f64,
    pub protein: MacroTotal,
    pub carbohydrate: MacroTotal,
    pub fat: MacroTotal,
    pub target: Option<Goal>,
    pub complete: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekDay {
    pub date: String,
    pub total_kcal: f64,
    pub complete: bool,
    pub entries: usize,
    pub target: Option<Goal>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Week {
    pub days: Vec<WeekDay>,
    pub complete_days: usize,
    pub logged_days: usize,
    pub average_kcal: Option<f64>,
}
#[derive(Debug, Serialize)]
pub struct Library {
    pub foods: Vec<Food>,
    pub recent: Vec<Entry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,
}

pub struct Database {
    pub(crate) connection: Connection,
}

fn sql_error(error: rusqlite::Error) -> String {
    format!("Local storage error: {error}")
}

fn read_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<Entry> {
    let json: Option<String> = row.get(7)?;
    let nutrition = match json {
        Some(value) => serde_json::from_str(&value).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(7, rusqlite::types::Type::Text, Box::new(e))
        })?,
        None => NutritionSnapshot::default(),
    };
    Ok(Entry {
        id: row.get(0)?,
        date: row.get(1)?,
        meal: row.get(2)?,
        name: row.get(3)?,
        kcal: row.get(4)?,
        revision: row.get(5)?,
        deleted: row.get(6)?,
        nutrition,
    })
}

pub(crate) fn validate_date(date: &str) -> Result<()> {
    let parsed = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| "Choose a valid diary date.".to_string())?;
    if parsed.format("%Y-%m-%d").to_string() != date {
        return Err("Choose a date in YYYY-MM-DD format.".into());
    }
    Ok(())
}

impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let mut connection = Connection::open(path).map_err(sql_error)?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(sql_error)?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
            )
            .map_err(sql_error)?;
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(sql_error)?;
        if version > 5 {
            return Err(
                "This database requires a newer Vitera version. Existing records were left intact."
                    .into(),
            );
        }
        if version == 0 {
            let transaction = connection.transaction().map_err(sql_error)?;
            transaction
                .execute_batch(include_str!("../migrations/001_foundation.sql"))
                .map_err(sql_error)?;
            transaction
                .pragma_update(None, "user_version", 1)
                .map_err(sql_error)?;
            transaction.commit().map_err(sql_error)?;
        }
        if version < 2 {
            let transaction = connection.transaction().map_err(sql_error)?;
            transaction
                .execute_batch(include_str!("../migrations/002_nutrition.sql"))
                .map_err(sql_error)?;
            transaction
                .pragma_update(None, "user_version", 2)
                .map_err(sql_error)?;
            transaction.commit().map_err(sql_error)?;
        }
        if version < 3 {
            let transaction = connection.transaction().map_err(sql_error)?;
            transaction
                .execute_batch(include_str!("../migrations/003_metrics_recipes.sql"))
                .map_err(sql_error)?;
            transaction
                .pragma_update(None, "user_version", 3)
                .map_err(sql_error)?;
            transaction.commit().map_err(sql_error)?;
        }
        if version < 4 {
            let transaction = connection.transaction().map_err(sql_error)?;
            transaction
                .execute_batch(include_str!("../migrations/004_ai_descriptions.sql"))
                .map_err(sql_error)?;
            transaction
                .pragma_update(None, "user_version", 4)
                .map_err(sql_error)?;
            transaction.commit().map_err(sql_error)?;
        }
        if version < 5 {
            let transaction = connection.transaction().map_err(sql_error)?;
            transaction
                .execute_batch(include_str!("../migrations/005_photos.sql"))
                .map_err(sql_error)?;
            transaction
                .pragma_update(None, "user_version", 5)
                .map_err(sql_error)?;
            transaction.commit().map_err(sql_error)?;
        }
        // Immutable catalog IDs include the catalog version; a later catalog cannot rewrite snapshots.
        let foods: Vec<Food> = serde_json::from_str(include_str!("../../catalog/foods-v1.json"))
            .map_err(|e| e.to_string())?;
        let transaction = connection.transaction().map_err(sql_error)?;
        for food in foods {
            food.validate()?;
            transaction
                .execute(
                    "INSERT INTO foods (id, record) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING",
                    params![food.id, json(&food)?],
                )
                .map_err(sql_error)?;
        }
        transaction.commit().map_err(sql_error)?;
        Ok(Self { connection })
    }

    fn entry(&self, id: &str) -> Result<Option<Entry>> {
        self.connection
            .query_row(
                &format!("SELECT {COLUMNS} FROM diary_entries WHERE id = ?1"),
                [id],
                read_entry,
            )
            .optional()
            .map_err(sql_error)
    }

    pub fn day(&self, date: &str) -> Result<Day> {
        validate_date(date)?;
        let mut statement = self.connection.prepare(&format!(
            "SELECT {COLUMNS} FROM diary_entries WHERE diary_date = ?1 AND deleted = 0 ORDER BY created_at, id"
        )).map_err(sql_error)?;
        let entries = statement
            .query_map([date], read_entry)
            .map_err(sql_error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(sql_error)?;
        let total_kcal = entries.iter().fold(0.0, |sum, entry| sum + entry.kcal);
        let target = self.target(date)?;
        self.connection.execute("INSERT INTO diary_days (diary_date, target) VALUES (?1, ?2) ON CONFLICT(diary_date) DO NOTHING", params![date, target.as_ref().map(json).transpose()?]).map_err(sql_error)?;
        let complete = self
            .connection
            .query_row(
                "SELECT complete FROM diary_days WHERE diary_date=?1",
                [date],
                |r| r.get(0),
            )
            .map_err(sql_error)?;
        let mut protein = macro_total(entries.iter().map(|e| e.nutrition.protein));
        let mut carbohydrate = macro_total(entries.iter().map(|e| e.nutrition.carbohydrate));
        let mut fat = macro_total(entries.iter().map(|e| e.nutrition.fat));
        for entry in &entries {
            if let Some(c) = &entry.nutrition.macro_coverage {
                if c.protein.known > 0 && c.protein.known < c.protein.total {
                    protein.partial_entries += 1;
                }
                if c.carbohydrate.known > 0 && c.carbohydrate.known < c.carbohydrate.total {
                    carbohydrate.partial_entries += 1;
                }
                if c.fat.known > 0 && c.fat.known < c.fat.total {
                    fat.partial_entries += 1;
                }
            }
        }
        Ok(Day {
            protein,
            carbohydrate,
            fat,
            entries,
            total_kcal,
            target,
            complete,
        })
    }

    pub fn save(&mut self, mut input: EntryInput) -> Result<Entry> {
        validate_date(&input.date)?;
        uuid::Uuid::parse_str(&input.id).map_err(|_| "Entry identifier is invalid.".to_string())?;
        let name = input.name.trim();
        if name.is_empty() || name.chars().count() > 120 {
            return Err("Enter a food name of 1 to 120 characters.".into());
        }
        if !["Breakfast", "Lunch", "Dinner", "Snacks"].contains(&input.meal.as_str()) {
            return Err("Choose a valid meal.".into());
        }
        if !input.kcal.is_finite() || !(0.0..=100000.0).contains(&input.kcal) {
            return Err("Calories must be a number between 0 and 100,000.".into());
        }
        if let Some(portion) = &input.nutrition.food_portion {
            if input.nutrition.recipe_portion.is_some() {
                return Err("Choose a food or recipe portion, not both.".into());
            }
            let (values, kind) = portion.calculate()?;
            input.kcal = values.kcal.unwrap();
            input.nutrition.protein = values.protein;
            input.nutrition.carbohydrate = values.carbohydrate;
            input.nutrition.fat = values.fat;
            input.nutrition.energy_type = Some(kind);
            input.nutrition.macro_coverage = None;
        } else if let Some(portion) = &input.nutrition.recipe_portion {
            let result = portion.calculate()?;
            input.kcal = result.nutrients.kcal.unwrap();
            input.nutrition.protein = result.nutrients.protein;
            input.nutrition.carbohydrate = result.nutrients.carbohydrate;
            input.nutrition.fat = result.nutrients.fat;
            input.nutrition.macro_coverage = Some(result.coverage);
            input.nutrition.energy_type = Some("recipe ingredient sum".into());
        } else {
            input.nutrition.energy_type = Some(
                if input.nutrition.ai.is_some() {
                    "AI-only reviewed estimate"
                } else {
                    "manual"
                }
                .into(),
            );
            input.nutrition.macro_coverage = None;
        }
        Nutrients {
            kcal: Some(input.kcal),
            protein: input.nutrition.protein,
            carbohydrate: input.nutrition.carbohydrate,
            fat: input.nutrition.fat,
        }
        .validate()?;
        if let Some(origin) = &input.nutrition.ai {
            origin.validate()?;
        }
        if input
            .nutrition
            .timezone
            .as_ref()
            .is_some_and(|s| !valid_name(s))
        {
            return Err("Timezone metadata is invalid.".into());
        }
        let nutrition_json = json(&input.nutrition)?;
        let old_date = self.entry(&input.id)?.map(|e| e.date);
        // Capture the date's goal before logging; changing foods never changes this snapshot.
        self.day(&input.date)?;
        let transaction = self.connection.savepoint().map_err(sql_error)?;
        let now = Utc::now().to_rfc3339();
        let changed_diary;
        match input.revision {
            Some(revision) => {
                let changed = transaction.execute(
                    "UPDATE diary_entries SET diary_date=?1, meal=?2, name=?3, kcal=?4, revision=revision+1, updated_at=?5, nutrition=?8
                     WHERE id=?6 AND revision=?7 AND deleted=0",
                    params![input.date, input.meal, name, input.kcal, now, input.id, revision, nutrition_json],
                ).map_err(sql_error)?;
                if changed != 1 {
                    return Err("This entry changed. Close the form and refresh the diary before editing it again.".into());
                }
                changed_diary = true;
            }
            None => {
                let inserted = transaction.execute(
                    "INSERT INTO diary_entries (id, diary_date, meal, name, kcal, created_at, updated_at, nutrition)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7) ON CONFLICT(id) DO NOTHING",
                    params![input.id, input.date, input.meal, name, input.kcal, now, nutrition_json],
                ).map_err(sql_error)?;
                changed_diary = inserted != 0;
                let existing = transaction
                    .query_row(
                        &format!("SELECT {COLUMNS} FROM diary_entries WHERE id=?1"),
                        [&input.id],
                        read_entry,
                    )
                    .map_err(sql_error)?;
                if existing.deleted
                    || existing.date != input.date
                    || existing.meal != input.meal
                    || existing.name != name
                    || existing.kcal != input.kcal
                    || existing.nutrition != input.nutrition
                {
                    return Err("This entry identifier has already been used. Close the form and try again.".into());
                }
            }
        }
        if changed_diary {
            transaction
                .execute(
                    "UPDATE diary_days SET complete=0 WHERE diary_date=?1 OR diary_date=?2",
                    params![input.date, old_date],
                )
                .map_err(sql_error)?;
        }
        transaction.commit().map_err(sql_error)?;
        self.entry(&input.id)?
            .ok_or_else(|| "Saved entry could not be read.".into())
    }

    pub fn set_deleted(&mut self, id: &str, revision: i64, deleted: bool) -> Result<Entry> {
        let transaction = self.connection.transaction().map_err(sql_error)?;
        let changed = transaction
            .execute(
                "UPDATE diary_entries SET deleted=?1, revision=revision+1, updated_at=?2
             WHERE id=?3 AND revision=?4 AND deleted=?5",
                params![deleted, Utc::now().to_rfc3339(), id, revision, !deleted],
            )
            .map_err(sql_error)?;
        if changed != 1 {
            return Err("This entry changed. Refresh the diary and try again.".into());
        }
        transaction.execute("UPDATE diary_days SET complete=0 WHERE diary_date=(SELECT diary_date FROM diary_entries WHERE id=?1)", [id]).map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
        self.entry(id)?
            .ok_or_else(|| "Entry could not be read.".into())
    }

    pub fn settings(&self) -> Result<Settings> {
        self.connection
            .query_row("SELECT theme FROM settings WHERE id=1", [], |row| {
                Ok(Settings { theme: row.get(0)? })
            })
            .map_err(sql_error)
    }

    pub fn save_settings(&self, settings: Settings) -> Result<Settings> {
        if !["system", "light", "dark"].contains(&settings.theme.as_str()) {
            return Err("Choose a valid appearance.".into());
        }
        self.connection
            .execute("UPDATE settings SET theme=?1 WHERE id=1", [&settings.theme])
            .map_err(sql_error)?;
        self.settings()
    }

    fn target(&self, date: &str) -> Result<Option<Goal>> {
        let snapshot: Option<Option<String>> = self
            .connection
            .query_row(
                "SELECT target FROM diary_days WHERE diary_date=?1",
                [date],
                |r| r.get(0),
            )
            .optional()
            .map_err(sql_error)?;
        let record = match snapshot {
            Some(value) => value,
            None => self.connection.query_row("SELECT record FROM goal_versions WHERE effective_date<=?1 ORDER BY effective_date DESC, id DESC LIMIT 1", [date], |r| r.get(0)).optional().map_err(sql_error)?,
        };
        record.map(|r| from_json(&r)).transpose()
    }

    pub fn goals(&self) -> Result<Vec<Goal>> {
        let mut stmt = self
            .connection
            .prepare("SELECT record FROM goal_versions ORDER BY effective_date DESC, id DESC")
            .map_err(sql_error)?;
        let records = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(sql_error)?;
        records.map(|r| from_json(&r.map_err(sql_error)?)).collect()
    }

    pub fn save_goal(&mut self, mut goal: Goal, today: &str) -> Result<Goal> {
        validate_date(&goal.effective_date)?;
        validate_date(today)?;
        if goal.effective_date.as_str() < today {
            return Err("Apply goal changes today or on a future date to preserve history.".into());
        }
        if let Some(inputs) = &goal.estimate {
            goal.kcal = estimate(inputs)?.target;
        }
        validate_target(goal.kcal)?;
        let record = json(&goal)?;
        let tx = self.connection.transaction().map_err(sql_error)?;
        tx.execute(
            "INSERT INTO goal_versions (effective_date, record, created_at) VALUES (?1, ?2, ?3)",
            params![goal.effective_date, record, Utc::now().to_rfc3339()],
        )
        .map_err(sql_error)?;
        // Explicitly accepted changes update current/future days through the next scheduled goal.
        tx.execute("UPDATE diary_days SET target=?1 WHERE diary_date>=?2 AND diary_date<COALESCE((SELECT min(effective_date) FROM goal_versions WHERE effective_date>?2), '9999-12-31')", params![record, goal.effective_date]).map_err(sql_error)?;
        tx.commit().map_err(sql_error)?;
        Ok(goal)
    }

    pub fn complete_day(&self, date: &str, complete: bool) -> Result<Day> {
        self.day(date)?;
        self.connection
            .execute(
                "UPDATE diary_days SET complete=?1 WHERE diary_date=?2",
                params![complete, date],
            )
            .map_err(sql_error)?;
        self.day(date)
    }

    pub fn week(&self, end: &str) -> Result<Week> {
        validate_date(end)?;
        let end = NaiveDate::parse_from_str(end, "%Y-%m-%d").unwrap();
        let mut days = Vec::new();
        let mut total = 0.0;
        let mut complete_days = 0;
        let mut logged_days = 0;
        for offset in (0..7).rev() {
            let date = end
                .checked_sub_signed(chrono::Duration::days(offset))
                .ok_or("Date is out of range.")?
                .format("%Y-%m-%d")
                .to_string();
            let day = self.day(&date)?;
            if day.complete {
                complete_days += 1;
                total += day.total_kcal;
            }
            if !day.entries.is_empty() {
                logged_days += 1;
            }
            days.push(WeekDay {
                date,
                total_kcal: day.total_kcal,
                complete: day.complete,
                entries: day.entries.len(),
                target: day.target,
            });
        }
        Ok(Week {
            days,
            complete_days,
            logged_days,
            average_kcal: (complete_days > 0).then(|| total / complete_days as f64),
        })
    }

    pub fn library(&self) -> Result<Library> {
        let mut stmt = self
            .connection
            .prepare("SELECT record FROM foods ORDER BY id")
            .map_err(sql_error)?;
        let records = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(sql_error)?;
        let mut foods: Vec<Food> = records
            .map(|r| from_json(&r.map_err(sql_error)?))
            .collect::<Result<_>>()?;
        foods.sort_by(|a, b| b.favorite.cmp(&a.favorite).then(a.name.cmp(&b.name)));
        let mut stmt = self.connection.prepare(&format!("SELECT {COLUMNS} FROM diary_entries WHERE deleted=0 ORDER BY updated_at DESC, id DESC")).map_err(sql_error)?;
        let entries = stmt.query_map([], read_entry).map_err(sql_error)?;
        let mut seen = std::collections::HashSet::new();
        let mut recent = Vec::new();
        for entry in entries {
            let entry = entry.map_err(sql_error)?;
            let key = json(&(
                entry.name.clone(),
                entry.kcal,
                &entry.nutrition.food_portion,
                &entry.nutrition.recipe_portion,
                entry.nutrition.protein,
                entry.nutrition.carbohydrate,
                entry.nutrition.fat,
            ))?;
            if seen.insert(key) {
                recent.push(entry);
            }
            if recent.len() == 8 {
                break;
            }
        }
        Ok(Library { foods, recent })
    }

    pub fn save_food(&mut self, mut food: Food) -> Result<Food> {
        uuid::Uuid::parse_str(&food.id).map_err(|_| "Custom food identifier is invalid.")?;
        food.name = food.name.trim().into();
        food.source = "Custom label/manual".into();
        food.source_id = None;
        food.validate()?;
        let tx = self.connection.transaction().map_err(sql_error)?;
        let existing: Option<String> = tx
            .query_row("SELECT record FROM foods WHERE id=?1", [&food.id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(sql_error)?;
        if let Some(record) = existing {
            let old: Food = from_json(&record)?;
            if old.version != food.version {
                return Err("Food changed. Reopen it before editing.".into());
            }
            food.version += 1;
            food.favorite = old.favorite;
        } else {
            food.version = 1;
        }
        tx.execute("INSERT INTO foods (id, record) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET record=excluded.record", params![food.id, json(&food)?]).map_err(sql_error)?;
        tx.commit().map_err(sql_error)?;
        Ok(food)
    }

    pub fn favorite(&self, id: &str, favorite: bool) -> Result<Food> {
        let record: String = self
            .connection
            .query_row("SELECT record FROM foods WHERE id=?1", [id], |r| r.get(0))
            .map_err(sql_error)?;
        let mut food: Food = from_json(&record)?;
        food.favorite = favorite;
        self.connection
            .execute(
                "UPDATE foods SET record=?1 WHERE id=?2",
                params![json(&food)?, id],
            )
            .map_err(sql_error)?;
        Ok(food)
    }
}

pub(crate) fn json(value: &impl Serialize) -> Result<String> {
    serde_json::to_string(value).map_err(|e| e.to_string())
}
pub(crate) fn from_json<T: serde::de::DeserializeOwned>(value: &str) -> Result<T> {
    serde_json::from_str(value).map_err(|e| format!("Stored nutrition could not be read: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(id: &str, date: &str, kcal: f64, revision: Option<i64>) -> EntryInput {
        EntryInput {
            id: id.into(),
            date: date.into(),
            meal: "Lunch".into(),
            name: "Test meal".into(),
            kcal,
            revision,
            nutrition: NutritionSnapshot::default(),
        }
    }

    #[test]
    fn diary_survives_reopen_and_migrations_preserve_settings() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("diary.sqlite3");
        let id = uuid::Uuid::new_v4().to_string();
        {
            let mut db = Database::open(&path).unwrap();
            db.save(input(&id, "2026-09-30", 450.5, None)).unwrap();
            db.save_settings(Settings {
                theme: "dark".into(),
            })
            .unwrap();
        }
        let db = Database::open(&path).unwrap();
        assert_eq!(db.day("2026-09-30").unwrap().total_kcal, 450.5);
        assert_eq!(db.settings().unwrap().theme, "dark");
        assert_eq!(db.day("2026-10-01").unwrap().total_kcal, 0.0);
        assert_eq!(
            db.day("2026-10-01").unwrap().total_kcal.to_bits(),
            0.0_f64.to_bits()
        );
    }

    #[test]
    fn duplicate_saves_edits_deletes_and_undo_are_consistent() {
        let mut db = Database::open(Path::new(":memory:")).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let first = db.save(input(&id, "2026-09-30", 500.0, None)).unwrap();
        assert_eq!(
            db.save(input(&id, "2026-09-30", 500.0, None)).unwrap(),
            first
        );
        db.complete_day("2026-09-30", true).unwrap();
        db.save(input(&id, "2026-09-30", 500.0, None)).unwrap();
        assert!(db.day("2026-09-30").unwrap().complete);
        assert!(db.save(input(&id, "2026-09-30", 999.0, None)).is_err());
        let edited = db
            .save(input(&id, "2026-10-01", 650.0, Some(first.revision)))
            .unwrap();
        assert_eq!(db.day("2026-09-30").unwrap().total_kcal, 0.0);
        assert_eq!(db.day("2026-10-01").unwrap().total_kcal, 650.0);
        assert!(db
            .save(input(&id, "2026-10-01", 800.0, Some(first.revision)))
            .is_err());
        let deleted = db.set_deleted(&id, edited.revision, true).unwrap();
        assert_eq!(db.day("2026-10-01").unwrap().entries.len(), 0);
        assert!(db.set_deleted(&id, edited.revision, false).is_err());
        db.set_deleted(&id, deleted.revision, false).unwrap();
        assert_eq!(db.day("2026-10-01").unwrap().total_kcal, 650.0);
    }

    #[test]
    fn rejects_invalid_input_without_changing_totals() {
        let mut db = Database::open(Path::new(":memory:")).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        for kcal in [-1.0, f64::NAN, f64::INFINITY, 100001.0] {
            assert!(db.save(input(&id, "2026-09-30", kcal, None)).is_err());
        }
        assert!(db.save(input(&id, "2026-02-30", 10.0, None)).is_err());
        assert!(db.save(input(&id, "2026-9-30", 10.0, None)).is_err());
        let mut blank = input(&id, "2026-09-30", 0.0, None);
        blank.name = "  ".into();
        assert!(db.save(blank).is_err());
        assert_eq!(db.day("2026-09-30").unwrap().entries.len(), 0);
        assert!(db
            .save_settings(Settings {
                theme: "invalid".into()
            })
            .is_err());
    }

    #[test]
    fn multiple_entries_sum_and_future_schema_is_preserved() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("diary.sqlite3");
        let mut db = Database::open(&path).unwrap();
        for kcal in [100.25, 200.25, 0.0] {
            db.save(input(
                &uuid::Uuid::new_v4().to_string(),
                "2026-09-30",
                kcal,
                None,
            ))
            .unwrap();
        }
        assert_eq!(db.day("2026-09-30").unwrap().total_kcal, 300.5);
        db.connection
            .pragma_update(None, "user_version", 99)
            .unwrap();
        drop(db);
        assert!(Database::open(&path).is_err());
        let connection = Connection::open(&path).unwrap();
        assert_eq!(
            connection
                .query_row("SELECT count(*) FROM diary_entries", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            3
        );
    }

    #[test]
    fn migration_from_foundation_preserves_unknown_nutrients_and_records() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("v1.sqlite3");
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch(include_str!("../migrations/001_foundation.sql"))
            .unwrap();
        connection.pragma_update(None, "user_version", 1).unwrap();
        connection.execute("INSERT INTO diary_entries (id,diary_date,meal,name,kcal,created_at,updated_at) VALUES (?1,'2026-09-30','Lunch','Legacy',450.5,'2026-09-30T23:59:00Z','2026-09-30T23:59:00Z')",[uuid::Uuid::new_v4().to_string()]).unwrap();
        drop(connection);
        let db = Database::open(&path).unwrap();
        let day = db.day("2026-09-30").unwrap();
        assert_eq!(day.total_kcal, 450.5);
        assert_eq!(day.protein.known_entries, 0);
        assert_eq!(day.entries[0].nutrition.timezone, None);
        let timestamp: String = db
            .connection
            .query_row(
                "SELECT created_at FROM diary_entries WHERE name='Legacy'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(timestamp, "2026-09-30T23:59:00Z");
        assert_eq!(db.library().unwrap().foods.len(), 6);
        drop(db);
        assert_eq!(
            Database::open(&path)
                .unwrap()
                .library()
                .unwrap()
                .foods
                .len(),
            6
        );
    }

    #[test]
    fn goals_preserve_past_snapshots_and_respect_scheduled_changes() {
        let mut db = Database::open(Path::new(":memory:")).unwrap();
        db.day("2026-09-30").unwrap();
        db.day("2026-10-01").unwrap();
        let goal = |date: &str, kcal| Goal {
            effective_date: date.into(),
            kcal,
            estimate: None,
        };
        assert!(db
            .save_goal(goal("2026-09-30", 2000.0), "2026-10-01")
            .is_err());
        db.save_goal(goal("2026-10-01", 2000.0), "2026-10-01")
            .unwrap();
        db.day("2026-10-02").unwrap();
        db.save_goal(goal("2026-10-03", 2200.0), "2026-10-01")
            .unwrap();
        db.day("2026-10-04").unwrap();
        db.save_goal(goal("2026-10-02", 1800.0), "2026-10-02")
            .unwrap();
        assert_eq!(db.day("2026-09-30").unwrap().target, None);
        assert_eq!(db.day("2026-10-01").unwrap().target.unwrap().kcal, 2000.0);
        assert_eq!(db.day("2026-10-02").unwrap().target.unwrap().kcal, 1800.0);
        assert_eq!(db.day("2026-10-04").unwrap().target.unwrap().kcal, 2200.0);
        assert_eq!(db.day("2026-10-05").unwrap().target.unwrap().kcal, 2200.0);
        assert_eq!(db.goals().unwrap().len(), 3);
    }

    #[test]
    fn custom_food_edits_and_timezone_changes_leave_logged_snapshots_intact() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("diary.sqlite3");
        let mut db = Database::open(&path).unwrap();
        let mut food = db.library().unwrap().foods.remove(0);
        food.id = uuid::Uuid::new_v4().to_string();
        food.name = "Custom example".into();
        food.nutrients.carbohydrate = None;
        food.portions = vec![];
        let saved = db.save_food(food).unwrap();
        db.favorite(&saved.id, true).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let mut first = input(&id, "2026-10-01", 0.0, None);
        first.nutrition.food_portion = Some(crate::nutrition::FoodPortion {
            food: saved.clone(),
            quantity: 150.0,
            unit: "g".into(),
        });
        first.nutrition.timezone = Some("America/Toronto".into());
        let entry = db.save(first).unwrap();
        let energy = entry.kcal;
        let mut updated = saved.clone();
        updated.nutrients.kcal = Some(999.0);
        assert_eq!(db.save_food(updated.clone()).unwrap().version, 2);
        assert!(db.save_food(updated).is_err());
        let day = db.day("2026-10-01").unwrap();
        assert_eq!(day.entries[0].kcal, energy);
        assert_eq!(day.carbohydrate.known_entries, 0);
        let mut repeat = input(
            &uuid::Uuid::new_v4().to_string(),
            "2026-10-02",
            entry.kcal,
            None,
        );
        repeat.nutrition = entry.nutrition.clone();
        repeat.nutrition.timezone = Some("Asia/Tokyo".into());
        db.save(repeat).unwrap();
        drop(db);
        let db = Database::open(&path).unwrap();
        assert_eq!(
            db.day("2026-10-01").unwrap().entries[0]
                .nutrition
                .timezone
                .as_deref(),
            Some("America/Toronto")
        );
        assert_eq!(db.day("2026-10-02").unwrap().total_kcal, energy);
        assert!(
            db.library()
                .unwrap()
                .foods
                .iter()
                .find(|f| f.id == saved.id)
                .unwrap()
                .favorite
        );
    }

    #[test]
    fn weekly_coverage_counts_only_complete_days_and_changes_reopen_both_dates() {
        let mut db = Database::open(Path::new(":memory:")).unwrap();
        assert_eq!(db.week("2026-10-07").unwrap().average_kcal, None);
        let id = uuid::Uuid::new_v4().to_string();
        let entry = db.save(input(&id, "2026-10-01", 600.0, None)).unwrap();
        db.save(input(
            &uuid::Uuid::new_v4().to_string(),
            "2026-10-02",
            900.0,
            None,
        ))
        .unwrap();
        db.complete_day("2026-10-01", true).unwrap();
        db.complete_day("2026-10-03", true).unwrap();
        let week = db.week("2026-10-07").unwrap();
        assert_eq!(week.average_kcal, Some(300.0));
        assert_eq!(week.complete_days, 2);
        assert_eq!(week.logged_days, 2);
        db.complete_day("2026-10-04", true).unwrap();
        let moved = db
            .save(input(&id, "2026-10-04", 600.0, Some(entry.revision)))
            .unwrap();
        assert!(!db.day("2026-10-01").unwrap().complete);
        assert!(!db.day("2026-10-04").unwrap().complete);
        db.complete_day("2026-10-04", true).unwrap();
        let removed = db.set_deleted(&id, moved.revision, true).unwrap();
        assert!(!db.day("2026-10-04").unwrap().complete);
        db.complete_day("2026-10-04", true).unwrap();
        db.set_deleted(&id, removed.revision, false).unwrap();
        assert!(!db.day("2026-10-04").unwrap().complete);
    }
}
