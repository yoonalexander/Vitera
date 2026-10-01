import type { CSSProperties } from "react";
import type { Settings } from "./storage";

export const colorFields = [
  { key: "canvas", label: "Background", css: "canvas", group: "Surfaces" },
  {
    key: "surface",
    label: "Cards & dialogs",
    css: "surface",
    group: "Surfaces",
  },
  { key: "header", label: "Header", css: "header", group: "Surfaces" },
  { key: "soft", label: "Highlights", css: "soft", group: "Surfaces" },
  { key: "line", label: "Borders", css: "line", group: "Surfaces" },
  { key: "ink", label: "Main text", css: "ink", group: "Text & actions" },
  {
    key: "muted",
    label: "Secondary text",
    css: "muted",
    group: "Text & actions",
  },
  {
    key: "headerInk",
    label: "Header text",
    css: "header-ink",
    group: "Text & actions",
  },
  {
    key: "accent",
    label: "Accent & buttons",
    css: "accent",
    group: "Text & actions",
  },
  {
    key: "accentInk",
    label: "Button text",
    css: "accent-ink",
    group: "Text & actions",
  },
  { key: "error", label: "Error text", css: "error", group: "Feedback" },
  {
    key: "errorBg",
    label: "Error background",
    css: "error-bg",
    group: "Feedback",
  },
] as const;
export type PaletteKey = (typeof colorFields)[number]["key"];
export type Palette = Record<PaletteKey, string>;
export type Mode = "light" | "dark";
export interface Palettes {
  light: Palette | null;
  dark: Palette | null;
}
export const emptyPalettes = (): Palettes => ({ light: null, dark: null });
export const defaults: Record<Mode, Palette> = {
  light: {
    canvas: "#f6f8f7",
    surface: "#ffffff",
    header: "#f6f8f7",
    headerInk: "#20332f",
    ink: "#20332f",
    muted: "#5c6b67",
    line: "#dce3df",
    accent: "#35685f",
    accentInk: "#ffffff",
    soft: "#eaf1ee",
    error: "#8e3434",
    errorBg: "#fff0f0",
  },
  dark: {
    canvas: "#15201d",
    surface: "#1d2926",
    header: "#15201d",
    headerInk: "#e7eeeb",
    ink: "#e7eeeb",
    muted: "#b0beb8",
    line: "#40514b",
    accent: "#9bccbb",
    accentInk: "#12221c",
    soft: "#263c33",
    error: "#ffc0bc",
    errorBg: "#3b2525",
  },
};
export const presets: { name: string; light: Palette; dark: Palette }[] = [
  { name: "Forest", ...defaults },
  {
    name: "Ocean",
    light: {
      ...defaults.light,
      canvas: "#f3f7fc",
      surface: "#ffffff",
      header: "#152e50",
      headerInk: "#f4f8ff",
      ink: "#152c47",
      muted: "#52657b",
      line: "#c9d7e8",
      accent: "#245b9e",
      accentInk: "#ffffff",
      soft: "#e4edf8",
    },
    dark: {
      ...defaults.dark,
      canvas: "#101c2b",
      surface: "#18283b",
      header: "#0b1421",
      headerInk: "#edf4ff",
      ink: "#edf4ff",
      muted: "#b6c6dc",
      line: "#405671",
      accent: "#8bbcf5",
      accentInk: "#10223c",
      soft: "#243c59",
    },
  },
  {
    name: "Plum",
    light: {
      ...defaults.light,
      canvas: "#f9f5fb",
      surface: "#ffffff",
      header: "#482553",
      headerInk: "#fff4ff",
      ink: "#33213b",
      muted: "#715d79",
      line: "#e1cfe7",
      accent: "#754286",
      accentInk: "#ffffff",
      soft: "#f0e5f4",
    },
    dark: {
      ...defaults.dark,
      canvas: "#221627",
      surface: "#302037",
      header: "#180f1d",
      headerInk: "#f7edfb",
      ink: "#f7edfb",
      muted: "#ccb7d5",
      line: "#654b70",
      accent: "#d4a7e8",
      accentInk: "#2b1535",
      soft: "#432d4d",
    },
  },
  {
    name: "Ember",
    light: {
      ...defaults.light,
      canvas: "#fff7f2",
      surface: "#ffffff",
      header: "#66341f",
      headerInk: "#fff7ef",
      ink: "#42271b",
      muted: "#785c4c",
      line: "#e7cfbf",
      accent: "#a44923",
      accentInk: "#ffffff",
      soft: "#f8e8dc",
    },
    dark: {
      ...defaults.dark,
      canvas: "#251b16",
      surface: "#33251e",
      header: "#1a110d",
      headerInk: "#fff1e7",
      ink: "#fff1e7",
      muted: "#d4bbaa",
      line: "#70513f",
      accent: "#f1b28b",
      accentInk: "#371c0d",
      soft: "#4b3325",
    },
  },
  {
    name: "Slate",
    light: {
      ...defaults.light,
      canvas: "#f5f6f8",
      surface: "#ffffff",
      header: "#ffffff",
      headerInk: "#20242d",
      ink: "#20242d",
      muted: "#606672",
      line: "#d9dce3",
      accent: "#444b5a",
      accentInk: "#ffffff",
      soft: "#e9ebf0",
    },
    dark: {
      ...defaults.dark,
      canvas: "#17191e",
      surface: "#22252d",
      header: "#111318",
      headerInk: "#eff0f5",
      ink: "#eff0f5",
      muted: "#b6bac7",
      line: "#4d5260",
      accent: "#c5cbda",
      accentInk: "#20242d",
      soft: "#343946",
    },
  },
];
// The editor uses its own neutral colors so every custom palette stays editable.
export const editorPalette: Palette = {
  ...presets[4].light,
  accent: "#245b9e",
  soft: "#e4edf8",
};

