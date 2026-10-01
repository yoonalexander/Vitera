//! Portable data only: fixed tables and bound values, never imported SQL or credentials.
use crate::{
    ai::AiConfig,
    db::{validate_date, Database, EntryInput},
    metrics::{canonical, Metric},
    nutrition::{estimate, valid_name, validate_target, Food, Goal, Nutrients, NutritionSnapshot},
    recipes::{Recipe, SavedMeal},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{
    params_from_iter,
    types::{Value as SqlValue, ValueRef},
    Connection,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashSet, io::Write, path::Path};

type Result<T> = std::result::Result<T, String>;
pub const MAX_BYTES: usize = 64 * 1024 * 1024;
const MAX_ROWS: usize = 100_000;
// Ordered for foreign keys. Column types: t=text, i=integer, r=real, j=nullable
// JSON text, b=base64 blob. AI credential references are deliberately absent.
const TABLES: &[(&str, &str, &str)] = &[
    ("settings", "id,theme", "it"),
    ("foods", "id,record", "tt"),
    (
        "goal_versions",
        "id,effective_date,record,created_at",
        "ittt",
    ),
    ("diary_days", "diary_date,target,complete", "tji"),
    (
        "diary_entries",
        "id,diary_date,meal,name,kcal,revision,created_at,updated_at,deleted,nutrition",
        "ttttrittij",
    ),
    (
        "metric_entries",
        "id,diary_date,recorded_at,kind,label,record,revision,deleted",
        "ttttttii",
    ),
    ("recipe_versions", "id,version,record", "tit"),
    ("saved_meal_versions", "id,version,record", "tit"),
    ("ai_config", "id,record", "it"),
    ("ai_saves", "request_id,reviewed_request", "tt"),
    ("photo_saves", "request_id,photo_id,retained", "tti"),
    ("photo_attachments", "request_id,jpeg,width,height", "tbii"),
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    format: String,
    version: u32,
    schema: u32,
    created_at: String,
    tables: Vec<Table>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Table {
    name: String,
    rows: Vec<Vec<Value>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub created_at: String,
    pub entries: usize,
    pub deleted_entries: usize,
    pub metrics: usize,
    pub recipes: usize,
    pub saved_meals: usize,
    pub foods: usize,
    pub goals: usize,
    pub days: usize,
    pub attachments: usize,
}
fn err(e: impl std::fmt::Display) -> String {
    format!("Backup data could not be read: {e}. Current records are unchanged.")
}
fn require(ok: bool) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(
            "Backup contains invalid or inconsistent records. Current records are unchanged."
                .into(),
        )
    }
}
fn uuid(s: &str) -> Result<()> {
    uuid::Uuid::parse_str(s).map(|_| ()).map_err(err)
}
fn timestamp(s: &str) -> Result<()> {
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|_| ())
        .map_err(err)
}
fn text(row: &[Value], n: usize) -> Result<&str> {
    row[n].as_str().ok_or_else(|| err("expected text"))
}
fn number(row: &[Value], n: usize) -> Result<i64> {
    row[n].as_i64().ok_or_else(|| err("expected integer"))
}
fn record<T: serde::de::DeserializeOwned>(row: &[Value], n: usize) -> Result<T> {
    serde_json::from_str(text(row, n)?).map_err(err)
}
fn goal(g: &Goal) -> Result<()> {
    validate_date(&g.effective_date)?;
    validate_target(g.kcal)?;
    if let Some(input) = &g.estimate {
        require((estimate(input)?.target - g.kcal).abs() < 1e-7)?;
    }
    Ok(())
}
fn snapshot(n: &NutritionSnapshot, kcal: f64) -> Result<()> {
    Nutrients {
        kcal: Some(kcal),
        protein: n.protein,
        carbohydrate: n.carbohydrate,
        fat: n.fat,
    }
    .validate()?;
    require(n.food_portion.is_none() || n.recipe_portion.is_none())?;
    if let Some(p) = &n.food_portion {
        p.calculate()?;
    }
    if let Some(p) = &n.recipe_portion {
        p.calculate()?;
    }
    if let Some(a) = &n.ai {
        a.validate()?;
    }
    require(n.timezone.as_ref().is_none_or(|s| valid_name(s)))?;
    if let Some(c) = &n.macro_coverage {
        for v in [&c.protein, &c.carbohydrate, &c.fat] {
            require(v.known <= v.total && v.total <= 100)?;
        }
    }
    Ok(())
}
fn input(e: &EntryInput) -> Result<()> {
    uuid(&e.id)?;
    validate_date(&e.date)?;
    require(
        valid_name(&e.name)
            && ["Breakfast", "Lunch", "Dinner", "Snacks"].contains(&e.meal.as_str()),
    )?;
    snapshot(&e.nutrition, e.kcal)
}

