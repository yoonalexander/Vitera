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
  const { protein, carbohydrate, fat, foodPortion, energyType } = entry;
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
  return `${total.known.toLocaleString(undefined, { maximumFractionDigits: 1 })} g${total.knownEntries < total.totalEntries ? ` · partial (${total.knownEntries}/${total.totalEntries} entries)` : ""}`;
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
