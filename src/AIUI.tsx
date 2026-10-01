import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import {
  ai,
  reviewRows,
  rowIssue,
  rowPortion,
  units,
  type AiConfig,
  type Readiness,
  type ReviewRow,
  type TextDraft,
  type PreparedPhoto,
} from "./ai";
import {
  blankNutrition,
  formatKcal,
  meals,
  storage,
  type EntryInput,
  type Food,
  type Meal,
  type Nutrients,
} from "./storage";

const emptyNutrients = (): Nutrients => ({
  kcal: null,
  protein: null,
  carbohydrate: null,
  fat: null,
});
const nutrientKeys = ["kcal", "protein", "carbohydrate", "fat"] as const;

export function AISettings({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => {
    let closed = false;
    Promise.all([ai.config(), ai.credentialPresent()])
      .then(([c, t]) => {
        if (!closed) {
          setConfig(c);
          setHasToken(t);
        }
      })
      .catch((e) => {
        if (!closed) setError(String(e));
      });
    return () => {
      closed = true;
    };
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Local AI settings" onClose={onClose} busy={busy}>
      <p className="form-intro">
        Optional Ollama on this device. Meal descriptions and prepared photos
        are sent only to 127.0.0.1. Manual logging works with AI off.
      </p>
      {config && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await ai.saveConfig(config);
              setNotice("AI settings saved.");
            });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Local AI
              <select
                value={String(config.enabled)}
                onChange={(e) =>
                  setConfig({ ...config, enabled: e.target.value === "true" })
                }
              >
                <option value="false">Off</option>
                <option value="true">
                  Enabled for descriptions and photos
                </option>
              </select>
            </label>
            <div className="form-row">
              <label>
                Ollama port
                <input
                  type="number"
                  required
                  min="1"
                  max="65535"
                  value={config.port}
                  onChange={(e) => {
                    setConfig({ ...config, port: Number(e.target.value) });
                    setReadiness(null);
                  }}
                />
              </label>
              <label>
                Request timeout (seconds)
                <input
                  type="number"
                  required
                  min="5"
                  max="180"
                  value={config.timeoutSeconds}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      timeoutSeconds: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label>
              Local model
              <input
                value={config.model}
                maxLength={120}
                placeholder="e.g. gemma3:4b"
                onChange={(e) => {
                  setConfig({ ...config, model: e.target.value });
                  setReadiness(null);
                }}
                list="installed-models"
                required={config.enabled}
              />
            </label>
            <datalist id="installed-models">
              {readiness?.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <label>
              Vision model (optional)
              <input
                value={config.visionModel ?? ""}
                maxLength={120}
                list="installed-models"
                placeholder="Use the local model above"
                onChange={(e) => {
                  setConfig({ ...config, visionModel: e.target.value || null });
                  setReadiness(null);
                }}
              />
            </label>
            <p className="source-note">
              Photos may use a separate installed vision model. The Local model
              above builds the structured review. Both run on this device; leave
              this empty to use one model for both steps.
            </p>
            <button
              type="button"
              onClick={() =>
                void action(async () => {
                  setReadiness(await ai.check({ ...config, enabled: false }));
                })
              }
            >
              Check models and readiness
            </button>
            {readiness && (
              <p role="status" className="source-note">
                {readiness.message}{" "}
                {readiness.text
                  ? `Text supported · ${readiness.vision ? "vision declared" : "text-only"} · structured draft validation enabled`
                  : ""}
              </p>
            )}
            <details className="ai-auth">
              <summary>Optional local authentication</summary>
              <p className="muted">
                Standard local Ollama needs no token. A token for an
                authenticated local proxy is held in Windows Credential Manager,
                separate from diary data. Vitera never displays the saved token.
              </p>
              <p role="status">
                {hasToken
                  ? "A local token is stored."
                  : "No local token is stored."}
              </p>
              <label>
                New local token
                <input
                  type="password"
                  autoComplete="new-password"
                  value={token}
                  maxLength={2048}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  disabled={!token}
                  onClick={() => {
                    const secret = token;
                    setToken("");
                    void action(async () => {
                      await ai.setCredential(secret);
                      setHasToken(true);
                      setNotice("Token stored in Windows Credential Manager.");
                    });
                  }}
                >
                  Store token
                </button>
                <button
                  type="button"
                  disabled={!hasToken}
                  onClick={() =>
                    void action(async () => {
                      await ai.setCredential(null);
                      setHasToken(false);
                      setNotice("Local token removed.");
                    })
                  }
                >
                  Remove token
                </button>
              </div>
            </details>
          </fieldset>
          <p className="storage-note muted">
            Install and start Ollama separately, then choose a downloaded local
            model. Vitera does not download models or switch to a cloud service.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              Close settings
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Working…" : "Save AI settings"}
            </button>
          </div>
        </form>
      )}
      {!config && error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </Modal>
  );
}