impl Backup {
    pub fn parse(data: &str) -> Result<Self> {
        require(data.len() <= MAX_BYTES)?;
        let backup: Self = serde_json::from_str(data).map_err(|_| "Choose a complete Vitera .vitera or legacy .calpal backup. The file is invalid; current records are unchanged.".to_string())?;
        if !["Vitera backup", "CalPal backup"].contains(&backup.format.as_str())
            || backup.version != 1
            || backup.schema != 5
        {
            return Err("This backup format requires a compatible Vitera version. Current records are unchanged.".into());
        }
        backup.validate()?;
        Ok(backup)
    }
    pub fn summary(&self) -> Summary {
        let rows = |i: usize| self.tables[i].rows.len();
        let entries = self.tables[4].rows.iter().filter(|r| r[8] == 0).count();
        Summary {
            created_at: self.created_at.clone(),
            entries,
            deleted_entries: rows(4) - entries,
            metrics: self.tables[5].rows.iter().filter(|r| r[7] == 0).count(),
            recipes: rows(6),
            saved_meals: rows(7),
            foods: rows(1),
            goals: rows(2),
            days: rows(3),
            attachments: rows(11),
        }
    }
    pub fn encode(&self) -> Result<String> {
        if self.tables.iter().map(|t| t.rows.len()).sum::<usize>() > MAX_ROWS {
            return Err("This backup exceeds the current 100,000-row limit. No file was written; existing records are intact.".into());
        }
        let data = serde_json::to_string(self).map_err(err)?;
        if data.len() > MAX_BYTES {
            return Err("This backup exceeds the current 64 MiB limit. No file was written; existing records are intact.".into());
        }
        Ok(data)
    }
    fn validate(&self) -> Result<()> {
        timestamp(&self.created_at)?;
        require(
            self.tables.len() == TABLES.len()
                && self.tables.iter().map(|t| t.rows.len()).sum::<usize>() <= MAX_ROWS,
        )?;
        for (table, (name, columns, types)) in self.tables.iter().zip(TABLES) {
            require(table.name == *name)?;
            let types: Vec<char> = types.chars().filter(|c| !c.is_whitespace()).collect();
            require(types.len() == columns.split(',').count())?;
            for row in &table.rows {
                require(row.len() == types.len())?;
                for (v, t) in row.iter().zip(&types) {
                    require(match t {
                        't' | 'b' => v.is_string(),
                        'i' => v.as_i64().is_some(),
                        'r' => v.as_f64().is_some_and(|n| n.is_finite()),
                        'j' => v.is_null() || v.is_string(),
                        _ => false,
                    })?;
                }
            }
        }
        require(
            self.tables[0].rows.len() == 1
                && self.tables[0].rows[0][0] == 1
                && ["system", "light", "dark"].contains(&text(&self.tables[0].rows[0], 1)?),
        )?;
        for r in &self.tables[1].rows {
            let f: Food = record(r, 1)?;
            f.validate()?;
            require(f.id == text(r, 0)? && f.version >= 1)?;
        }
        for r in &self.tables[2].rows {
            let g: Goal = record(r, 2)?;
            goal(&g)?;
            require(number(r, 0)? > 0 && g.effective_date == text(r, 1)?)?;
            timestamp(text(r, 3)?)?;
        }
        for r in &self.tables[3].rows {
            validate_date(text(r, 0)?)?;
            require([0, 1].contains(&number(r, 2)?))?;
            if !r[1].is_null() {
                goal(&record(r, 1)?)?;
            }
        }
        for r in &self.tables[4].rows {
            let e = EntryInput {
                id: text(r, 0)?.into(),
                date: text(r, 1)?.into(),
                meal: text(r, 2)?.into(),
                name: text(r, 3)?.into(),
                kcal: r[4].as_f64().unwrap(),
                revision: None,
                nutrition: if r[9].is_null() {
                    NutritionSnapshot::default()
                } else {
                    record(r, 9)?
                },
            };
            input(&e)?;
            require(number(r, 5)? > 0 && [0, 1].contains(&number(r, 8)?))?;
            timestamp(text(r, 6)?)?;
            timestamp(text(r, 7)?)?;
        }
        for r in &self.tables[5].rows {
            let m: Metric = record(r, 5)?;
            uuid(&m.id)?;
            validate_date(&m.date)?;
            timestamp(&m.recorded_at)?;
            require(
                valid_name(&m.label)
                    && valid_name(&m.timezone)
                    && m.note.chars().count() <= 1000
                    && m.revision > 0
                    && (canonical(&m.kind, m.value, &m.unit)? - m.canonical_value).abs() < 1e-7,
            )?;
            // Deleted metrics keep the pre-delete JSON revision in the existing schema.
            require(
                m.id == text(r, 0)?
                    && m.date == text(r, 1)?
                    && m.recorded_at == text(r, 2)?
                    && m.kind == text(r, 3)?
                    && m.label == text(r, 4)?
                    && [0, 1].contains(&number(r, 7)?)
                    && number(r, 6)? == m.revision + number(r, 7)?,
            )?;
        }
        for r in &self.tables[6].rows {
            let p: Recipe = record(r, 2)?;
            p.calculate()?;
            require(p.id == text(r, 0)? && p.version == number(r, 1)?)?;
        }
        for r in &self.tables[7].rows {
            let m: SavedMeal = record(r, 2)?;
            m.validate()?;
            require(m.id == text(r, 0)? && m.version == number(r, 1)? && m.version > 0)?;
            for i in m.items {
                snapshot(&i.nutrition, i.kcal)?;
            }
        }
        require(self.tables[8].rows.len() <= 1)?;
        for r in &self.tables[8].rows {
            require(r[0] == 1)?;
            record::<AiConfig>(r, 1)?.validate()?;
        }
        let mut receipts = HashSet::new();
        for r in &self.tables[9].rows {
            let id = text(r, 0)?;
            uuid(id)?;
            require(receipts.insert(id))?;
            let entries: Vec<EntryInput> = record(r, 1)?;
            require(!entries.is_empty() && entries.len() <= 100)?;
            let mut ids = HashSet::new();
            for e in entries {
                input(&e)?;
                require(
                    ids.insert(e.id.clone())
                        && e.nutrition.ai.as_ref().is_some_and(|a| a.request_id == id),
                )?;
            }
        }
        let mut photos = HashSet::new();
        for r in &self.tables[10].rows {
            require(
                receipts.contains(text(r, 0)?)
                    && photos.insert(text(r, 0)?)
                    && [0, 1].contains(&number(r, 2)?),
            )?;
            uuid(text(r, 1)?)?;
            let receipt = self.tables[9]
                .rows
                .iter()
                .find(|s| s[0] == r[0])
                .ok_or_else(|| err("missing photo receipt"))?;
            let entries: Vec<EntryInput> = record(receipt, 1)?;
            let id = text(r, 1)?;
            require(entries.iter().all(|e| {
                e.nutrition
                    .ai
                    .as_ref()
                    .and_then(|a| a.photo.as_ref())
                    .is_some_and(|p| p.id == id)
            }))?;
        }
        for r in &self.tables[11].rows {
            let bytes = STANDARD.decode(text(r, 1)?).map_err(err)?;
            require(bytes.len() <= 8 * 1024 * 1024 && photos.contains(text(r, 0)?))?;
            let decoder =
                image::codecs::jpeg::JpegDecoder::new(std::io::Cursor::new(&bytes)).map_err(err)?;
            use image::ImageDecoder;
            let (w, h) = decoder.dimensions();
            require(
                w > 0
                    && h > 0
                    && w <= 1280
                    && h <= 1280
                    && w as i64 == number(r, 2)?
                    && h as i64 == number(r, 3)?,
            )?;
            image::DynamicImage::from_decoder(decoder).map_err(err)?;
            require(
                self.tables[10]
                    .rows
                    .iter()
                    .any(|p| p[0] == r[0] && p[2] == 1),
            )?;
            let receipt = self.tables[9]
                .rows
                .iter()
                .find(|s| s[0] == r[0])
                .ok_or_else(|| err("missing photo receipt"))?;
            let entries: Vec<EntryInput> = record(receipt, 1)?;
            require(entries.iter().all(|e| {
                e.nutrition
                    .ai
                    .as_ref()
                    .and_then(|a| a.photo.as_ref())
                    .is_some_and(|p| p.width == w && p.height == h)
            }))?;
        }
        // Build the known schema ourselves. Constraints, duplicate primary keys and
        // foreign keys are checked without trusting any imported SQL or schema.
        let mut staging = Database::open(Path::new(":memory:"))?;
        let tx = staging.connection.transaction().map_err(err)?;
        replace(&tx, self)?;
        let violations: i64 = tx
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| {
                r.get(0)
            })
            .map_err(err)?;
        require(violations == 0)?;
        Ok(()) // Dropping the uncommitted staging transaction releases everything.
    }
}

