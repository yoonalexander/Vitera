//! Application-facing extraction contract. Nutrition stays in the existing database flow.
use crate::ai::{AiConfig, TextInput};
use crate::nutrition::{valid_name, Food};
use serde::{Deserialize, Serialize};
use std::future::Future;

pub type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FoodDetails {
    pub preparation: Option<String>,
    pub brand: Option<String>,
    pub restaurant: Option<String>,
    pub modifiers: Vec<String>,
}
impl FoodDetails {
    pub fn validate(&self) -> Result<()> {
        for value in [&self.preparation, &self.brand, &self.restaurant]
            .into_iter()
            .flatten()
        {
            if !valid_name(value) {
                return Err(
                    "The model returned invalid food details. Review the description and retry."
                        .into(),
                );
            }
        }
        crate::ai::text_list(&self.modifiers)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParsedFood {
    pub name: String,
    pub food_id: Option<String>,
    pub quantity: Option<f64>,
    pub unit: Option<String>,
    pub preparation: Option<String>,
    pub brand: Option<String>,
    pub restaurant: Option<String>,
    pub modifiers: Vec<String>,
    pub assumptions: Vec<String>,
    pub questions: Vec<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ParsedFoodEntry {
    pub items: Vec<ParsedFood>,
    pub notes: Option<String>,
}
impl ParsedFoodEntry {
    pub fn validate(&self) -> Result<()> {
        if self.items.is_empty() || self.items.len() > 20 {
            return Err("The AI draft must contain 1–20 items.".into());
        }
        if let Some(notes) = &self.notes {
            crate::ai::text_list(std::slice::from_ref(notes))?;
        }
        for item in &self.items {
            if !valid_name(&item.name)
                || item
                    .quantity
                    .is_some_and(|q| !q.is_finite() || q <= 0.0 || q > 100000.0)
                || item.unit.as_ref().is_some_and(|u| {
                    u.is_empty() || u.len() > 60 || u.chars().any(char::is_control)
                })
                || item
                    .food_id
                    .as_ref()
                    .is_some_and(|id| id.is_empty() || id.len() > 120)
            {
                return Err(
                    "The model returned an invalid name or amount. Existing items are unchanged."
                        .into(),
                );
            }
            FoodDetails {
                preparation: item.preparation.clone(),
                brand: item.brand.clone(),
                restaurant: item.restaurant.clone(),
                modifiers: item.modifiers.clone(),
            }
            .validate()?;
            crate::ai::text_list(&item.assumptions)?;
            crate::ai::text_list(&item.questions)?;
        }
        Ok(())
    }
}
pub fn parse_response(content: &str) -> Result<ParsedFoodEntry> {
    if content.len() > 65536 {
        return Err("The AI draft is too large. Shorten the description.".into());
    }
    let parsed:ParsedFoodEntry=serde_json::from_str(content).map_err(|_|"The model returned an invalid draft. Your existing items are unchanged; try again or enter them manually.")?;
    parsed.validate()?;
    Ok(parsed)
}

/// Implement another provider here without changing review, nutrition or diary storage.
/// The provider returns extracted language only; calorie fields are not in this contract.
pub trait FoodParsingProvider {
    fn parse_food_entry<'a>(
        &'a self,
        config: &'a AiConfig,
        input: &'a TextInput,
        foods: &'a [Food],
        secret: Option<&'a str>,
        photo: bool,
    ) -> impl Future<Output = Result<ParsedFoodEntry>> + Send + 'a;
}

pub struct FoodParsingService<P>(pub P);
impl<P: FoodParsingProvider> FoodParsingService<P> {
    pub async fn parse_food_entry(
        &self,
        config: &AiConfig,
        input: &TextInput,
        foods: &[Food],
        secret: Option<&str>,
        photo: bool,
    ) -> Result<ParsedFoodEntry> {
        config.validate()?;
        if photo {
            let mut original = input.clone();
            original.text = "Photo context".into();
            original.validate()?;
            if input.text.trim().is_empty() || input.text.chars().count() > 12000 {
                return Err(
                    "The photo observations are too large. Your draft is unchanged.".into(),
                );
            }
        } else {
            input.validate()?;
        }
        let parsed = self
            .0
            .parse_food_entry(config, input, foods, secret, photo)
            .await?;
        parsed.validate()?;
        Ok(parsed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::{build_parsed_draft, Ollama, TextProvider};
    use serde_json::{json, Value};

    fn input(text: &str) -> TextInput {
        TextInput {
            request_id: uuid::Uuid::new_v4().to_string(),
            text: text.into(),
            locale: "en-CA".into(),
            portion_hints: None,
        }
    }
    fn foods() -> Vec<Food> {
        serde_json::from_str(include_str!("../../catalog/foods-v1.json")).unwrap()
    }
    fn item(patch: Value) -> Value {
        let mut value = json!({"name":"banana","foodId":null,"quantity":100,"unit":"g","preparation":null,"brand":null,"restaurant":null,"modifiers":[],"assumptions":[],"questions":[]});
        for (key, field) in patch.as_object().unwrap() {
            value[key] = field.clone();
        }
        value
    }
    struct MockParser {
        text: String,
        response: String,
    }
    impl FoodParsingProvider for MockParser {
        async fn parse_food_entry<'a>(
            &'a self,
            _: &'a AiConfig,
            input: &'a TextInput,
            _: &'a [Food],
            _: Option<&'a str>,
            _: bool,
        ) -> Result<ParsedFoodEntry> {
            assert_eq!(input.text, self.text);
            parse_response(&self.response)
        }
    }
    #[tokio::test]
    async fn six_descriptions_keep_quantities_preparation_brands_and_unknowns_through_mock_provider(
    ) {
        let samples: Vec<Value> =
            serde_json::from_str(include_str!("../../ai/parsing-fixtures.json")).unwrap();
        for sample in samples {
            let text = sample["text"].as_str().unwrap();
            let expected = sample["items"]
                .as_array()
                .unwrap()
                .iter()
                .map(|i| item(i.clone()))
                .collect::<Vec<_>>();
            let response = json!({"items":expected,"notes":null});
            let parser = FoodParsingService(MockParser {
                text: text.into(),
                response: response.to_string(),
            });
            let parsed = parser
                .parse_food_entry(&AiConfig::default(), &input(text), &foods(), None, false)
                .await
                .unwrap();
            assert_eq!(
                parsed,
                serde_json::from_value::<ParsedFoodEntry>(response).unwrap()
            );
            let draft = build_parsed_draft(parsed, &input(text), "mock", &foods()).unwrap();
            assert!(draft
                .items
                .iter()
                .all(|i| i.candidate.nutrients.kcal.is_none()));
            for (actual, expected) in draft.items.iter().zip(expected) {
                assert_eq!(actual.candidate.quantity, expected["quantity"].as_f64());
                assert_eq!(actual.candidate.unit.as_deref(), expected["unit"].as_str());
                assert_eq!(
                    actual
                        .candidate
                        .extraction
                        .as_ref()
                        .unwrap()
                        .preparation
                        .as_deref(),
                    expected["preparation"].as_str()
                );
            }
        }
    }
    #[test]
    fn malformed_extra_nutrition_and_invalid_food_fields_are_refused() {
        for content in [
            "not JSON",
            "```json\n{}\n```",
            "{\"items\":[],\"notes\":null}",
        ] {
            assert!(parse_response(content).is_err());
        }
        for patch in [
            json!({"quantity":-2}),
            json!({"brand":""}),
            json!({"unit":"\n"}),
            json!({"modifiers":[""]}),
            json!({"nutrients":{"kcal":200}}),
        ] {
            assert!(
                parse_response(&json!({"items":[item(patch)],"notes":null}).to_string()).is_err()
            );
        }
        assert!(parse_response(
            &json!({"items":[item(json!({}))],"notes":null,"calories":200}).to_string()
        )
        .is_err());
    }
    #[test]
    fn lookup_uses_database_and_rejects_preparation_brand_and_modifier_mismatches() {
        let resolve = |patch| {
            build_parsed_draft(
                parse_response(&json!({"items":[item(patch)],"notes":null}).to_string()).unwrap(),
                &input("fixture"),
                "mock",
                &foods(),
            )
            .unwrap()
        };
        let draft = resolve(json!({"unit":"grams"}));
        assert_eq!(draft.items[0].calculated.as_ref().unwrap().kcal, Some(89.0));
        assert_eq!(draft.items[0].resolved_unit.as_deref(), Some("g"));
        for patch in [
            json!({"name":"milk"}),
            json!({"name":"rice"}),
            json!({"foodId":"usda-v1-173944","brand":"Dole"}),
            json!({"foodId":"usda-v1-173944","restaurant":"McDonald's"}),
            json!({"foodId":"usda-v1-173944","modifiers":["with butter"]}),
            json!({"name":"scrambled eggs","preparation":"scrambled","foodId":"usda-v1-173424"}),
            json!({"name":"chicken","preparation":"grilled","foodId":"usda-v1-171477"}),
        ] {
            let draft = resolve(patch);
            assert!(draft.items[0].food.is_none());
            assert!(draft.items[0].calculated.is_none());
        }
        let egg = resolve(
            json!({"name":"hard-boiled eggs","preparation":"hard-boiled","foodId":"usda-v1-173424","quantity":2,"unit":"large"}),
        );
        assert_eq!(egg.items[0].calculated.as_ref().unwrap().kcal, Some(155.0));
        let banana = resolve(json!({"quantity":1,"unit":"count"}));
        assert!(banana.items[0].calculated.is_none()); // No invented gram weights.
    }
    #[tokio::test]
    async fn empty_input_is_refused_before_calling_a_provider() {
        let service = FoodParsingService(MockParser {
            text: "must not be called".into(),
            response: "{}".into(),
        });
        assert!(service
            .parse_food_entry(&AiConfig::default(), &input(" "), &foods(), None, false)
            .await
            .unwrap_err()
            .contains("Describe"));
    }
    #[test]
    fn ollama_request_enforces_schema_without_nutrition_and_preserves_user_text() {
        let input = input("I had 2 scrambled eggs, 2 pieces of toast with butter, and a banana");
        let request = Ollama.request(&AiConfig::default(), &input, &foods());
        assert_eq!(request["model"], "qwen3.5:4b");
        assert_eq!(request["stream"], false);
        assert_eq!(request["format"]["additionalProperties"], false);
        assert!(
            request["format"]["properties"]["items"]["items"]["properties"]
                .get("nutrients")
                .is_none()
        );
        assert_eq!(
            request["format"]["properties"]["items"]["items"]["properties"]["foodId"]["enum"],
            json!([null])
        );
        assert!(
            request["messages"].as_array().unwrap().last().unwrap()["content"]
                .as_str()
                .unwrap()
                .contains(&input.text)
        );
    }
}