function ItemReview({
  row,
  index,
  foods,
  onChange,
  onRemove,
  onPreview,
}: {
  row: ReviewRow;
  index: number;
  foods: Food[];
  onChange: (row: ReviewRow) => void;
  onRemove: () => void;
  onPreview: (id: string, values: Nutrients | null) => void;
}) {
  const [preview, setPreview] = useState<Nutrients | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let closed = false;
    setPreview(null);
    setError("");
    onPreview(row.id, null);
    if (row.food)
      storage
        .portion(rowPortion(row)!)
        .then(([values]) => {
          if (!closed) {
            setPreview(values);
            onPreview(row.id, values);
          }
        })
        .catch((e) => {
          if (!closed) setError(String(e));
        });
    return () => {
      closed = true;
    };
    // Preview updates do not change the portion being calculated.
  }, [row.id, row.food, row.quantity, row.unit]);
  const update = (patch: Partial<ReviewRow>) =>
    onChange({ ...row, ...patch, reviewed: false });
  const values = row.food ? preview : row.nutrients;
  const issue = rowIssue(row);
  return (
    <section className="ai-review-item" aria-label={`Draft item ${index + 1}`}>
      <div className="section-toolbar">
        <h3>Item {index + 1}</h3>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove item ${index + 1}`}
        >
          Remove
        </button>
      </div>
      <label>
        Item name
        <input
          value={row.name}
          required
          maxLength={120}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>
      <label>
        Nutrition source
        <select
          value={row.food?.id ?? ""}
          onChange={(e) => {
            const food = foods.find((f) => f.id === e.target.value) ?? null;
            update({
              food,
              unit: "",
              nutrients: food ? row.nutrients : (preview ?? row.nutrients),
            });
          }}
        >
          <option value="">AI-only / manually corrected estimate</option>
          {foods.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · {f.state}
            </option>
          ))}
          {row.food && !foods.some((f) => f.id === row.food!.id) && (
            <option value={row.food.id}>{row.food.name} (snapshot)</option>
          )}
        </select>
      </label>
      <p className="source-note">
        {row.food
          ? `${row.food.state} · ${row.food.source} · v${row.food.version} · nutrition calculated from the local record`
          : "AI-only estimate for the whole portion below. Missing macros stay unknown."}
      </p>
      <div className="form-row">
        <label>
          Portion amount
          <input
            type="number"
            required
            min="0.000001"
            max="100000"
            step="any"
            value={row.quantity}
            onChange={(e) => update({ quantity: e.target.value })}
          />
        </label>
        <label>
          Portion unit
          <select
            value={row.unit}
            required
            onChange={(e) => update({ unit: e.target.value })}
          >
            <option value="">Choose a unit</option>
            {row.unit &&
              !units.includes(row.unit) &&
              !(row.food && row.unit.startsWith("portion:")) && (
                <option value={row.unit}>Unsupported: {row.unit}</option>
              )}
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
            {row.food?.portions.map((p, i) => (
              <option key={i} value={`portion:${i}`}>
                {p.label} ({p.quantity} {row.food!.basisUnit})
              </option>
            ))}
          </select>
        </label>
      </div>
      {!row.food && (
        <>
          <p className="muted">
            Changing the amount does not rescale AI-only values. Correct
            calories and macros for the new portion.
          </p>
          <div className="ai-nutrients">
            {nutrientKeys.map((k) => (
              <label key={k}>
                {k === "kcal"
                  ? "Calories (kcal)"
                  : `${k === "carbohydrate" ? "Carbohydrate" : k === "protein" ? "Protein" : "Fat"} (g)`}
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="any"
                  required={k === "kcal"}
                  placeholder="Unknown"
                  value={row.nutrients[k] ?? ""}
                  onChange={(e) =>
                    update({
                      nutrients: {
                        ...row.nutrients,
                        [k]:
                          e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </>
      )}
      {values?.kcal !== null && values && (
        <p className="estimate-result">
          {formatKcal(values.kcal!)} kcal
          {row.food
            ? " · local record with reviewed portion"
            : " · AI-only / corrected estimate"}
          <span className="source-note">
            {["protein", "carbohydrate", "fat"]
              .map((k) => {
                const n = values[k as keyof Nutrients];
                return `${k}: ${n === null ? "unknown" : `${n.toFixed(1)} g`}`;
              })
              .join(" · ")}
          </span>
        </p>
      )}
      <div className="ai-assumptions">
        <h4>Assumptions to check</h4>
        {row.original.assumptions.length ? (
          <ul>
            {row.original.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : (
          <p>
            No additional assumptions supplied. Check the identity, preparation
            and portion.
          </p>
        )}
        {row.original.questions.map((q, i) => (
          <p key={i}>
            <strong>Question:</strong> {q}
          </p>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {issue && !row.reviewed && <p className="muted">{issue}</p>}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={row.reviewed}
          onChange={(e) => onChange({ ...row, reviewed: e.target.checked })}
        />
        I checked this item's portion, values and assumptions.
      </label>
    </section>
  );
}

export function DescriptionForm({
  photoMode = false,
  date: initialDate,
  meal: initialMeal,
  foods,
  busy,
  error: saveError,
  onClose,
  onSave,
}: {
  photoMode?: boolean;
  date: string;
  meal: Meal;
  foods: Food[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (
    entries: EntryInput[],
    photoId?: string,
    retainPhoto?: boolean,
  ) => void;
}) {
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [retainPhoto, setRetainPhoto] = useState(false);
  const photoRef = useRef<PreparedPhoto | null>(null);
  const photoGeneration = useRef(0);
  const [text, setText] = useState("");
  const [date, setDate] = useState(initialDate);
  const [meal, setMeal] = useState(initialMeal);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [previews, setPreviews] = useState<Record<string, Nutrients | null>>(
    {},
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const generation = useRef(0);
  const active = useRef<string | null>(null);
  const starting = useRef(false);
  useEffect(() => {
    const preventFileNavigation = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);
  useEffect(() => {
    let closed = false;
    ai.config()
      .then((c) => {
        if (!closed) setConfig(c);
      })
      .catch((e) => {
        if (!closed) setError(String(e));
      });
    return () => {
      closed = true;
      generation.current++;
      photoGeneration.current++;
      if (photoRef.current)
        void ai.releasePhoto(photoRef.current.id).catch(() => {});
      if (active.current) void ai.cancel(active.current).catch(() => {});
    };
  }, []);
  function cancel() {
    generation.current++;
    if (active.current) void ai.cancel(active.current).catch(() => {});
    active.current = null;
    starting.current = false;
    setRunning(false);
    setNotice("Request cancelled. Your review items are unchanged.");
  }
  function changed() {
    if (active.current) cancel();
    setNotice("");
  }
  async function choosePhoto(files: FileList | File[] | null) {
    if (!files?.length || busy) return;
    if (files.length !== 1) {
      setError("Choose one meal photo at a time.");
      return;
    }
    const file = files[0];
    if (file.size > 20 * 1024 * 1024 || !file.size) {
      setError("Choose a photo no larger than 20 MiB.");
      return;
    }
    changed();
    const token = ++photoGeneration.current;
    setPreparing(true);
    setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () =>
          reject(new Error("The photo could not be read."));
        reader.readAsDataURL(file);
      });
      if (token !== photoGeneration.current) return;
      const prepared = await ai.preparePhoto(data);
      if (token !== photoGeneration.current) {
        await ai.releasePhoto(prepared.id);
        return;
      }
      const previous = photoRef.current;
      photoRef.current = prepared;
      if (previous) void ai.releasePhoto(previous.id).catch(() => {});
      setPhoto(prepared);
      setDraft(null);
      setRows([]);
      setPreviews({});
      setRetainPhoto(false);
      setNotice(
        "Photo prepared. Metadata removed; original file stays on your device.",
      );
    } catch (e) {
      if (token === photoGeneration.current) setError(String(e));
    } finally {
      if (token === photoGeneration.current) setPreparing(false);
    }
  }
  function removePhoto() {
    changed();
    photoGeneration.current++;
    if (photoRef.current)
      void ai.releasePhoto(photoRef.current.id).catch(() => {});
    photoRef.current = null;
    setPhoto(null);
    setPreparing(false);
    setDraft(null);
    setRows([]);
    setPreviews({});
    setRetainPhoto(false);
  }
  async function describe() {
    if (starting.current) return;
    starting.current = true;
    const token = ++generation.current;
    const id = crypto.randomUUID();
    active.current = id;
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const result =
        photoMode && photo
          ? await ai.photo(id, text, photo.id)
          : await ai.describe(id, text);
      if (token === generation.current) {
        setDraft(result);
        setRows(reviewRows(result));
        setPreviews({});
        setNotice("Draft ready. Check each item before saving.");
      }
    } catch (e) {
      if (token === generation.current) setError(String(e));
    } finally {
      if (token === generation.current) {
        active.current = null;
        starting.current = false;
        setRunning(false);
      }
    }
  }
  const allReady =
    rows.length > 0 &&
    rows.every(
      (r) =>
        !rowIssue(r) &&
        (!r.food || (previews[r.id]?.kcal !== null && !!previews[r.id])),
    );
  const knownCalories = rows
    .map((row) =>
      row.food ? (previews[row.id]?.kcal ?? null) : row.nutrients.kcal,
    )
    .filter((value): value is number => value !== null);
  function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || !allReady || running || preparing || busy) return;
    onSave(
      rows.map((row) => ({
        id: row.id,
        date,
        meal,
        name: row.name,
        kcal: row.food ? 0 : row.nutrients.kcal!,
        revision: null,
        nutrition: {
          ...blankNutrition(),
          protein: row.food ? null : row.nutrients.protein,
          carbohydrate: row.food ? null : row.nutrients.carbohydrate,
          fat: row.food ? null : row.nutrients.fat,
          foodPortion: rowPortion(row),
          ai: {
            requestId: draft.requestId,
            provider: draft.provider,
            model: draft.model,
            promptVersion: draft.promptVersion,
            schemaVersion: draft.schemaVersion,
            generatedAt: draft.generatedAt,
            originalName: row.original.name,
            originalQuantity: row.original.quantity,
            originalUnit: row.original.unit,
            quantity: Number(row.quantity),
            unit: row.unit,
            assumptions: row.original.assumptions,
            questions: row.original.questions,
            reviewed: true,
            photo: draft.photo ?? null,
            visionModel: draft.visionModel ?? null,
          },
        },
      })),
      draft.photo?.id,
      !!draft.photo && retainPhoto,
    );
  }
  return (
    <>
      <Modal
        title={photoMode ? "Photo meal draft" : "Describe a meal"}
        active={!settingsOpen}
        busy={busy}
        onClose={() => {
          cancel();
          onClose();
        }}
      >
        <p className="form-intro">
          A local model proposes items. Review the identities, amounts and
          assumptions; nothing enters your diary until you save.
        </p>
        {photoMode && (
          <>
            <div
              className="photo-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) void choosePhoto(e.dataTransfer.files);
              }}
            >
              <label>
                Meal photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || preparing}
                  onChange={(e) => {
                    void choosePhoto(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="muted">
                Choose or drop one JPEG, PNG or WebP, up to 20 MiB / 24
                megapixels. HEIC needs conversion.
              </p>
            </div>
            {preparing && <p role="status">Preparing photo…</p>}
            {photo && (
              <figure className="photo-preview">
                <img
                  src={`data:image/jpeg;base64,${photo.data}`}
                  alt="Prepared meal photo for review"
                />
                <figcaption>
                  {photo.width} × {photo.height} · metadata removed
                </figcaption>
                <button type="button" disabled={busy} onClick={removePhoto}>
                  Remove photo
                </button>
              </figure>
            )}
            <p className="source-note">
              Photo portions are estimates. Check hidden oils, ingredients and
              preparation. A vision model is required; no paid fallback is
              enabled.
            </p>
          </>
        )}
        <label>
          {photoMode ? "Optional photo context" : "Meal description"}
          <textarea
            data-autofocus=""
            rows={3}
            value={text}
            maxLength={4000}
            disabled={busy}
            placeholder="e.g. two boiled eggs, 150 g cooked rice and toast with butter"
            onChange={(e) => {
              changed();
              setText(e.target.value);
            }}
          />
        </label>
        <p className="source-note">
          {config?.enabled
            ? `Ollama · ${config.model} · this device only · ${config.timeoutSeconds}s timeout`
            : "Local AI is off. Enable a downloaded model in AI settings. Manual food entry remains available."}
        </p>
        {photoMode && config?.enabled && (
          <p className="source-note">
            Photo observations: {config.visionModel ?? config.model}. Structured
            draft: {config.model}.
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            disabled={busy || running}
            onClick={() => setSettingsOpen(true)}
          >
            AI settings
          </button>
          {running ? (
            <button type="button" onClick={cancel}>
              Cancel request
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={
                busy ||
                preparing ||
                !config?.enabled ||
                (photoMode ? !photo : !text.trim())
              }
              onClick={() => void describe()}
            >
              {draft ? "Generate new draft" : "Create draft"}
            </button>
          )}
        </div>
        {running && (
          <p role="status">
            Preparing a local draft… You can cancel or edit your existing items.
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {draft?.photoObservation && (
          <details>
            <summary>What the vision model saw</summary>
            <p>{draft.photoObservation}</p>
            <p className="source-note">
              Unverified model observations. Check them against your meal before
              confirming the items.
            </p>
          </details>
        )}
        <form onSubmit={save}>
          <fieldset disabled={busy}>
            {rows.length > 0 && (
              <p className="estimate-result">
                {formatKcal(
                  knownCalories.reduce((sum, value) => sum + value, 0),
                )}{" "}
                kcal in this draft · {knownCalories.length}/{rows.length} items
                calculated
                {knownCalories.length < rows.length ? " · partial total" : ""}
              </p>
            )}
            {rows.map((row, index) => (
              <ItemReview
                key={row.id}
                row={row}
                index={index}
                foods={foods}
                onChange={(updated) => {
                  changed();
                  setRows((old) =>
                    old.map((r) => (r.id === updated.id ? updated : r)),
                  );
                }}
                onRemove={() => {
                  changed();
                  setRows((old) => old.filter((r) => r.id !== row.id));
                }}
                onPreview={(id, values) =>
                  setPreviews((old) => ({ ...old, [id]: values }))
                }
              />
            ))}
            {draft && (
              <button
                type="button"
                disabled={rows.length >= 20}
                onClick={() => {
                  changed();
                  setRows((old) => [
                    ...old,
                    {
                      id: crypto.randomUUID(),
                      original: {
                        name: "Added during review",
                        foodId: null,
                        quantity: null,
                        unit: null,
                        nutrients: emptyNutrients(),
                        assumptions: ["Added manually during review."],
                        questions: [],
                      },
                      name: "",
                      quantity: "",
                      unit: "",
                      food: null,
                      nutrients: emptyNutrients(),
                      reviewed: false,
                    },
                  ]);
                }}
              >
                Add an item
              </button>
            )}
            <div className="form-row">
              <label>
                Meal
                <select
                  value={meal}
                  onChange={(e) => {
                    changed();
                    setMeal(e.target.value as Meal);
                  }}
                >
                  {meals.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => {
                    changed();
                    setDate(e.target.value);
                  }}
                />
              </label>
            </div>
            {draft?.photo && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={retainPhoto}
                  onChange={(e) => setRetainPhoto(e.target.checked)}
                />
                Keep the prepared photo locally with these diary items.
              </label>
            )}
            {draft?.photo && (
              <p className="source-note">
                Retention is off by default. Closing this draft clears its
                temporary photo from Vitera memory. A retained photo is shared
                by these items and can be removed from Edit food.
              </p>
            )}
            {draft && (
              <p className="source-note">
                Draft: {draft.model} · {draft.promptVersion} · schema{" "}
                {draft.schemaVersion}. Local matches use stored nutrition; other
                rows retain the AI-only estimate label.
              </p>
            )}
          </fieldset>
          {saveError && (
            <p role="alert" className="error">
              {saveError}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                cancel();
                onClose();
              }}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy || running || preparing || !allReady}
            >
              {busy ? "Saving…" : "Save reviewed items"}
            </button>
          </div>
        </form>
      </Modal>
      {settingsOpen && (
        <AISettings
          onClose={() => {
            setSettingsOpen(false);
            void ai
              .config()
              .then(setConfig)
              .catch((e) => setError(String(e)));
          }}
        />
      )}
    </>
  );
}
