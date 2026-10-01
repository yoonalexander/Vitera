import { invoke } from "@tauri-apps/api/core";

export const meals = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
export type Meal = (typeof meals)[number];
export type Theme = "system" | "light" | "dark";
export interface Entry {
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
}
export interface Day {
  entries: Entry[];
  totalKcal: number;
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
};

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