fn replace(conn: &Connection, backup: &Backup) -> Result<()> {
    for (name, _, _) in TABLES.iter().rev() {
        conn.execute(&format!("DELETE FROM {name}"), [])
            .map_err(err)?;
    }
    for (table, (name, columns, types)) in backup.tables.iter().zip(TABLES) {
        let types: Vec<char> = types.chars().filter(|c| !c.is_whitespace()).collect();
        let extra = if *name == "ai_config" {
            ",credential_ref"
        } else {
            ""
        };
        let count = types.len() + usize::from(!extra.is_empty());
        let sql = format!(
            "INSERT INTO {name} ({columns}{extra}) VALUES ({})",
            vec!["?"; count].join(",")
        );
        let mut statement = conn.prepare(&sql).map_err(err)?;
        for row in &table.rows {
            let mut values = Vec::new();
            for (v, t) in row.iter().zip(&types) {
                values.push(match t {
                    'i' => SqlValue::Integer(v.as_i64().ok_or_else(|| err("integer"))?),
                    'r' => SqlValue::Real(v.as_f64().ok_or_else(|| err("number"))?),
                    'b' => SqlValue::Blob(
                        STANDARD
                            .decode(v.as_str().ok_or_else(|| err("image"))?)
                            .map_err(err)?,
                    ),
                    'j' if v.is_null() => SqlValue::Null,
                    _ => SqlValue::Text(v.as_str().ok_or_else(|| err("text"))?.to_string()),
                });
            }
            if !extra.is_empty() {
                let mut cfg: AiConfig = record(row, 1)?;
                cfg.enabled = false;
                values[1] = SqlValue::Text(serde_json::to_string(&cfg).map_err(err)?);
                values.push(SqlValue::Text(uuid::Uuid::new_v4().to_string()));
            }
            statement.execute(params_from_iter(values)).map_err(err)?;
        }
    }
    // Keep future goal IDs above the restored maximum, including after replacement.
    conn.execute("DELETE FROM sqlite_sequence WHERE name='goal_versions'", [])
        .map_err(err)?;
    conn.execute("INSERT INTO sqlite_sequence(name,seq) SELECT 'goal_versions',coalesce(max(id),0) FROM goal_versions",[]).map_err(err)?;
    Ok(())
}

