import { invoke } from "@tauri-apps/api/core";

export const meals = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
export type Meal = (typeof meals)[number];
export type Theme = "system" | "light" | "dark";
export interface Nutrients {
  kcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
}
export interface Food {
  id: string;
  version: number;
  name: string;
  state: string;
  source: string;
  sourceId: string | null;
  basisQuantity: number;
  basisUnit: string;
  density: number | null;
  nutrients: Nutrients;
  portions: { label: string; quantity: number }[];
  favorite: boolean;
}
export interface FoodPortion {
  food: Food;
  quantity: number;
  unit: string;
}
export interface NutritionSnapshot {
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  foodPortion: FoodPortion | null;
  timezone: string | null;
  energyType: string | null;
  recipePortion?: RecipePortion | null;
  macroCoverage?: MacroCoverage | null;
}
export interface EstimateInput {
  weightKg: number;
  heightCm: number;
  age: number;
  coefficient: number;
  activity: number;
  adjustment: number;
}
export interface Estimate {
  resting: number;
  maintenance: number;
  target: number;
}
export interface Goal {
  effectiveDate: string;
  kcal: number;
  estimate: EstimateInput | null;
}
export interface MacroTotal {
  known: number;
  knownEntries: number;
  totalEntries: number;
  partialEntries?: number;
}
export interface Library {
  foods: Food[];
  recent: Entry[];
}
export interface Week {
  days: {
    date: string;
    totalKcal: number;
    complete: boolean;
    entries: number;
    target: Goal | null;
  }[];
  completeDays: number;
  loggedDays: number;
  averageKcal: number | null;
}
export interface Entry extends NutritionSnapshot {
  id: string;
  date: string;
  meal: Meal;
  name: string;
  kcal: number;
  revision: number;
  deleted: boolean;
}
export interface EntryInput {
  id: string;
  date: string;
  meal: Meal;
  name: string;
  kcal: number;
  revision: number | null;
  nutrition: NutritionSnapshot;
}
export interface Day {
  entries: Entry[];
  totalKcal: number;
  protein: MacroTotal;
  carbohydrate: MacroTotal;
  fat: MacroTotal;
  target: Goal | null;
  complete: boolean;
}
export interface Settings {
  theme: Theme;
}

export const storage = {
  day: (date: string) => invoke<Day>("get_day", { date }),
  save: (input: EntryInput) => invoke<Entry>("save_entry", { input }),
  remove: (entry: Entry) =>
    invoke<Entry>("delete_entry", { id: entry.id, revision: entry.revision }),
  restore: (entry: Entry) =>
    invoke<Entry>("restore_entry", { id: entry.id, revision: entry.revision }),
  settings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) =>
    invoke<Settings>("save_settings", { settings }),
  library: () => invoke<Library>("get_library"),
  saveFood: (food: Food) => invoke<Food>("save_food", { food }),
  favorite: (food: Food) =>
    invoke<Food>("set_favorite", { id: food.id, favorite: !food.favorite }),
  goals: () => invoke<Goal[]>("get_goals"),
  saveGoal: (goal: Goal) => invoke<Goal>("save_goal", { goal }),
  estimate: (input: EstimateInput) =>
    invoke<Estimate>("preview_estimate", { input }),
  portion: (portion: FoodPortion) =>
    invoke<[Nutrients, string]>("preview_portion", { portion }),
  complete: (date: string, complete: boolean) =>
    invoke<Day>("set_day_complete", { date, complete }),
  week: (end: string) => invoke<Week>("get_week", { end }),
  saveMetric: (metric: Metric) => invoke<Metric>("save_metric", { metric }),
  deleteMetric: (metric: Metric) =>
    invoke<void>("delete_metric", { id: metric.id, revision: metric.revision }),
  metricHistory: (end: string, days: number, kind: string, label: string) =>
    invoke<MetricHistory>("get_metric_history", { end, days, kind, label }),
  metricLabels: () => invoke<string[]>("get_metric_labels"),
  recipeLibrary: () => invoke<RecipeLibrary>("get_recipe_library"),
  recipeHistory: (id: string) => invoke<Recipe[]>("get_recipe_history", { id }),
  saveRecipe: (recipe: Recipe) => invoke<Recipe>("save_recipe", { recipe }),
  recipe: (recipe: Recipe) =>
    invoke<RecipeNutrition>("preview_recipe", { recipe }),
  recipePortion: (portion: RecipePortion) =>
    invoke<RecipeNutrition>("preview_recipe_portion", { portion }),
  saveMeal: (meal: SavedMeal) => invoke<SavedMeal>("save_meal", { meal }),
  logMeal: (input: MealLog) => invoke<Entry[]>("log_meal", { input }),
};

