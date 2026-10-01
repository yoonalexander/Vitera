use crate::db::{from_json, json, validate_date, Database};
use crate::nutrition::valid_name;
use chrono::{DateTime, NaiveDate, SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

type Result<T> = std::result::Result<T, String>;
fn error(e: rusqlite::Error) -> String {
    format!("Local storage error: {e}")
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Metric {
    pub id: String,
    pub date: String,
    pub recorded_at: String,
    pub timezone: String,
    pub kind: String,
    pub label: String,
    pub value: f64,
    pub unit: String,
    pub canonical_value: f64,
    pub note: String,
    pub revision: i64,
}
pub fn canonical(kind: &str, value: f64, unit: &str) -> Result<f64> {
    if !value.is_finite() || value <= 0.0 {
        return Err("Enter a positive finite measurement.".into());
    }
    let factor = match (kind, unit) {
        ("weight", "kg") | ("measurement", "cm") | ("bodyFat", "%") | ("water", "ml") => 1.0,
        ("weight", "lb") => 0.45359237,
        ("measurement", "in") => 2.54,
        ("water", "l") => 1000.0,
        ("water", "fl oz (US)") => 29.5735295625,
        _ => return Err("Choose a supported measurement unit.".into()),
    };
    let value = value * factor;
    let max = match kind {
        "weight" => 1000.0,
        "measurement" => 1000.0,
        "bodyFat" => 100.0,
        "water" => 100000.0,
        _ => return Err("Choose a measurement type.".into()),
    };
    if !value.is_finite() || value > max {
        return Err("Measurement is out of range.".into());
    }
    Ok(value)
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricPoint {
    pub date: String,
    pub value: Option<f64>,
    pub mean: Option<f64>,
    pub mean_samples: usize,
    pub measurements: usize,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricHistory {
    pub entries: Vec<Metric>,
    pub points: Vec<MetricPoint>,
    pub recorded_days: usize,
    pub change: Option<f64>,
    pub canonical_unit: String,
}
impl Database {
    pub fn save_metric(&mut self, mut metric: Metric) -> Result<Metric> {
        uuid::Uuid::parse_str(&metric.id).map_err(|_| "Measurement identifier is invalid.")?;
        validate_date(&metric.date)?;
        metric.canonical_value = canonical(&metric.kind, metric.value, &metric.unit)?;
        metric.label = match metric.kind.as_str() {
            "weight" => "Weight".into(),
            "bodyFat" => "Body fat".into(),
            "water" => "Water".into(),
            _ => metric.label.trim().into(),
        };
        if !valid_name(&metric.label)
            || !valid_name(&metric.timezone)
            || metric.note.chars().count() > 1000
        {
            return Err("Check measurement name, timezone and note length.".into());
        }
        metric.recorded_at = DateTime::parse_from_rfc3339(&metric.recorded_at)
            .map_err(|_| "Choose a valid measurement date and time.")?
            .with_timezone(&Utc)
            .to_rfc3339_opts(SecondsFormat::Millis, true);
        let tx = self.connection.transaction().map_err(error)?;
        let old: Option<(String, bool)> = tx
            .query_row(
                "SELECT record,deleted FROM metric_entries WHERE id=?1",
                [&metric.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(error)?;
        if let Some((record, deleted)) = old {
            let old: Metric = from_json(&record)?;
            let mut compare = metric.clone();
            compare.revision = old.revision;
            if !deleted && old == compare {
                return Ok(old);
            }
            if deleted || old.revision != metric.revision {
                return Err("Measurement changed. Reopen it before editing.".into());
            }
            metric.revision += 1;
        } else {
            if metric.revision != 0 {
                return Err("This measurement no longer exists.".into());
            }
            metric.revision = 1;
        }
        tx.execute("INSERT INTO metric_entries (id,diary_date,recorded_at,kind,label,record,revision) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET diary_date=excluded.diary_date,recorded_at=excluded.recorded_at,kind=excluded.kind,label=excluded.label,record=excluded.record,revision=excluded.revision",params![metric.id,metric.date,metric.recorded_at,metric.kind,metric.label,json(&metric)?,metric.revision]).map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(metric)
    }
    pub fn delete_metric(&self, id: &str, revision: i64) -> Result<()> {
        let changed=self.connection.execute("UPDATE metric_entries SET deleted=1,revision=revision+1 WHERE id=?1 AND revision=?2 AND deleted=0",params![id,revision]).map_err(error)?;
        if changed != 1 {
            return Err("Measurement changed. Refresh and try again.".into());
        }
        Ok(())
    }
    pub fn metric_history(
        &self,
        end: &str,
        days: i64,
        kind: &str,
        label: &str,
    ) -> Result<MetricHistory> {
        validate_date(end)?;
        if !(7..=365).contains(&days) {
            return Err("Choose 7 to 365 days.".into());
        }
        canonical(
            kind,
            1.0,
            match kind {
                "weight" => "kg",
                "measurement" => "cm",
                "bodyFat" => "%",
                _ => "ml",
            },
        )?;
        let end = NaiveDate::parse_from_str(end, "%Y-%m-%d").unwrap();
        let start = end
            .checked_sub_signed(chrono::Duration::days(days - 1))
            .ok_or("Date out of range.")?;
        let fetch_start = start
            .checked_sub_signed(chrono::Duration::days(6))
            .ok_or("Date out of range.")?;
        let mut stmt=self.connection.prepare("SELECT record FROM metric_entries WHERE deleted=0 AND kind=?1 AND (?1!='measurement' OR lower(label)=lower(?2)) AND diary_date>=?3 AND diary_date<=?4 ORDER BY diary_date,recorded_at,id").map_err(error)?;
        let rows = stmt
            .query_map(
                params![kind, label, fetch_start.to_string(), end.to_string()],
                |r| r.get::<_, String>(0),
            )
            .map_err(error)?;
        let all: Vec<Metric> = rows
            .map(|r| from_json(&r.map_err(error)?))
            .collect::<Result<_>>()?;
        let mut daily = std::collections::BTreeMap::<String, (f64, usize)>::new();
        for entry in &all {
            let day = daily.entry(entry.date.clone()).or_insert((0.0, 0));
            day.0 = if kind == "water" {
                day.0 + entry.canonical_value
            } else {
                entry.canonical_value
            };
            day.1 += 1;
        }
        let mut points = Vec::new();
        for offset in 0..days {
            let date = start
                .checked_add_signed(chrono::Duration::days(offset))
                .ok_or("Date out of range.")?;
            let mut values = Vec::new();
            for lookback in 0..7 {
                let key = date
                    .checked_sub_signed(chrono::Duration::days(lookback))
                    .ok_or("Date out of range.")?
                    .to_string();
                if let Some(v) = daily.get(&key) {
                    values.push(v.0);
                }
            }
            let day = daily.get(&date.to_string());
            points.push(MetricPoint {
                date: date.to_string(),
                value: day.map(|d| d.0),
                measurements: day.map(|d| d.1).unwrap_or(0),
                mean: if values.is_empty() {
                    None
                } else {
                    Some(values.iter().sum::<f64>() / values.len() as f64)
                },
                mean_samples: values.len(),
            });
        }
        let recorded_days = points.iter().filter(|p| p.value.is_some()).count();
        let first = points.iter().find_map(|p| p.value);
        let last = points.iter().rev().find_map(|p| p.value);
        let change = if recorded_days >= 2 {
            first.zip(last).map(|(a, b)| b - a)
        } else {
            None
        };
        let entries = all
            .into_iter()
            .filter(|m| m.date.as_str() >= start.to_string().as_str())
            .rev()
            .collect();
        Ok(MetricHistory {
            entries,
            points,
            recorded_days,
            change,
            canonical_unit: match kind {
                "weight" => "kg",
                "measurement" => "cm",
                "bodyFat" => "%",
                _ => "ml",
            }
            .into(),
        })
    }
    pub fn metric_labels(&self) -> Result<Vec<String>> {
        let mut stmt=self.connection.prepare("SELECT DISTINCT label FROM metric_entries WHERE kind='measurement' AND deleted=0 ORDER BY label").map_err(error)?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(error)?;
        rows.map(|r| r.map_err(error)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    fn metric(date: &str, time: &str, value: f64, unit: &str, kind: &str) -> Metric {
        Metric {
            id: uuid::Uuid::new_v4().to_string(),
            date: date.into(),
            recorded_at: format!("{date}T{time}Z"),
            timezone: "America/Toronto".into(),
            kind: kind.into(),
            label: "Waist".into(),
            value,
            unit: unit.into(),
            canonical_value: 0.0,
            note: "Synthetic fixture".into(),
            revision: 0,
        }
    }
    fn close(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-8, "{a} != {b}");
    }
    #[test]
    fn mixed_units_and_validation() {
        close(canonical("weight", 200.0, "lb").unwrap(), 90.718474);
        close(canonical("measurement", 32.0, "in").unwrap(), 81.28);
        close(canonical("water", 0.5, "l").unwrap(), 500.0);
        close(canonical("water", 8.0, "fl oz (US)").unwrap(), 236.5882365);
        close(canonical("bodyFat", 22.5, "%").unwrap(), 22.5);
        for (kind, value, unit) in [
            ("water", 0.0, "ml"),
            ("weight", f64::NAN, "kg"),
            ("measurement", f64::INFINITY, "cm"),
            ("bodyFat", 100.1, "%"),
            ("weight", 1.0, "ml"),
        ] {
            assert!(canonical(kind, value, unit).is_err());
        }
    }
    #[test]
    fn multiple_daily_measurements_last_time_means_gaps_and_water_sums() {
        let mut db = Database::open(Path::new(":memory:")).unwrap();
        db.save_metric(metric("2026-10-01", "18:00:00", 80.0, "kg", "weight"))
            .unwrap();
        // Insert the earlier measurement last to prove timestamp order, not insertion order.
        db.save_metric(metric("2026-10-01", "08:00:00", 200.0, "lb", "weight"))
            .unwrap();
        db.save_metric(metric("2026-10-03", "08:00:00", 82.0, "kg", "weight"))
            .unwrap();
        let history = db.metric_history("2026-10-07", 7, "weight", "").unwrap();
        assert_eq!(history.entries.len(), 3);
        assert_eq!(history.recorded_days, 2);
        assert_eq!(history.change, Some(2.0));
        assert_eq!(history.points[0].value, Some(80.0));
        assert_eq!(history.points[0].measurements, 2);
        assert_eq!(history.points[1].value, None);
        assert_eq!(history.points[2].mean, Some(81.0));
        assert_eq!(history.points[2].mean_samples, 2);
        db.save_metric(metric("2026-10-07", "09:00:00", 0.5, "l", "water"))
            .unwrap();
        db.save_metric(metric("2026-10-07", "10:00:00", 8.0, "fl oz (US)", "water"))
            .unwrap();
        let water = db.metric_history("2026-10-07", 7, "water", "").unwrap();
        close(water.points[6].value.unwrap(), 736.5882365);
        assert_eq!(water.points[5].value, None);
        assert!(db.metric_history("2026-10-07", 999, "water", "").is_err());
    }
    #[test]
    fn metric_edit_delete_reopen_and_timezone_metadata_preserve_history() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("metrics.sqlite3");
        let mut db = Database::open(&path).unwrap();
        let original = metric("2026-10-01", "12:00:00", 32.0, "in", "measurement");
        let saved = db.save_metric(original.clone()).unwrap();
        assert_eq!(db.save_metric(original).unwrap(), saved);
        let mut edit = saved.clone();
        edit.note = "Edited".into();
        edit.timezone = "Asia/Tokyo".into();
        let updated = db.save_metric(edit).unwrap();
        assert!(db
            .save_metric(Metric {
                value: 30.0,
                ..saved.clone()
            })
            .is_err());
        drop(db);
        let db = Database::open(&path).unwrap();
        let history = db
            .metric_history("2026-10-01", 7, "measurement", "waist")
            .unwrap();
        assert_eq!(history.entries[0].recorded_at, saved.recorded_at);
        assert_eq!(history.entries[0].date, "2026-10-01");
        close(history.points[6].value.unwrap(), 81.28);
        assert!(db.delete_metric(&saved.id, saved.revision).is_err());
        db.delete_metric(&updated.id, updated.revision).unwrap();
        assert!(db
            .metric_history("2026-10-01", 7, "measurement", "waist")
            .unwrap()
            .entries
            .is_empty());
    }
}
