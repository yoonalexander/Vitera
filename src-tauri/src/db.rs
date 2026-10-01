use chrono::{NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

type Result<T> = std::result::Result<T, String>;
const COLUMNS: &str = "id, diary_date, meal, name, kcal, revision, deleted";

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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntryInput {
    pub id: String,
    pub date: String,
    pub meal: String,
    pub name: String,
    pub kcal: f64,
    pub revision: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Day {
    pub entries: Vec<Entry>,
    pub total_kcal: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,
}

pub struct Database {
    connection: Connection,
}

fn sql_error(error: rusqlite::Error) -> String {
    format!("Local storage error: {error}")
}

fn read_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<Entry> {
    Ok(Entry {
        id: row.get(0)?,
        date: row.get(1)?,
        meal: row.get(2)?,
        name: row.get(3)?,
        kcal: row.get(4)?,
        revision: row.get(5)?,
        deleted: row.get(6)?,
    })
}

fn validate_date(date: &str) -> Result<()> {
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
        if version > 1 {
            return Err(
                "This database requires a newer CalPal version. Existing records were left intact."
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
        Ok(Day {
            entries,
            total_kcal,
        })
    }

    pub fn save(&mut self, input: EntryInput) -> Result<Entry> {
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
        let transaction = self.connection.transaction().map_err(sql_error)?;
        let now = Utc::now().to_rfc3339();
        match input.revision {
            Some(revision) => {
                let changed = transaction.execute(
                    "UPDATE diary_entries SET diary_date=?1, meal=?2, name=?3, kcal=?4, revision=revision+1, updated_at=?5
                     WHERE id=?6 AND revision=?7 AND deleted=0",
                    params![input.date, input.meal, name, input.kcal, now, input.id, revision],
                ).map_err(sql_error)?;
                if changed != 1 {
                    return Err("This entry changed. Close the form and refresh the diary before editing it again.".into());
                }
            }
            None => {
                transaction.execute(
                    "INSERT INTO diary_entries (id, diary_date, meal, name, kcal, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) ON CONFLICT(id) DO NOTHING",
                    params![input.id, input.date, input.meal, name, input.kcal, now],
                ).map_err(sql_error)?;
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
                {
                    return Err("This entry identifier has already been used. Close the form and try again.".into());
                }
            }
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
}
