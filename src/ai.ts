import { invoke } from "@tauri-apps/api/core";
import type {
  Entry,
  EntryInput,
  Food,
  FoodPortion,
  Nutrients,
} from "./storage";

export interface AiConfig {
  enabled: boolean;
  provider: "ollama";
  port: number;
  model: string;
  timeoutSeconds: number;
  visionModel?: string | null;
}
export interface PhotoInfo {
  id: string;
  width: number;
  height: number;
}
export interface PreparedPhoto extends PhotoInfo {
  data: string;
}
export interface AiProvenance {
  requestId: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: number;
  generatedAt: string;
  originalName: string;
  originalQuantity: number | null;
  originalUnit: string | null;
  quantity: number;
  unit: string;
  assumptions: string[];
  questions: string[];
  reviewed: boolean;
  photo?: PhotoInfo | null;
  visionModel?: string | null;
}
export interface Candidate {
  name: string;
  foodId: string | null;
  quantity: number | null;
  unit: string | null;
  nutrients: Nutrients;
  assumptions: string[];
  questions: string[];
}
export interface TextDraft {
  requestId: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: number;
  generatedAt: string;
  photo?: PhotoInfo | null;
  photoObservation?: string | null;
  visionModel?: string | null;
  items: {
    candidate: Candidate;
    food: Food | null;
    calculated: Nutrients | null;
    issues: string[];
    resolvedUnit?: string | null;
  }[];
}
export interface Readiness {
  models: string[];
  text: boolean;
  vision: boolean;
  structuredOutput: boolean;
  message: string;
}
export const ai = {
  config: () => invoke<AiConfig>("get_ai_config"),
  saveConfig: (config: AiConfig) =>
    invoke<AiConfig>("save_ai_config", { config }),
  credentialPresent: () => invoke<boolean>("ai_credential_present"),
  setCredential: (secret: string | null) =>
    invoke<void>("set_ai_credential", { secret }),
  check: (config: AiConfig) => invoke<Readiness>("check_ai", { config }),
  describe: (requestId: string, text: string) =>
    invoke<TextDraft>("describe_meal", {
      input: {
        requestId,
        text,
        locale: navigator.language,
        portionHints: null,
      },
    }),
  preparePhoto: (data: string) =>
    invoke<PreparedPhoto>("prepare_photo", { data }),
  releasePhoto: (id: string) => invoke<void>("release_photo", { id }),
  photo: (requestId: string, text: string, photoId: string) =>
    invoke<TextDraft>("describe_photo", {
      input: {
        requestId,
        text,
        locale: navigator.language,
        portionHints: null,
      },
      photoId,
    }),
  attachment: (requestId: string) =>
    invoke<PreparedPhoto | null>("get_photo_attachment", { requestId }),
  removeAttachment: (requestId: string) =>
    invoke<void>("remove_photo_attachment", { requestId }),
  cancel: (requestId: string) =>
    invoke<void>("cancel_description", { requestId }),
  save: (entries: EntryInput[], photoId?: string, retainPhoto = false) =>
    invoke<Entry[]>("save_ai_draft", {
      entries,
      photoId: photoId ?? null,
      retainPhoto,
    }),
};
export const units = [
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "fl oz (US)",
  "serving",
];
export interface ReviewRow {
  id: string;
  original: Candidate;
  name: string;
  quantity: string;
  unit: string;
  food: Food | null;
  nutrients: Nutrients;
  reviewed: boolean;
}
export function reviewRows(draft: TextDraft): ReviewRow[] {
  return draft.items.map(({ candidate, food, resolvedUnit }) => ({
    id: crypto.randomUUID(),
    original: candidate,
    name: candidate.name,
    quantity: candidate.quantity === null ? "" : String(candidate.quantity),
    unit: resolvedUnit ?? candidate.unit ?? "",
    food,
    nutrients: { ...candidate.nutrients },
    reviewed: false,
  }));
}
export function rowPortion(row: ReviewRow): FoodPortion | null {
  return row.food
    ? { food: row.food, quantity: Number(row.quantity), unit: row.unit }
    : null;
}
export function rowIssue(row: ReviewRow): string | null {
  const quantity = Number(row.quantity);
  if (!row.name.trim() || row.name.length > 120) return "Enter an item name.";
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000)
    return "Enter a positive portion amount.";
  if (
    !units.includes(row.unit) &&
    !(
      row.food &&
      /^portion:\d+$/.test(row.unit) &&
      row.food.portions[Number(row.unit.slice(8))]
    )
  )
    return "Choose a supported unit or known food portion.";
  if (
    !row.food &&
    (row.nutrients.kcal === null ||
      !Object.values(row.nutrients).every(
        (v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100000),
      ))
  )
    return "Enter calories and valid optional macros for this portion.";
  if (!row.reviewed)
    return "Confirm this item after checking its portion and assumptions.";
  return null;
}
