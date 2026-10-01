import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { storage, type Settings } from "./storage";
import {
  colorFields,
  contrastChecks,
  defaults,
  editorPalette,
  normalizeColor,
  normalizePalette,
  paletteStyle,
  presets,
  resolvedMode,
  type Mode,
  type PaletteKey,
  type Palettes,
} from "./palette";

export function ColorPalette({
  settings,
  canSave,
  onPreview,
  onSaved,
  onClose,
}: {
  settings: Settings;
  canSave: boolean;
  onPreview: (settings: Settings | null) => void;
  onSaved: (settings: Settings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Palettes>(() =>
    structuredClone(settings.palette),
  );
  const [mode, setMode] = useState<Mode>(() =>
    resolvedMode(settings, matchMedia("(prefers-color-scheme: dark)").matches),
  );
  const [preview, setPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const colors = draft[mode] ?? defaults[mode];
  const valid = [draft.light, draft.dark].every(
    (p) => p === null || normalizePalette(p) !== null,
  );
  const shown = useMemo(
    () =>
      Object.fromEntries(
        colorFields.map(({ key }) => [
          key,
          normalizeColor(colors[key]) ??
            (settings.palette[mode] ?? defaults[mode])[key],
        ]),
      ) as typeof colors,
    [colors, mode, settings.palette],
  );
  const checks = contrastChecks(shown);
  const lowContrast = checks.some((c) => c.ratio < 4.5);

  useEffect(() => {
    onPreview(
      preview
        ? {
            ...settings,
            theme: mode,
            palette: { ...settings.palette, [mode]: shown },
          }
        : null,
    );
  }, [preview, shown, mode, settings, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);

  function update(key: PaletteKey, value: string) {
    setError(null);
    setDraft((previous) => ({
      ...previous,
      [mode]: { ...(previous[mode] ?? defaults[mode]), [key]: value },
    }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !valid || !canSave) return;
    setBusy(true);
    setError(null);
    try {
      const palette = {
        light: draft.light ? normalizePalette(draft.light) : null,
        dark: draft.dark ? normalizePalette(draft.dark) : null,
      };
      onSaved(await storage.saveSettings({ ...settings, palette }));
    } catch (failure) {
      setError(String(failure));
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Color palette"
      busy={busy}
      onClose={onClose}
      className="palette-dialog"
      style={{ ...paletteStyle(editorPalette), colorScheme: "light" }}
    >
      <p className="form-intro">
        Make Vitera yours. Choose every color, or start with a preset.
      </p>
      <form onSubmit={save}>
        <div className="palette-toolbar">
          <div
            className="palette-modes"
            role="group"
            aria-label="Palette appearance"
          >
            {(["light", "dark"] as const).map((value) => (
              <button
                key={value}
                type="button"
                data-autofocus={value === mode ? "" : undefined}
                aria-pressed={mode === value}
                disabled={busy}
                onClick={() => setMode(value)}
              >
                {value === "light" ? "Light colors" : "Dark colors"}
              </button>
            ))}
          </div>
          <label className="check-label palette-live">
            <input
              type="checkbox"
              checked={preview}
              disabled={busy}
              onChange={(e) => setPreview(e.target.checked)}
            />
            Preview across app
          </label>
        </div>
        <p className="palette-mode-note">
          Editing {mode} colors. Your Appearance setting stays{" "}
          {settings.theme === "system" ? "System" : settings.theme}.
        </p>
        <div
          className="palette-presets"
          role="group"
          aria-label="Color presets"
        >
          {presets.map((preset) => (
            <button
              type="button"
              key={preset.name}
              disabled={busy}
              onClick={() => {
                setError(null);
                setDraft((previous) => ({
                  ...previous,
                  [mode]: { ...preset[mode] },
                }));
              }}
            >
              <span className="preset-swatches" aria-hidden="true">
                {(["header", "accent", "canvas"] as const).map((key) => (
                  <i key={key} style={{ background: preset[mode][key] }} />
                ))}
              </span>
              {preset.name}
            </button>
          ))}
        </div>
        <div className="palette-layout">
          <div className="palette-fields">
            {["Surfaces", "Text & actions", "Feedback"].map((group) => (
              <fieldset key={group} disabled={busy}>
                <legend>{group}</legend>
                {colorFields
                  .filter((field) => field.group === group)
                  .map(({ key, label }) => {
                    const fieldId = `${id}-${key}`;
                    const invalid = normalizeColor(colors[key]) === null;
                    return (
                      <div className="palette-field" key={key}>
                        <label htmlFor={fieldId}>{label}</label>
                        <div className="palette-inputs">
                          <input
                            type="color"
                            value={shown[key]}
                            aria-label={`${label} color`}
                            onChange={(e) => update(key, e.target.value)}
                          />
                          <input
                            id={fieldId}
                            aria-label={`${label} hex`}
                            value={colors[key]}
                            maxLength={7}
                            spellCheck={false}
                            autoComplete="off"
                            aria-invalid={invalid}
                            aria-describedby={
                              invalid ? `${fieldId}-error` : undefined
                            }
                            onChange={(e) => update(key, e.target.value)}
                            onBlur={() => {
                              const normalized = normalizeColor(colors[key]);
                              if (normalized) update(key, normalized);
                            }}
                          />
                        </div>
                        {invalid && (
                          <p
                            className="palette-field-error"
                            id={`${fieldId}-error`}
                          >
                            Use a hex color, such as #2563EB.
                          </p>
                        )}
                      </div>
                    );
                  })}
              </fieldset>
            ))}
          </div>
          <aside className="palette-preview-column">
            <h3>Preview</h3>
            <section
              className="palette-preview"
              aria-label="Palette preview"
              style={paletteStyle(shown)}
            >
              <div className="palette-preview-header">
                <img src="/vitera.svg" alt="" /> <strong>Vitera</strong>
                <span>Today</span>
              </div>
              <div className="palette-preview-body">
                <p className="eyebrow">Your daily diary</p>
                <h3>Today</h3>
                <div className="palette-preview-total">
                  <strong>650</strong> <span>kcal logged</span>
                </div>
                <div className="palette-preview-card">
                  <strong>Lunch</strong>
                  <span>
                    Rice bowl <b>650 kcal</b>
                  </span>
                </div>
                <div className="palette-preview-highlight">
                  A little progress, every day.
                </div>
                <div className="palette-preview-actions">
                  <span className="palette-preview-button">＋ Add food</span>
                  <span>View progress</span>
                </div>
                <p className="palette-preview-error">
                  An example error message.
                </p>
              </div>
            </section>
            <div className="palette-contrast">
              <h3>Text contrast</h3>
              <p>Aim for 4.5:1 or higher for readable text.</p>
              <ul>
                {checks.map((check) => (
                  <li key={check.name}>
                    <span>{check.name}</span>
                    <span
                      className={
                        check.ratio < 4.5 ? "contrast-low" : "contrast-good"
                      }
                    >
                      {check.ratio.toFixed(2)}:1
                      {check.ratio < 4.5 ? " · Low" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {lowContrast && (
                <p className="palette-contrast-note" role="status">
                  Some text may be hard to read. You can still save these
                  colors.
                </p>
              )}
            </div>
          </aside>
        </div>
        <div className="palette-footer">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              setDraft((previous) => ({ ...previous, [mode]: null }));
            }}
          >
            Reset {mode} colors
          </button>
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy || !valid || !canSave}>
              {busy ? "Saving…" : "Save palette"}
            </button>
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!valid && (
          <p className="error" role="alert">
            Check the hex colors in both palettes before saving.
          </p>
        )}
      </form>
    </Modal>
  );
}
