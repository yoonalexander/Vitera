use crate::db::{from_json, json, validate_date, Database, Entry, EntryInput};
use crate::nutrition::{valid_name, FoodPortion, Nutrients, NutritionSnapshot};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

type Result<T> = std::result::Result<T, String>;
fn error(e: rusqlite::Error) -> String {
    format!("Local storage error: {e}")
}
fn positive(v: f64) -> bool {
    v.is_finite() && v > 0.0 && v <= 100000.0
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Recipe {
    pub id: String,
    pub version: i64,
    pub name: String,
    pub instructions: String,
    pub ingredients: Vec<FoodPortion>,
    pub servings: Option<f64>,
    pub finished_yield_g: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Coverage {
    pub known: usize,
    pub total: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MacroCoverage {
    pub protein: Coverage,
    pub carbohydrate: Coverage,
    pub fat: Coverage,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecipeNutrition {
    pub nutrients: Nutrients,
    pub coverage: MacroCoverage,
}

impl Recipe {
    pub fn calculate(&self) -> Result<RecipeNutrition> {
        uuid::Uuid::parse_str(&self.id).map_err(|_| "Recipe identifier is invalid.")?;
        if !valid_name(&self.name)
            || self.version < 1
            || self.instructions.chars().count() > 4000
            || self.ingredients.is_empty()
            || self.ingredients.len() > 100
            || self.servings.is_some_and(|v| !positive(v))
            || self.finished_yield_g.is_some_and(|v| !positive(v))
            || (self.servings.is_none() && self.finished_yield_g.is_none())
        {
            return Err("Add ingredients with known amounts and a positive serving count or measured finished weight.".into());
        }
        let values = self
            .ingredients
            .iter()
            .map(|p| p.calculate().map(|v| v.0))
            .collect::<Result<Vec<_>>>()?;
        let sum = |get: fn(&Nutrients) -> Option<f64>| -> (Option<f64>, Coverage) {
            let known = values.iter().filter_map(get).collect::<Vec<_>>();
            let coverage = Coverage {
                known: known.len(),
                total: values.len(),
            };
            (
                if known.is_empty() {
                    None
                } else {
                    Some(known.iter().sum())
                },
                coverage,
            )
        };
        let (kcal, _) = sum(|n| n.kcal);
        let (protein, p) = sum(|n| n.protein);
        let (carbohydrate, c) = sum(|n| n.carbohydrate);
        let (fat, f) = sum(|n| n.fat);
        let nutrients = Nutrients {
            kcal,
            protein,
            carbohydrate,
            fat,
        };
        nutrients.validate()?;
        Ok(RecipeNutrition {
            nutrients,
            coverage: MacroCoverage {
                protein: p,
                carbohydrate: c,
                fat: f,
            },
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecipePortion {
    pub recipe: Recipe,
    pub quantity: f64,
    pub unit: String,
}
impl RecipePortion {
    pub fn calculate(&self) -> Result<RecipeNutrition> {
        if !positive(self.quantity) {
            return Err("Enter a positive recipe portion.".into());
        }
        let mut result = self.recipe.calculate()?;
        let factor = if self.unit == "serving" {
            self.quantity
                / self
                    .recipe
                    .servings
                    .ok_or("This recipe has no serving count. Use its measured weight.")?
        } else {
            let grams = match self.unit.as_str() {
                "g" => 1.0,
                "kg" => 1000.0,
                "oz" => 28.349523125,
                "lb" => 453.59237,
                _ => return Err("Use servings or a supported weight unit.".into()),
            };
            self.quantity * grams / self.recipe.finished_yield_g.ok_or("Enter measured finished weight before logging a weighed portion. Raw ingredient weight is not cooked yield.")?
        };
        for value in [
            &mut result.nutrients.kcal,
            &mut result.nutrients.protein,
            &mut result.nutrients.carbohydrate,
            &mut result.nutrients.fat,
        ]
        .into_iter()
        .flatten()
        {
            *value *= factor;
        }
        result.nutrients.validate()?;
        Ok(result)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MealItem {
    pub name: String,
    pub meal: String,
    pub kcal: f64,
    pub nutrition: NutritionSnapshot,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedMeal {
    pub id: String,
    pub version: i64,
    pub name: String,
    pub items: Vec<MealItem>,
}
impl SavedMeal {
    fn validate(&self) -> Result<()> {
        uuid::Uuid::parse_str(&self.id).map_err(|_| "Saved meal identifier is invalid.")?;
        if !valid_name(&self.name)
            || self.version < 1
            || self.items.is_empty()
            || self.items.len() > 100
        {
            return Err("Name the meal and select 1 to 100 entries.".into());
        }
        for item in &self.items {
            if !valid_name(&item.name)
                || !["Breakfast", "Lunch", "Dinner", "Snacks"].contains(&item.meal.as_str())
            {
                return Err("Check saved meal item names and groups.".into());
            }
            Nutrients {
                kcal: Some(item.kcal),
                protein: item.nutrition.protein,
                carbohydrate: item.nutrition.carbohydrate,
                fat: item.nutrition.fat,
            }
            .validate()?;
            if item.nutrition.food_portion.is_some() && item.nutrition.recipe_portion.is_some() {
                return Err("An item cannot be both a food and a recipe.".into());
            }
            if let Some(p) = &item.nutrition.food_portion {
                p.calculate()?;
            }
            if let Some(p) = &item.nutrition.recipe_portion {
                p.calculate()?;
            }
        }
        Ok(())
    }
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MealLog {
    pub saved_meal: SavedMeal,
    pub date: String,
    pub meal: Option<String>,
    pub entry_ids: Vec<String>,
    pub timezone: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeLibrary {
    pub recipes: Vec<Recipe>,
    pub saved_meals: Vec<SavedMeal>,
}

impl Database {
    pub fn recipe_history(&self, id: Option<&str>) -> Result<Vec<Recipe>> {
        let mut stmt=self.connection.prepare("SELECT record FROM recipe_versions WHERE ?1 IS NULL OR id=?1 ORDER BY id, version DESC").map_err(error)?;
        let records = stmt
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(error)?;
        records.map(|r| from_json(&r.map_err(error)?)).collect()
    }
    pub fn recipe_library(&self) -> Result<RecipeLibrary> {
        let mut seen = std::collections::HashSet::new();
        let recipes = self
            .recipe_history(None)?
            .into_iter()
            .filter(|r| seen.insert(r.id.clone()))
            .collect();
        let mut stmt = self
            .connection
            .prepare("SELECT record FROM saved_meal_versions ORDER BY id, version DESC")
            .map_err(error)?;
        let records = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(error)?;
        let all: Vec<SavedMeal> = records
            .map(|r| from_json(&r.map_err(error)?))
            .collect::<Result<_>>()?;
        let mut seen = std::collections::HashSet::new();
        Ok(RecipeLibrary {
            recipes,
            saved_meals: all
                .into_iter()
                .filter(|m| seen.insert(m.id.clone()))
                .collect(),
        })
    }
    pub fn save_recipe(&mut self, mut recipe: Recipe) -> Result<Recipe> {
        recipe.name = recipe.name.trim().into();
        recipe.calculate()?;
        let tx = self.connection.transaction().map_err(error)?;
        let old: Option<String> = tx
            .query_row(
                "SELECT record FROM recipe_versions WHERE id=?1 ORDER BY version DESC LIMIT 1",
                [&recipe.id],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?;
        if let Some(record) = old {
            let old: Recipe = from_json(&record)?;
            let mut compare = recipe.clone();
            compare.version = old.version;
            if compare == old {
                return Ok(old);
            }
            if recipe.version != old.version {
                return Err("Recipe changed. Reopen the latest version before editing.".into());
            }
            recipe.version += 1;
        } else {
            recipe.version = 1;
        }
        tx.execute(
            "INSERT INTO recipe_versions (id,version,record) VALUES (?1,?2,?3)",
            params![recipe.id, recipe.version, json(&recipe)?],
        )
        .map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(recipe)
    }
    pub fn save_meal(&mut self, mut meal: SavedMeal) -> Result<SavedMeal> {
        meal.name = meal.name.trim().into();
        meal.validate()?;
        let tx = self.connection.transaction().map_err(error)?;
        let old: Option<String> = tx
            .query_row(
                "SELECT record FROM saved_meal_versions WHERE id=?1 ORDER BY version DESC LIMIT 1",
                [&meal.id],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?;
        if let Some(record) = old {
            let old: SavedMeal = from_json(&record)?;
            let mut compare = meal.clone();
            compare.version = old.version;
            if compare == old {
                return Ok(old);
            }
            if meal.version != old.version {
                return Err("Saved meal changed. Reopen it before editing.".into());
            }
            meal.version += 1;
        } else {
            meal.version = 1;
        }
        tx.execute(
            "INSERT INTO saved_meal_versions (id,version,record) VALUES (?1,?2,?3)",
            params![meal.id, meal.version, json(&meal)?],
        )
        .map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(meal)
    }
    pub fn log_meal(&mut self, input: MealLog) -> Result<Vec<Entry>> {
        input.saved_meal.validate()?;
        validate_date(&input.date)?;
        if input.entry_ids.len() != input.saved_meal.items.len() || !valid_name(&input.timezone) {
            return Err("Saved meal request is incomplete.".into());
        }
        let mut unique = std::collections::HashSet::new();
        if !input.entry_ids.iter().all(|id| unique.insert(id)) {
            return Err("Saved meal entry identifiers must be distinct.".into());
        }
        self.connection
            .execute_batch("SAVEPOINT meal_batch")
            .map_err(error)?;
        let result = {
            input
                .saved_meal
                .items
                .into_iter()
                .zip(input.entry_ids)
                .map(|(item, id)| {
                    let mut nutrition = item.nutrition;
                    nutrition.timezone = Some(input.timezone.clone());
                    self.save(EntryInput {
                        id,
                        date: input.date.clone(),
                        meal: input.meal.clone().unwrap_or(item.meal),
                        name: item.name,
                        kcal: item.kcal,
                        revision: None,
                        nutrition,
                    })
                })
                .collect::<Result<Vec<_>>>()
        };
        match result {
            Ok(entries) => {
                self.connection
                    .execute_batch("RELEASE meal_batch")
                    .map_err(error)?;
                Ok(entries)
            }
            Err(e) => {
                self.connection
                    .execute_batch("ROLLBACK TO meal_batch; RELEASE meal_batch")
                    .map_err(error)?;
                Err(e)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nutrition::Food;
    use std::path::Path;
    fn recipe() -> Recipe {
        Recipe {
            id: uuid::Uuid::new_v4().to_string(),
            version: 1,
            name: "Synthetic recipe".into(),
            instructions: "Cook, then weigh the finished yield.".into(),
            ingredients: vec![FoodPortion {
                food: Food {
                    id: "synthetic".into(),
                    version: 1,
                    name: "Fixture ingredient".into(),
                    state: "Raw".into(),
                    source: "Test".into(),
                    source_id: None,
                    basis_quantity: 100.0,
                    basis_unit: "g".into(),
                    density: None,
                    nutrients: Nutrients {
                        kcal: Some(200.0),
                        protein: Some(10.0),
                        carbohydrate: None,
                        fat: Some(0.0),
                    },
                    portions: vec![],
                    favorite: false,
                },
                quantity: 800.0,
                unit: "g".into(),
            }],
            servings: Some(4.0),
            finished_yield_g: Some(800.0),
        }
    }
    fn close(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-8, "{a} != {b}");
    }
    fn entry(recipe: Recipe, date: &str) -> EntryInput {
        EntryInput {
            id: uuid::Uuid::new_v4().to_string(),
            date: date.into(),
            meal: "Dinner".into(),
            name: recipe.name.clone(),
            kcal: 0.0,
            revision: None,
            nutrition: NutritionSnapshot {
                recipe_portion: Some(RecipePortion {
                    recipe,
                    quantity: 1.0,
                    unit: "serving".into(),
                }),
                timezone: Some("America/Toronto".into()),
                ..Default::default()
            },
        }
    }
    #[test]
    fn serving_weighed_portion_mixed_units_and_finished_yield_rules() {
        let mut r = recipe();
        close(r.calculate().unwrap().nutrients.kcal.unwrap(), 1600.0);
        for (quantity, unit, kcal) in [
            (1.0, "serving", 400.0),
            (150.0, "g", 300.0),
            (0.15, "kg", 300.0),
            (1.0, "oz", 56.69904625),
            (1.0, "lb", 907.18474),
        ] {
            close(
                RecipePortion {
                    recipe: r.clone(),
                    quantity,
                    unit: unit.into(),
                }
                .calculate()
                .unwrap()
                .nutrients
                .kcal
                .unwrap(),
                kcal,
            );
        }
        r.ingredients[0].quantity = 0.8;
        r.ingredients[0].unit = "kg".into();
        close(r.calculate().unwrap().nutrients.kcal.unwrap(), 1600.0);
        r.finished_yield_g = None;
        assert!(RecipePortion {
            recipe: r.clone(),
            quantity: 150.0,
            unit: "g".into()
        }
        .calculate()
        .is_err());
        r.servings = Some(0.0);
        assert!(r.calculate().is_err());
        r.servings = Some(4.0);
        r.ingredients[0].quantity = 0.0;
        assert!(r.calculate().is_err());
    }
    #[test]
    fn partial_recipe_macros_remain_partial_in_diary_and_versions_preserve_snapshots() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("recipes.sqlite3");
        let mut db = Database::open(&path).unwrap();
        let mut r = recipe();
        let mut second = r.ingredients[0].clone();
        second.quantity = 100.0;
        second.food.nutrients.protein = None;
        second.food.nutrients.carbohydrate = Some(20.0);
        r.ingredients.push(second);
        let r = db.save_recipe(r).unwrap();
        let e = db.save(entry(r.clone(), "2026-10-01")).unwrap();
        assert_eq!(e.kcal, 450.0);
        let day = db.day("2026-10-01").unwrap();
        assert_eq!(day.protein.known, 20.0);
        assert_eq!(day.protein.partial_entries, 1);
        assert_eq!(day.carbohydrate.partial_entries, 1);
        let mut changed = r.clone();
        changed.ingredients[0].food.nutrients.kcal = Some(300.0);
        changed.servings = Some(2.0);
        let v2 = db.save_recipe(changed.clone()).unwrap();
        assert_eq!(v2.version, 2);
        assert_eq!(db.save_recipe(changed).unwrap().version, 2);
        assert!(db
            .save_recipe(Recipe {
                name: "Stale edit".into(),
                ..r.clone()
            })
            .is_err());
        let history = db.recipe_history(Some(&r.id)).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[1], r);
        assert_eq!(db.day("2026-10-01").unwrap().entries[0].kcal, 450.0);
        drop(db);
        let db = Database::open(&path).unwrap();
        assert_eq!(db.recipe_library().unwrap().recipes[0].version, 2);
        assert_eq!(
            db.day("2026-10-01").unwrap().entries[0]
                .nutrition
                .recipe_portion
                .as_ref()
                .unwrap()
                .recipe
                .version,
            1
        );
    }
    #[test]
    fn saved_meals_are_atomic_idempotent_and_independent_snapshots() {
        let mut db = Database::open(Path::new(":memory:")).unwrap();
        let first = db.save(entry(recipe(), "2026-10-01")).unwrap();
        let meal = SavedMeal {
            id: uuid::Uuid::new_v4().to_string(),
            version: 1,
            name: "Synthetic meal".into(),
            items: vec![
                MealItem {
                    name: first.name,
                    meal: first.meal,
                    kcal: first.kcal,
                    nutrition: first.nutrition
                };
                2
            ],
        };
        let saved = db.save_meal(meal).unwrap();
        let ids = vec![
            uuid::Uuid::new_v4().to_string(),
            uuid::Uuid::new_v4().to_string(),
        ];
        let request = |ids: Vec<String>| MealLog {
            saved_meal: saved.clone(),
            date: "2026-10-02".into(),
            meal: Some("Lunch".into()),
            entry_ids: ids,
            timezone: "America/Toronto".into(),
        };
        db.log_meal(request(ids.clone())).unwrap();
        db.log_meal(request(ids)).unwrap();
        assert_eq!(db.day("2026-10-02").unwrap().total_kcal, 800.0);
        assert_eq!(db.day("2026-10-02").unwrap().entries.len(), 2);
        assert!(db
            .log_meal(request(vec![
                uuid::Uuid::new_v4().to_string(),
                "invalid".into()
            ]))
            .is_err());
        assert_eq!(db.day("2026-10-02").unwrap().entries.len(), 2);
        let mut updated = saved.clone();
        updated.items.remove(0);
        assert_eq!(db.save_meal(updated).unwrap().version, 2);
        assert_eq!(db.day("2026-10-02").unwrap().total_kcal, 800.0);
    }
    #[test]
    fn schema_two_upgrade_keeps_existing_foods_goals_and_diary() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("v2.sqlite3");
        let c = rusqlite::Connection::open(&path).unwrap();
        c.execute_batch(include_str!("../migrations/001_foundation.sql"))
            .unwrap();
        c.execute_batch(include_str!("../migrations/002_nutrition.sql"))
            .unwrap();
        c.pragma_update(None, "user_version", 2).unwrap();
        c.execute("INSERT INTO diary_entries (id,diary_date,meal,name,kcal,created_at,updated_at) VALUES (?1,'2026-10-01','Lunch','Legacy M2',650,'2026-10-01T12:00:00Z','2026-10-01T12:00:00Z')",[uuid::Uuid::new_v4().to_string()]).unwrap();
        drop(c);
        let db = Database::open(&path).unwrap();
        assert_eq!(db.day("2026-10-01").unwrap().total_kcal, 650.0);
        assert_eq!(db.library().unwrap().foods.len(), 6);
        assert!(db.recipe_library().unwrap().recipes.is_empty());
        assert!(db
            .metric_history("2026-10-01", 7, "weight", "")
            .unwrap()
            .entries
            .is_empty());
    }
}