impl Database {
    pub fn backup(&self) -> Result<Backup> {
        // A read transaction also protects against another Vitera process
        // committing a write between table reads. The in-process mutex alone
        // cannot provide that guarantee.
        let snapshot = if self.connection.is_autocommit() {
            Some(self.connection.unchecked_transaction().map_err(err)?)
        } else {
            None // A restore already owns the immediate transaction.
        };
        let mut tables = Vec::new();
        for (name, columns, _) in TABLES {
            let mut statement = self
                .connection
                .prepare(&format!("SELECT {columns} FROM {name} ORDER BY 1,2"))
                .map_err(err)?;
            let count = statement.column_count();
            let rows = statement
                .query_map([], |row| {
                    (0..count)
                        .map(|i| {
                            Ok(match row.get_ref(i)? {
                                ValueRef::Null => Value::Null,
                                ValueRef::Integer(n) => Value::from(n),
                                ValueRef::Real(n) => Value::from(n),
                                ValueRef::Text(t) => {
                                    Value::String(String::from_utf8_lossy(t).into_owned())
                                }
                                ValueRef::Blob(b) => Value::String(STANDARD.encode(b)),
                            })
                        })
                        .collect::<rusqlite::Result<Vec<_>>>()
                })
                .map_err(err)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(err)?;
            tables.push(Table {
                name: (*name).into(),
                rows,
            });
        }
        if let Some(snapshot) = snapshot {
            snapshot.commit().map_err(err)?;
        }
        Ok(Backup {
            format: "Vitera backup".into(),
            version: 1,
            schema: 5,
            created_at: chrono::Utc::now().to_rfc3339(),
            tables,
        })
    }
    pub fn restore_backup(&mut self, backup: &Backup, directory: &Path) -> Result<String> {
        backup.validate()?;
        // Prevent another process from changing records after recovery capture
        // but before replacement. Failures drop this transaction and roll back.
        let tx = rusqlite::Transaction::new_unchecked(
            &self.connection,
            rusqlite::TransactionBehavior::Immediate,
        )
        .map_err(err)?;
        let previous = self.backup()?.encode()?;
        std::fs::create_dir_all(directory).map_err(|_|"Could not create the recovery folder. Restore was cancelled; current records are unchanged.")?;
        let recovery = directory.join(format!("before-restore-{}.vitera", uuid::Uuid::new_v4()));
        write_atomic(&recovery, previous.as_bytes())?;
        replace(&tx, backup)?;
        tx.commit().map_err(err)?;
        Ok(recovery.to_string_lossy().into_owned())
    }
    pub fn export_csv(&self, kind: &str) -> Result<String> {
        let backup = self.backup()?;
        let mut lines = Vec::new();
        match kind {
            "diary" => {
                lines.push(csv(&[
                    "id",
                    "date",
                    "meal",
                    "name",
                    "kcal",
                    "protein_g",
                    "carbohydrate_g",
                    "fat_g",
                    "macro_coverage_json",
                    "timezone",
                    "energy_type",
                    "source_snapshot_json",
                    "ai_provenance_json",
                    "created_at",
                    "updated_at",
                ]
                .map(str::to_string)));
                for r in &backup.tables[4].rows {
                    if r[8] != 0 {
                        continue;
                    }
                    let n: NutritionSnapshot = if r[9].is_null() {
                        NutritionSnapshot::default()
                    } else {
                        record(r, 9)?
                    };
                    let optional = |v: Option<f64>| v.map(|n| n.to_string()).unwrap_or_default();
                    let encoded = |v: Value| {
                        if v.is_null() {
                            String::new()
                        } else {
                            v.to_string()
                        }
                    };
                    let source = serde_json::json!({"foodPortion":n.food_portion,"recipePortion":n.recipe_portion});
                    lines.push(csv(&[
                        text(r, 0)?.into(),
                        text(r, 1)?.into(),
                        text(r, 2)?.into(),
                        text(r, 3)?.into(),
                        r[4].to_string(),
                        optional(n.protein),
                        optional(n.carbohydrate),
                        optional(n.fat),
                        encoded(serde_json::to_value(n.macro_coverage).map_err(err)?),
                        n.timezone.unwrap_or_default(),
                        n.energy_type.unwrap_or_default(),
                        source.to_string(),
                        encoded(serde_json::to_value(n.ai).map_err(err)?),
                        text(r, 6)?.into(),
                        text(r, 7)?.into(),
                    ]));
                }
            }
            "metrics" => {
                lines.push(csv(&[
                    "id",
                    "date",
                    "recorded_at",
                    "timezone",
                    "kind",
                    "label",
                    "value",
                    "unit",
                    "canonical_value",
                    "note",
                ]
                .map(str::to_string)));
                for r in &backup.tables[5].rows {
                    if r[7] != 0 {
                        continue;
                    }
                    let m: Metric = record(r, 5)?;
                    lines.push(csv(&[
                        m.id,
                        m.date,
                        m.recorded_at,
                        m.timezone,
                        m.kind,
                        m.label,
                        m.value.to_string(),
                        m.unit,
                        m.canonical_value.to_string(),
                        m.note,
                    ]));
                }
            }
            _ => return Err("Choose diary or metrics export.".into()),
        }
        Ok(format!("\u{feff}{}\r\n", lines.join("\r\n")))
    }
}
fn csv(values: &[String]) -> String {
    values
        .iter()
        .map(|v| {
            // Protect spreadsheet formula evaluation, including leading whitespace.
            let unsafe_cell = v
                .trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
                .starts_with(['=', '+', '-', '@']);
            let prefix = if unsafe_cell { "'" } else { "" };
            format!("\"{prefix}{}\"", v.replace('"', "\"\""))
        })
        .collect::<Vec<_>>()
        .join(",")
}
pub fn write_atomic(path: &Path, data: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or("Choose a destination folder.")?;
    let mut file=tempfile::NamedTempFile::new_in(parent).map_err(|_|"Could not write in the selected folder. Choose another location; current records are intact.")?;
    file.write_all(data).map_err(|_| "The export could not be written. Free disk space or choose another folder; current records are intact.")?;
    file.as_file().sync_all().map_err(|_| {
        "The export could not be saved durably. Choose another folder; current records are intact."
    })?;
    file.persist(path).map_err(|_|"Could not finish saving the file. Close any program using it and retry; current records are intact.")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Database {
        Database::open(Path::new(":memory:")).unwrap()
    }
    fn add(db: &mut Database, name: &str) {
        db.save(EntryInput {
            id: uuid::Uuid::new_v4().to_string(),
            date: "2026-10-01".into(),
            meal: "Lunch".into(),
            name: name.into(),
            kcal: 123.5,
            revision: None,
            nutrition: NutritionSnapshot::default(),
        })
        .unwrap();
    }
    #[test]
    fn roundtrip_recovery_and_credential_isolation() {
        let mut source = db();
        add(&mut source, "Lunch");
        source.ai_config().unwrap();
        let original = source.ai_config().unwrap().1;
        let secret = "synthetic-backup-exclusion-marker";
        crate::ai::set_secret(&original, Some(secret.into())).unwrap();
        let encoded = source.backup().unwrap().encode();
        let csv = source.export_csv("diary");
        crate::ai::set_secret(&original, None).unwrap();
        assert!(!encoded.as_ref().unwrap().contains(secret));
        assert!(!csv.unwrap().contains(secret));
        let backup = Backup::parse(&encoded.unwrap()).unwrap();
        assert!(!backup.encode().unwrap().contains(&original));
        let mut target = db();
        add(&mut target, "Old record");
        let directory = tempfile::tempdir().unwrap();
        let recovery = target.restore_backup(&backup, directory.path()).unwrap();
        assert_eq!(target.day("2026-10-01").unwrap().entries[0].name, "Lunch");
        assert_ne!(target.ai_config().unwrap().1, original);
        assert!(!target.ai_config().unwrap().0.enabled);
        let previous = Backup::parse(&std::fs::read_to_string(recovery).unwrap()).unwrap();
        target.restore_backup(&previous, directory.path()).unwrap();
        assert_eq!(
            target.day("2026-10-01").unwrap().entries[0].name,
            "Old record"
        );
    }
    #[test]
    fn vitera_reads_legacy_calpal_backups_without_changing_records() {
        let mut source = db();
        add(&mut source, "Before the rename");
        let current = source.backup().unwrap();
        assert_eq!(current.format, "Vitera backup");
        let expected = serde_json::to_value(&current.tables).unwrap();
        let mut legacy = current.clone();
        legacy.format = "CalPal backup".into();
        let parsed = Backup::parse(&legacy.encode().unwrap()).unwrap();
        let mut target = db();
        let directory = tempfile::tempdir().unwrap();
        target.restore_backup(&parsed, directory.path()).unwrap();
        let restored = target.backup().unwrap();
        assert_eq!(restored.format, "Vitera backup");
        assert_eq!(serde_json::to_value(restored.tables).unwrap(), expected);
        legacy.format = "Unrelated backup".into();
        assert!(Backup::parse(&legacy.encode().unwrap()).is_err());
    }
    #[test]
    fn invalid_backups_and_recovery_failure_leave_records_intact() {
        let mut target = db();
        add(&mut target, "Keep me");
        let before = target.backup().unwrap().tables;
        let mut invalid = target.backup().unwrap();
        invalid.tables[4].rows[0][4] = Value::from(-1);
        let directory = tempfile::tempdir().unwrap();
        assert!(target.restore_backup(&invalid, directory.path()).is_err());
        invalid = target.backup().unwrap();
        let duplicate = invalid.tables[4].rows[0].clone();
        invalid.tables[4].rows.push(duplicate);
        assert!(Backup::parse(&invalid.encode().unwrap()).is_err());
        invalid = target.backup().unwrap();
        invalid.version = 99;
        assert!(Backup::parse(&invalid.encode().unwrap()).is_err());
        invalid = target.backup().unwrap();
        invalid.tables[0].name = "sqlite_master".into();
        assert!(Backup::parse(&invalid.encode().unwrap()).is_err());
        let file = directory.path().join("file");
        std::fs::write(&file, "x").unwrap();
        assert!(target
            .restore_backup(&target.backup().unwrap(), &file)
            .is_err());
        assert_eq!(
            serde_json::to_value(before).unwrap(),
            serde_json::to_value(target.backup().unwrap().tables).unwrap()
        );
    }
    #[test]
    fn csv_quotes_unknowns_unicode_and_formula_cells() {
        let mut db = db();
        add(&mut db, " =HYPERLINK(\"bad\")\nCafé");
        let csv = db.export_csv("diary").unwrap();
        assert!(csv.starts_with('\u{feff}'));
        assert!(csv.contains("\"'=HYPERLINK(\"\"bad\"\")\nCafé\""));
        assert!(csv.contains("\"123.5\",\"\",\"\",\"\""));
        assert!(csv.ends_with("\r\n"));
        assert!(db.export_csv("invalid").is_err());
    }
    #[test]
    fn interrupted_replacement_rolls_back_every_table() {
        let mut target = db();
        add(&mut target, "Keep me");
        let before = target.backup().unwrap().tables;
        let mut source = db();
        add(&mut source, "Replacement");
        let incoming = source.backup().unwrap();
        target.connection.execute_batch("CREATE TRIGGER simulate_disk_failure BEFORE INSERT ON diary_entries BEGIN SELECT RAISE(ABORT,'simulated write failure'); END;").unwrap();
        let dir = tempfile::tempdir().unwrap();
        assert!(target.restore_backup(&incoming, dir.path()).is_err());
        assert_eq!(
            serde_json::to_value(before).unwrap(),
            serde_json::to_value(target.backup().unwrap().tables).unwrap()
        );
        let copies = std::fs::read_dir(dir.path()).unwrap().collect::<Vec<_>>();
        assert_eq!(copies.len(), 1);
        assert!(Backup::parse(
            &std::fs::read_to_string(copies[0].as_ref().unwrap().path()).unwrap()
        )
        .is_ok());
    }
    #[test]
    fn atomic_export_replaces_complete_files_and_cleans_up_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("backup.vitera");
        std::fs::write(&path, "old").unwrap();
        write_atomic(&path, b"complete replacement").unwrap();
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "complete replacement"
        );
        let folder = dir.path().join("folder.vitera");
        std::fs::create_dir(&folder).unwrap();
        assert!(write_atomic(&folder, b"fail").is_err());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 2);
    }
    #[test]
    fn backup_is_consistent_while_another_connection_commits() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("shared.sqlite3");
        let mut source = Database::open(&path).unwrap();
        add(&mut source, "Shared record");
        source
            .connection
            .execute("UPDATE settings SET theme='light'", [])
            .unwrap();
        let writer = Database::open(&path).unwrap();
        let thread = std::thread::spawn(move || {
            let mut writer = writer;
            for i in 0..200 {
                let tx = writer.connection.transaction().unwrap();
                let (theme, kcal) = if i % 2 == 0 {
                    ("dark", 456.0)
                } else {
                    ("light", 123.5)
                };
                tx.execute("UPDATE settings SET theme=?1", [theme]).unwrap();
                tx.execute("UPDATE diary_entries SET kcal=?1", [kcal])
                    .unwrap();
                tx.commit().unwrap();
            }
        });
        for _ in 0..100 {
            let backup = source.backup().unwrap();
            let theme = backup.tables[0].rows[0][1].as_str().unwrap();
            let kcal = backup.tables[4].rows[0][4].as_f64().unwrap();
            assert_eq!(kcal, if theme == "light" { 123.5 } else { 456.0 });
        }
        thread.join().unwrap();
    }
}
