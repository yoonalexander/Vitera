import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import type { Composer } from "./App";
import {
  blankNutrition,
  formatKcal,
  localDate,
  storage,
  type EntryInput,
  type Food,
  type FoodPortion,
  type Goal,
  type Library,
  type Meal,
  meals,
  type Nutrients,
  type Estimate,
  type EstimateInput,
  type Week,
} from "./storage";

type Common = { busy: boolean; error: string | null; onClose: () => void };
const optional = (value: string) =>
  value.trim() === "" ? null : Number(value);
const nutrientNames = ["protein", "carbohydrate", "fat"] as const;
const unitOptions = ["g", "kg", "oz", "lb", "ml", "l", "fl oz (US)", "serving"];

function MacroFields({
  values,
  onChange,
}: {
  values: Nutrients;
  onChange: (value: Nutrients) => void;
}) {
  return (
    <div className="macro-fields">
      {nutrientNames.map((key) => (
        <label key={key}>
          {key === "carbohydrate"
            ? "Carbohydrate"
            : key === "protein"
              ? "Protein"
              : "Fat"}{" "}
          (g)
          <input
            type="number"
            min="0"
            max="100000"
            step="any"
            placeholder="Unknown"
            value={values[key] ?? ""}
            onChange={(e) =>
              onChange({ ...values, [key]: optional(e.target.value) })
            }
          />
        </label>
      ))}
    </div>
  );
}