export function normalizeColor(value: string): string | null {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex))
    return `#${[...hex]
      .map((c) => c + c)
      .join("")
      .toLowerCase()}`;
  return null;
}
export function normalizePalette(palette: Palette): Palette | null {
  const entries = colorFields.map(({ key }) => [
    key,
    normalizeColor(palette[key]),
  ]);
  return entries.some(([, color]) => color === null)
    ? null
    : (Object.fromEntries(entries) as Palette);
}
export function paletteStyle(palette: Palette): CSSProperties {
  return Object.fromEntries(
    colorFields.map(({ key, css }) => [`--${css}`, palette[key]]),
  ) as CSSProperties;
}
export function resolvedMode(settings: Settings, systemDark: boolean): Mode {
  return settings.theme === "system"
    ? systemDark
      ? "dark"
      : "light"
    : settings.theme;
}
export function activePalette(
  settings: Settings,
  systemDark: boolean,
): Palette {
  const mode = resolvedMode(settings, systemDark);
  return settings.palette[mode] ?? defaults[mode];
}
export function applyAppearance(settings: Settings, systemDark: boolean) {
  document.documentElement.dataset.theme = settings.theme;
  const palette = activePalette(settings, systemDark);
  for (const { key, css } of colorFields)
    document.documentElement.style.setProperty(`--${css}`, palette[key]);
}
export function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function contrastChecks(p: Palette) {
  return [
    {
      name: "Main text",
      ratio: Math.min(
        ...[p.canvas, p.surface, p.soft].map((bg) => contrastRatio(p.ink, bg)),
      ),
    },
    {
      name: "Secondary text",
      ratio: Math.min(
        ...[p.canvas, p.surface, p.soft].map((bg) =>
          contrastRatio(p.muted, bg),
        ),
      ),
    },
    { name: "Header text", ratio: contrastRatio(p.headerInk, p.header) },
    { name: "Button text", ratio: contrastRatio(p.accentInk, p.accent) },
    {
      name: "Accent text",
      ratio: Math.min(
        ...[p.canvas, p.surface, p.soft].map((bg) =>
          contrastRatio(p.accent, bg),
        ),
      ),
    },
    { name: "Error text", ratio: contrastRatio(p.error, p.errorBg) },
  ];
}