export const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const blankNutrition = (): NutritionSnapshot => ({
  protein: null,
  carbohydrate: null,
  fat: null,
  foodPortion: null,
  timezone: timezone(),
  energyType: null,
});
export function repeatInput(entry: Entry, date: string): EntryInput {
  const {
    protein,
    carbohydrate,
    fat,
    foodPortion,
    energyType,
    recipePortion,
    macroCoverage,
  } = entry;
  return {
    id: crypto.randomUUID(),
    date,
    meal: entry.meal,
    name: entry.name,
    kcal: entry.kcal,
    revision: null,
    nutrition: {
      protein,
      carbohydrate,
      fat,
      foodPortion,
      energyType,
      recipePortion,
      macroCoverage,
      timezone: timezone(),
    },
  };
}
export function foodInput(food: Food, date: string): EntryInput {
  return {
    id: crypto.randomUUID(),
    date,
    meal: "Lunch",
    name: food.name,
    kcal: 0,
    revision: null,
    nutrition: {
      ...blankNutrition(),
      foodPortion: {
        food,
        quantity: food.portions.length ? 1 : food.basisQuantity,
        unit: food.portions.length ? "portion:0" : food.basisUnit,
      },
    },
  };
}
export function macroLabel(total: MacroTotal): string {
  if (!total.totalEntries || !total.knownEntries) return "Unknown";
  return `${total.known.toLocaleString(undefined, { maximumFractionDigits: 1 })} g${total.knownEntries < total.totalEntries || total.partialEntries ? ` · partial (${total.knownEntries}/${total.totalEntries} entries${total.partialEntries ? "; some recipe ingredients unknown" : ""})` : ""}`;
}

export interface Metric {
  id: string;
  date: string;
  recordedAt: string;
  timezone: string;
  kind: string;
  label: string;
  value: number;
  unit: string;
  canonicalValue: number;
  note: string;
  revision: number;
}
export interface MetricPoint {
  date: string;
  value: number | null;
  mean: number | null;
  meanSamples: number;
  measurements: number;
}
export interface MetricHistory {
  entries: Metric[];
  points: MetricPoint[];
  recordedDays: number;
  change: number | null;
  canonicalUnit: string;
}
export interface Recipe {
  id: string;
  version: number;
  name: string;
  instructions: string;
  ingredients: FoodPortion[];
  servings: number | null;
  finishedYieldG: number | null;
}
export interface RecipePortion {
  recipe: Recipe;
  quantity: number;
  unit: string;
}
export interface MacroCoverage {
  protein: { known: number; total: number };
  carbohydrate: { known: number; total: number };
  fat: { known: number; total: number };
}
export interface RecipeNutrition {
  nutrients: Nutrients;
  coverage: MacroCoverage;
}
export interface MealItem {
  name: string;
  meal: Meal;
  kcal: number;
  nutrition: NutritionSnapshot;
}
export interface SavedMeal {
  id: string;
  version: number;
  name: string;
  items: MealItem[];
}
export interface RecipeLibrary {
  recipes: Recipe[];
  savedMeals: SavedMeal[];
}
export interface MealLog {
  savedMeal: SavedMeal;
  date: string;
  meal: Meal | null;
  entryIds: string[];
  timezone: string;
}
export const metricUnits: Record<string, string[]> = {
  weight: ["kg", "lb"],
  measurement: ["cm", "in"],
  bodyFat: ["%"],
  water: ["ml", "l", "fl oz (US)"],
};
export function displayMetric(value: number, unit: string): number {
  return (
    value /
    ({ lb: 0.45359237, in: 2.54, l: 1000, "fl oz (US)": 29.5735295625 }[unit] ??
      1)
  );
}
export const formatMetric = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });
export function mealItem(entry: Entry): MealItem {
  const {
    protein,
    carbohydrate,
    fat,
    foodPortion,
    recipePortion,
    macroCoverage,
    timezone,
    energyType,
  } = entry;
  return {
    name: entry.name,
    meal: entry.meal,
    kcal: entry.kcal,
    nutrition: {
      protein,
      carbohydrate,
      fat,
      foodPortion,
      recipePortion,
      macroCoverage,
      timezone,
      energyType,
    },
  };
}

export function localDate(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function shiftDate(date: string, offset: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + offset);
  return localDate(value);
}
export const formatKcal = (value: number) =>
  (Math.round(value) || 0).toLocaleString();