export function FoodForm({
  composer,
  library,
  onSave,
  ...common
}: Common & {
  composer: Composer;
  library: Library;
  onSave: (input: EntryInput) => void;
}) {
  const [name, setName] = useState(composer.entry?.name ?? "");
  const [kcal, setKcal] = useState(
    composer.entry ? String(composer.entry.kcal) : "",
  );
  const [values, setValues] = useState<Nutrients>({
    kcal: null,
    protein: composer.entry?.protein ?? null,
    carbohydrate: composer.entry?.carbohydrate ?? null,
    fat: composer.entry?.fat ?? null,
  });
  const [portion, setPortion] = useState<FoodPortion | null>(
    composer.entry?.foodPortion ?? null,
  );
  const [meal, setMeal] = useState<Meal>(composer.meal);
  const [date, setDate] = useState(composer.date);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const food = portion?.food;
  const [preview, setPreview] = useState<[Nutrients, string] | null>(null);
  const [portionError, setPortionError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setPortionError("");
    if (portion)
      storage
        .portion(portion)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch((e) => {
          if (!cancelled) setPortionError(String(e));
        });
    return () => {
      cancelled = true;
    };
  }, [portion]);
  function choose(food: Food) {
    setName(food.name);
    setPortion({
      food,
      quantity: food.portions.length ? 1 : food.basisQuantity,
      unit: food.portions.length ? "portion:0" : food.basisUnit,
    });
    setSearchOpen(false);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      id: composer.id,
      date,
      meal,
      name,
      kcal: portion ? 0 : Number(kcal),
      revision: composer.entry?.revision ?? null,
      nutrition: {
        ...blankNutrition(),
        protein: values.protein,
        carbohydrate: values.carbohydrate,
        fat: values.fat,
        foodPortion: portion,
        timezone: composer.entry?.timezone ?? blankNutrition().timezone,
      },
    });
  }
  return (
    <Modal
      title={composer.entry ? "Edit food" : "Add food"}
      onClose={common.onClose}
      busy={common.busy}
    >
      <p className="form-intro">Search a food or enter a name and calories.</p>
      {!composer.entry && (
        <details
          open={searchOpen}
          onToggle={(e) => setSearchOpen(e.currentTarget.open)}
        >
          <summary>Search local foods</summary>
          <label>
            Search foods
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. banana or rice"
            />
          </label>
          <div className="food-results">
            {library.foods
              .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
              .map((f) => (
                <button
                  key={f.id}
                  disabled={common.busy}
                  onClick={() => choose(f)}
                >
                  <strong>{f.name}</strong>
                  <span>
                    {f.state} · {f.source}
                  </span>
                </button>
              ))}
          </div>
          {!library.foods.some((f) =>
            f.name.toLowerCase().includes(query.toLowerCase()),
          ) && (
            <p className="muted">
              No match. Enter it manually or create a custom food from Today.
            </p>
          )}
        </details>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={common.busy}>
          <label>
            Food name
            <input
              data-autofocus=""
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          {food && portion ? (
            <>
              <p className="source-note">
                {food.state} · {food.source}
                {food.sourceId ? ` · ID ${food.sourceId}` : ""} · v
                {food.version}
              </p>
              <div className="form-row">
                <label>
                  Portion amount
                  <input
                    type="number"
                    min="0.000001"
                    max="100000"
                    step="any"
                    required
                    value={portion.quantity}
                    onChange={(e) =>
                      setPortion({
                        ...portion,
                        quantity: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Portion unit
                  <select
                    value={portion.unit}
                    onChange={(e) =>
                      setPortion({ ...portion, unit: e.target.value })
                    }
                  >
                    {food.portions.map((p, i) => (
                      <option key={i} value={`portion:${i}`}>
                        {p.label} ({p.quantity} {food.basisUnit})
                      </option>
                    ))}
                    {unitOptions
                      .filter((u) =>
                        food.basisUnit === "serving"
                          ? u === "serving"
                          : u !== "serving" &&
                            (food.density ||
                              (food.basisUnit === "g"
                                ? ["g", "kg", "oz", "lb"].includes(u)
                                : ["ml", "l", "fl oz (US)"].includes(u))),
                      )
                      .map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                  </select>
                </label>
              </div>
              <p className="muted">
                Nutrition is calculated from {food.basisQuantity}{" "}
                {food.basisUnit}. Missing nutrients stay unknown.
              </p>
              {preview && (
                <p className="estimate-result" role="status">
                  {formatKcal(preview[0].kcal!)} kcal · {preview[1]}
                  <span className="source-note">
                    {nutrientNames
                      .map(
                        (k) =>
                          `${k}: ${preview[0][k] === null ? "unknown" : `${preview[0][k]!.toFixed(1)} g`}`,
                      )
                      .join(" · ")}
                  </span>
                </p>
              )}
              {portionError && (
                <p className="error" role="alert">
                  {portionError}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setPortion(null);
                  setKcal(String(composer.entry?.kcal ?? ""));
                }}
              >
                Use manual values instead
              </button>
            </>
          ) : (
            <>
              <label>
                Calories (kcal)
                <input
                  type="number"
                  inputMode="decimal"
                  value={kcal}
                  onChange={(e) => setKcal(e.target.value)}
                  min="0"
                  max="100000"
                  step="any"
                  required
                />
              </label>
              <details>
                <summary>Optional macros</summary>
                <p className="muted">
                  Leave unlisted nutrients blank. Zero means a known zero.
                </p>
                <MacroFields values={values} onChange={setValues} />
              </details>
            </>
          )}
          <div className="form-row">
            <label>
              Meal
              <select
                value={meal}
                onChange={(e) => setMeal(e.target.value as Meal)}
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
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
        </fieldset>
        {common.error && (
          <p role="alert" className="error">
            {common.error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={common.onClose} disabled={common.busy}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={common.busy || (!!portion && !preview)}
          >
            {common.busy ? "Saving…" : "Save to diary"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CustomFoodForm({
  food,
  onSave,
  ...common
}: Common & { food: Food | null; onSave: (food: Food) => void }) {
  const [id] = useState(food?.id ?? crypto.randomUUID());
  const [name, setName] = useState(food?.name ?? "");
  const [state, setState] = useState(food?.state ?? "As sold");
  const [basis, setBasis] = useState(food?.basisQuantity ?? 100);
  const [unit, setUnit] = useState(food?.basisUnit ?? "g");
  const [density, setDensity] = useState(
    food?.density === null || !food ? "" : String(food.density),
  );
  const [values, setValues] = useState<Nutrients>(
    food?.nutrients ?? {
      kcal: null,
      protein: null,
      carbohydrate: null,
      fat: null,
    },
  );
  const [portions, setPortions] = useState(food?.portions ?? []);
  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      id,
      version: food?.version ?? 1,
      name,
      state,
      source: "Custom label/manual",
      sourceId: null,
      basisQuantity: basis,
      basisUnit: unit,
      density: optional(density),
      nutrients: values,
      portions,
      favorite: food?.favorite ?? false,
    });
  }
  return (
    <Modal
      title={food ? "Edit custom food" : "Create custom food"}
      busy={common.busy}
      onClose={common.onClose}
    >
      <form onSubmit={submit}>
        <fieldset disabled={common.busy}>
          <label>
            Food name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label>
            Preparation / state
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <div className="form-row">
            <label>
              Nutrition basis amount
              <input
                type="number"
                min="0.000001"
                max="100000"
                step="any"
                value={basis}
                onChange={(e) => setBasis(Number(e.target.value))}
                required
              />
            </label>
            <label>
              Nutrition basis unit
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {["g", "ml", "serving"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Calories for basis (kcal)
            <input
              type="number"
              min="0"
              max="100000"
              step="any"
              placeholder="Blank to derive from all macros"
              value={values.kcal ?? ""}
              onChange={(e) =>
                setValues({ ...values, kcal: optional(e.target.value) })
              }
            />
          </label>
          <MacroFields values={values} onChange={setValues} />
          <p className="muted">
            Stated calories take priority. If blank, all macros are required for
            the approximate 4/4/9 calculation.
          </p>
          {unit !== "serving" && (
            <label>
              Density (g/ml), optional
              <input
                type="number"
                min="0.000001"
                max="100000"
                step="any"
                value={density}
                onChange={(e) => setDensity(e.target.value)}
                placeholder="Needed only to convert mass and volume"
              />
            </label>
          )}
          <h3>Named portions</h3>
          <p className="muted">
            Amounts use the nutrition basis unit ({unit}).
          </p>
          {portions.map((p, i) => (
            <div className="portion-row" key={i}>
              <label>
                Portion name {i + 1}
                <input
                  value={p.label}
                  maxLength={120}
                  required
                  onChange={(e) =>
                    setPortions(
                      portions.map((v, j) =>
                        j === i ? { ...v, label: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Portion size {i + 1} ({unit})
                <input
                  type="number"
                  min="0.000001"
                  max="100000"
                  step="any"
                  required
                  value={p.quantity}
                  onChange={(e) =>
                    setPortions(
                      portions.map((v, j) =>
                        j === i
                          ? { ...v, quantity: Number(e.target.value) }
                          : v,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                aria-label={`Remove portion ${i + 1}`}
                onClick={() => setPortions(portions.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={portions.length >= 30}
            onClick={() =>
              setPortions([...portions, { label: "", quantity: basis }])
            }
          >
            Add named portion
          </button>
        </fieldset>
        {common.error && (
          <p role="alert" className="error">
            {common.error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" disabled={common.busy} onClick={common.onClose}>
            Cancel
          </button>
          <button className="primary" disabled={common.busy}>
            Save custom food
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function GoalForm({
  goals,
  onSave,
  ...common
}: Common & { goals: Goal[]; onSave: (goal: Goal) => void }) {
  const active = goals.find((g) => g.effectiveDate <= localDate());
  const [mode, setMode] = useState("manual");
  const [kcal, setKcal] = useState(active ? String(active.kcal) : "");
  const [date, setDate] = useState(localDate());
  const [input, setInput] = useState<EstimateInput>(
    active?.estimate ?? {
      weightKg: 0,
      heightCm: 0,
      age: 0,
      coefficient: 5,
      activity: 1.2,
      adjustment: 0,
    },
  );
  const [variant, setVariant] = useState(
    active?.estimate ? String(active.estimate.coefficient) : "",
  );
  const [preview, setPreview] = useState<Estimate | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  function update(next: EstimateInput) {
    setInput(next);
    setPreview(null);
    setPreviewError("");
  }
  async function calculate() {
    setPreviewing(true);
    setPreviewError("");
    try {
      setPreview(await storage.estimate(input));
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setPreviewing(false);
    }
  }
  return (
    <Modal
      title="Calorie target"
      busy={common.busy || previewing}
      onClose={common.onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            effectiveDate: date,
            kcal: Number(kcal),
            estimate: mode === "estimate" ? input : null,
          });
        }}
      >
        <fieldset disabled={common.busy || previewing}>
          <label>
            Target method
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setPreview(null);
              }}
            >
              <option value="manual">Manual target</option>
              <option value="estimate">Adult estimate</option>
            </select>
          </label>
          {mode === "manual" ? (
            <label>
              Daily target (kcal)
              <input
                type="number"
                min="1"
                max="100000"
                step="any"
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                required
              />
            </label>
          ) : (
            <>
              <p className="form-intro">
                Mifflin–St Jeor estimates adult resting energy. Activity and
                your signed adjustment are starting assumptions. Choose manual
                if this equation is inapplicable.
              </p>
              <label>
                Equation variant
                <select
                  value={variant}
                  required
                  onChange={(e) => {
                    setVariant(e.target.value);
                    update({ ...input, coefficient: Number(e.target.value) });
                  }}
                >
                  <option value="">Choose or use manual instead</option>
                  <option value="5">Study male formula (+5)</option>
                  <option value="-161">Study female formula (−161)</option>
                </select>
              </label>
              <p className="muted">
                The study used these two coefficients. No birth date or gender
                identity is stored.
              </p>
              <div className="form-row">
                <label>
                  Weight (kg)
                  <input
                    type="number"
                    min="20"
                    max="500"
                    step="any"
                    required
                    value={input.weightKg || ""}
                    onChange={(e) =>
                      update({ ...input, weightKg: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Height (cm)
                  <input
                    type="number"
                    min="100"
                    max="250"
                    step="any"
                    required
                    value={input.heightCm || ""}
                    onChange={(e) =>
                      update({ ...input, heightCm: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                Age (years, adults only)
                <input
                  type="number"
                  min="18"
                  max="120"
                  step="1"
                  required
                  value={input.age || ""}
                  onChange={(e) =>
                    update({ ...input, age: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Activity assumption
                <select
                  value={
                    [1.2, 1.375, 1.55, 1.725, 1.9].includes(input.activity)
                      ? String(input.activity)
                      : "advanced"
                  }
                  onChange={(e) =>
                    update({
                      ...input,
                      activity:
                        e.target.value === "advanced"
                          ? 1.21
                          : Number(e.target.value),
                    })
                  }
                >
                  <option value="1.2">Mostly sedentary · 1.2</option>
                  <option value="1.375">Light activity · 1.375</option>
                  <option value="1.55">Moderate activity · 1.55</option>
                  <option value="1.725">High activity · 1.725</option>
                  <option value="1.9">Very high activity · 1.9</option>
                  <option value="advanced">Advanced multiplier</option>
                </select>
              </label>
              <label>
                Activity multiplier
                <input
                  type="number"
                  min="1"
                  max="2.5"
                  step="any"
                  required
                  value={input.activity}
                  onChange={(e) =>
                    update({ ...input, activity: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Signed adjustment (kcal)
                <input
                  type="number"
                  min="-2000"
                  max="2000"
                  step="any"
                  required
                  value={input.adjustment}
                  onChange={(e) =>
                    update({ ...input, adjustment: Number(e.target.value) })
                  }
                />
              </label>
              <p className="muted">
                0 for maintenance; negative for loss or positive for gain.
                CalPal does not choose an adjustment or predict a weight-change
                date.
              </p>
              <button
                type="button"
                onClick={() => void calculate()}
                disabled={!variant}
              >
                Preview estimate
              </button>
              {preview && (
                <p className="estimate-result" role="status">
                  Resting {formatKcal(preview.resting)} · maintenance{" "}
                  {formatKcal(preview.maintenance)} · proposed target{" "}
                  <strong>{formatKcal(preview.target)} kcal</strong>
                </p>
              )}
              {previewError && (
                <p role="alert" className="error">
                  {previewError}
                </p>
              )}
              <p className="muted">
                <a
                  href="https://pubmed.ncbi.nlm.nih.gov/2305711/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Equation source: Mifflin et al. (1990)
                </a>
              </p>
            </>
          )}
          <label>
            Apply from date
            <input
              type="date"
              min={localDate()}
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <p className="muted">
            Past days keep their targets. This explicitly applies the chosen
            target to today or a future date.
          </p>
        </fieldset>
        {common.error && (
          <p role="alert" className="error">
            {common.error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            onClick={common.onClose}
            disabled={common.busy || previewing}
          >
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              common.busy || previewing || (mode === "estimate" && !preview)
            }
          >
            Apply target
          </button>
        </div>
      </form>
      <details>
        <summary>Target history ({goals.length})</summary>
        <ul>
          {goals.map((g, i) => (
            <li key={i}>
              {g.effectiveDate} · {formatKcal(g.kcal)} kcal ·{" "}
              {g.estimate ? "Adult estimate" : "Manual"}
              {g.estimate && (
                <span className="source-note">
                  {g.estimate.weightKg} kg · {g.estimate.heightCm} cm · age{" "}
                  {g.estimate.age} · coefficient {g.estimate.coefficient} ·
                  activity {g.estimate.activity} · adjustment{" "}
                  {g.estimate.adjustment}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </Modal>
  );
}

export function WeeklySummary({ week }: { week: Week | null }) {
  return (
    <section className="weekly-summary" aria-label="Weekly calorie summary">
      <h2>Seven-day diary summary</h2>
      {week ? (
        <>
          <p className="weekly-average">
            {week.averageKcal === null
              ? "No complete days yet"
              : `${formatKcal(week.averageKcal)} kcal average`}
            <span className="muted">
              {week.completeDays}/7 days complete · {week.loggedDays}/7 days
              with entries
            </span>
          </p>
          <p className="muted">
            Average includes complete days only. Mark an intentionally empty day
            complete to include zero. Incomplete and missing days are excluded.
          </p>
          <div className="table-scroll">
            <table>
              <caption>Seven days ending {week.days[6].date}</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Logged kcal</th>
                  <th scope="col">Target</th>
                  <th scope="col">Diary status</th>
                </tr>
              </thead>
              <tbody>
                {week.days.map((d) => (
                  <tr key={d.date}>
                    <th scope="row">{d.date}</th>
                    <td>
                      {d.entries || d.complete ? formatKcal(d.totalKcal) : "—"}
                    </td>
                    <td>{d.target ? formatKcal(d.target.kcal) : "Not set"}</td>
                    <td>
                      {d.complete
                        ? "Complete"
                        : d.entries
                          ? "Partial"
                          : "Missing"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>Loading summary…</p>
      )}
    </section>
  );
}
