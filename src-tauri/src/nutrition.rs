use serde::{Deserialize, Serialize};

type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Nutrients {
    pub kcal: Option<f64>,
    pub protein: Option<f64>,
    pub carbohydrate: Option<f64>,
    pub fat: Option<f64>,
}

impl Nutrients {
    pub fn validate(&self) -> Result<()> {
        for value in [self.kcal, self.protein, self.carbohydrate, self.fat]
            .into_iter()
            .flatten()
        {
            if !value.is_finite() || !(0.0..=100000.0).contains(&value) {
                return Err("Nutrients must be blank or between 0 and 100,000.".into());
            }
        }
        Ok(())
    }

    pub fn energy(&self) -> Result<(f64, String)> {
        self.validate()?;
        if let Some(kcal) = self.kcal {
            return Ok((kcal, "stated".into()));
        }
        match (self.protein, self.carbohydrate, self.fat) {
            (Some(p), Some(c), Some(f)) => {
                Ok((4.0 * p + 4.0 * c + 9.0 * f, "derived (4/4/9)".into()))
            }
            _ => Err("Enter calories, or all three macros to derive energy.".into()),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Portion {
    pub label: String,
    pub quantity: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Food {
    pub id: String,
    pub version: i64,
    pub name: String,
    pub state: String,
    pub source: String,
    pub source_id: Option<String>,
    pub basis_quantity: f64,
    pub basis_unit: String,
    pub density: Option<f64>,
    pub nutrients: Nutrients,
    pub portions: Vec<Portion>,
    pub favorite: bool,
}

pub fn valid_name(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 120
}
fn positive(value: f64) -> bool {
    value.is_finite() && value > 0.0 && value <= 100000.0
}

impl Food {
    pub fn validate(&self) -> Result<()> {
        if !valid_name(&self.name)
            || !valid_name(&self.state)
            || !valid_name(&self.source)
            || !positive(self.basis_quantity)
            || !["g", "ml", "serving"].contains(&self.basis_unit.as_str())
            || self.density.is_some_and(|d| !positive(d))
            || self.portions.len() > 30
            || self
                .portions
                .iter()
                .any(|p| !valid_name(&p.label) || !positive(p.quantity))
        {
            return Err(
                "Check food name, preparation, nutrition basis and portion amounts.".into(),
            );
        }
        self.nutrients.energy()?;
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FoodPortion {
    pub food: Food,
    pub quantity: f64,
    pub unit: String,
}

impl FoodPortion {
    pub fn calculate(&self) -> Result<(Nutrients, String)> {
        self.food.validate()?;
        if !positive(self.quantity) {
            return Err("Portion must be positive and at most 100,000.".into());
        }
        let canonical =
            if let Some(index) = self.unit.strip_prefix("portion:") {
                let index: usize = index.parse().map_err(|_| "Choose a valid portion.")?;
                self.food
                    .portions
                    .get(index)
                    .ok_or("Choose a valid portion.")?
                    .quantity
            } else {
                let (dimension, factor) = match self.unit.as_str() {
                    "g" => ("g", 1.0),
                    "kg" => ("g", 1000.0),
                    "oz" => ("g", 28.349523125),
                    "lb" => ("g", 453.59237),
                    "ml" => ("ml", 1.0),
                    "l" => ("ml", 1000.0),
                    "fl oz (US)" => ("ml", 29.5735295625),
                    "serving" => ("serving", 1.0),
                    _ => return Err("Choose a supported unit or a food-specific portion.".into()),
                };
                if dimension == self.food.basis_unit {
                    factor
                } else {
                    match (dimension, self.food.basis_unit.as_str(), self.food.density) {
                        ("ml", "g", Some(d)) => factor * d,
                        ("g", "ml", Some(d)) => factor / d,
                        _ => return Err(
                            "Mass and volume need a food-specific density. Choose a known portion."
                                .into(),
                        ),
                    }
                }
            };
        let factor = self.quantity * canonical / self.food.basis_quantity;
        let (energy, energy_type) = self.food.nutrients.energy()?;
        let values = Nutrients {
            kcal: Some(energy * factor),
            protein: self.food.nutrients.protein.map(|v| v * factor),
            carbohydrate: self.food.nutrients.carbohydrate.map(|v| v * factor),
            fat: self.food.nutrients.fat.map(|v| v * factor),
        };
        values.validate()?;
        Ok((values, energy_type))
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NutritionSnapshot {
    pub protein: Option<f64>,
    pub carbohydrate: Option<f64>,
    pub fat: Option<f64>,
    pub food_portion: Option<FoodPortion>,
    pub timezone: Option<String>,
    pub energy_type: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EstimateInput {
    pub weight_kg: f64,
    pub height_cm: f64,
    pub age: i64,
    pub coefficient: i64,
    pub activity: f64,
    pub adjustment: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Estimate {
    pub resting: f64,
    pub maintenance: f64,
    pub target: f64,
}

pub fn estimate(input: &EstimateInput) -> Result<Estimate> {
    if !input.weight_kg.is_finite()
        || !(20.0..=500.0).contains(&input.weight_kg)
        || !input.height_cm.is_finite()
        || !(100.0..=250.0).contains(&input.height_cm)
        || !(18..=120).contains(&input.age)
        || ![5, -161].contains(&input.coefficient)
        || !input.activity.is_finite()
        || !(1.0..=2.5).contains(&input.activity)
        || !input.adjustment.is_finite()
        || !(-2000.0..=2000.0).contains(&input.adjustment)
    {
        return Err("Use valid adult inputs, or choose a manual target.".into());
    }
    let resting = 10.0 * input.weight_kg + 6.25 * input.height_cm - 5.0 * input.age as f64
        + input.coefficient as f64;
    let maintenance = resting * input.activity;
    let target = maintenance + input.adjustment;
    validate_target(target)?;
    Ok(Estimate {
        resting,
        maintenance,
        target,
    })
}

pub fn validate_target(value: f64) -> Result<()> {
    if !value.is_finite() || !(1.0..=100000.0).contains(&value) {
        return Err("Target must be between 1 and 100,000 kcal.".into());
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Goal {
    pub effective_date: String,
    pub kcal: f64,
    pub estimate: Option<EstimateInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroTotal {
    pub known: f64,
    pub known_entries: usize,
    pub total_entries: usize,
}

pub fn macro_total(values: impl Iterator<Item = Option<f64>>) -> MacroTotal {
    let mut result = MacroTotal {
        known: 0.0,
        known_entries: 0,
        total_entries: 0,
    };
    for value in values {
        result.total_entries += 1;
        if let Some(v) = value {
            result.known += v;
            result.known_entries += 1;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Food {
        Food {
            id: "sample".into(),
            version: 1,
            name: "Example".into(),
            state: "Cooked".into(),
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
            portions: vec![Portion {
                label: "Scoop".into(),
                quantity: 30.0,
            }],
            favorite: false,
        }
    }
    fn close(actual: f64, expected: f64) {
        assert!((actual - expected).abs() < 1e-8, "{actual} != {expected}");
    }
    #[test]
    fn independent_resting_and_maintenance_examples() {
        let mut input = EstimateInput {
            weight_kg: 80.0,
            height_cm: 180.0,
            age: 30,
            coefficient: 5,
            activity: 1.55,
            adjustment: -300.0,
        };
        let male = estimate(&input).unwrap();
        close(male.resting, 1780.0);
        close(male.maintenance, 2759.0);
        close(male.target, 2459.0);
        input = EstimateInput {
            weight_kg: 60.0,
            height_cm: 165.0,
            age: 40,
            coefficient: -161,
            activity: 1.2,
            adjustment: 0.0,
        };
        let female = estimate(&input).unwrap();
        close(female.resting, 1270.25);
        close(female.maintenance, 1524.3);
        input.age = 17;
        assert!(estimate(&input).is_err());
        input.age = 40;
        input.coefficient = 0;
        assert!(estimate(&input).is_err());
        input.coefficient = -161;
        input.activity = f64::NAN;
        assert!(estimate(&input).is_err());
    }
    #[test]
    fn conversions_and_named_portions_keep_precision_and_unknowns() {
        let food = sample();
        for (quantity, unit, kcal) in [
            (150.0, "g", 300.0),
            (0.15, "kg", 300.0),
            (1.0, "oz", 56.69904625),
            (1.0, "lb", 907.18474),
            (2.5, "portion:0", 150.0),
        ] {
            let (values, kind) = FoodPortion {
                food: food.clone(),
                quantity,
                unit: unit.into(),
            }
            .calculate()
            .unwrap();
            close(values.kcal.unwrap(), kcal);
            assert_eq!(values.carbohydrate, None);
            assert_eq!(values.fat, Some(0.0));
            assert_eq!(kind, "stated");
        }
        let mut portion = FoodPortion {
            food,
            quantity: 250.0,
            unit: "ml".into(),
        };
        assert!(portion.calculate().is_err());
        portion.food.density = Some(1.04);
        close(portion.calculate().unwrap().0.kcal.unwrap(), 520.0);
        portion.food.basis_unit = "ml".into();
        portion.quantity = 104.0;
        portion.unit = "g".into();
        close(portion.calculate().unwrap().0.kcal.unwrap(), 200.0);
        portion.unit = "l".into();
        portion.quantity = 0.5;
        close(portion.calculate().unwrap().0.kcal.unwrap(), 1000.0);
        portion.unit = "fl oz (US)".into();
        portion.quantity = 1.0;
        close(portion.calculate().unwrap().0.kcal.unwrap(), 59.147059125);
        portion.unit = "cup".into();
        assert!(portion.calculate().is_err());
        portion.unit = "portion:99".into();
        assert!(portion.calculate().is_err());
        portion.unit = "g".into();
        portion.quantity = 0.0;
        assert!(portion.calculate().is_err());
    }
    #[test]
    fn energy_fallback_never_replaces_stated_energy_or_fills_unknowns() {
        let mut values = Nutrients {
            kcal: Some(123.0),
            protein: Some(10.0),
            carbohydrate: Some(20.0),
            fat: Some(5.0),
        };
        assert_eq!(values.energy().unwrap(), (123.0, "stated".into()));
        values.kcal = None;
        assert_eq!(values.energy().unwrap(), (165.0, "derived (4/4/9)".into()));
        values.carbohydrate = None;
        assert!(values.energy().is_err());
        let total = macro_total([Some(10.25), None, Some(0.0)].into_iter());
        close(total.known, 10.25);
        assert_eq!(total.known_entries, 2);
        assert_eq!(total.total_entries, 3);
    }
}
