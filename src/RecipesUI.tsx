import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import {
  storage,
  blankNutrition,
  formatKcal,
  formatMetric,
  meals,
  mealItem,
  timezone,
  type Recipe,
  type RecipeNutrition,
  type RecipePortion,
  type RecipeLibrary,
  type Food,
  type Entry,
  type EntryInput,
  type Meal,
  type SavedMeal,
  type MealLog,
  type FoodPortion,
} from "./storage";

type Common = { busy: boolean; error: string | null; onClose: () => void };
const optional = (v: string) => (v.trim() === "" ? null : Number(v));
const foodUnits = (f: Food) =>
  f.basisUnit === "serving"
    ? ["serving"]
    : f.density
      ? ["g", "kg", "oz", "lb", "ml", "l", "fl oz (US)"]
      : f.basisUnit === "g"
        ? ["g", "kg", "oz", "lb"]
        : ["ml", "l", "fl oz (US)"];
function RecipeValues({ result }: { result: RecipeNutrition }) {
  return (
    <p className="estimate-result" role="status">
      <strong>{formatKcal(result.nutrients.kcal!)} kcal</strong>
      {(["protein", "carbohydrate", "fat"] as const).map((k) => (
        <span key={k} className="source-note">
          {k}:{" "}
          {result.nutrients[k] === null
            ? "unknown"
            : `${formatMetric(result.nutrients[k]!)} g`}
          {result.coverage[k].known < result.coverage[k].total
            ? ` · partial (${result.coverage[k].known}/${result.coverage[k].total} ingredients)`
            : ""}
        </span>
      ))}
    </p>
  );
}
export function RecipeForm({
  recipe,
  foods,
  onSave,
  ...common
}: Common & {
  recipe: Recipe | null;
  foods: Food[];
  onSave: (r: Recipe) => void;
}) {
  const [id] = useState(recipe?.id ?? crypto.randomUUID());
  const [name, setName] = useState(recipe?.name ?? "");
  const [instructions, setInstructions] = useState(recipe?.instructions ?? "");
  const [ingredients, setIngredients] = useState<FoodPortion[]>(
    recipe?.ingredients ?? [],
  );
  const [selected, setSelected] = useState("");
  const [servings, setServings] = useState(
    recipe?.servings ? String(recipe.servings) : "",
  );
  const [yieldWeight, setYieldWeight] = useState(
    recipe?.finishedYieldG ? String(recipe.finishedYieldG) : "",
  );
  const [preview, setPreview] = useState<RecipeNutrition | null>(null);
  const [previewError, setPreviewError] = useState("");
  const build = (): Recipe => ({
    id,
    version: recipe?.version ?? 1,
    name,
    instructions,
    ingredients,
    servings: optional(servings),
    finishedYieldG: optional(yieldWeight),
  });
  useEffect(() => {
    let canceled = false;
    setPreview(null);
    setPreviewError("");
    if (name.trim() && ingredients.length && (servings || yieldWeight))
      storage
        .recipe(build())
        .then((r) => {
          if (!canceled) setPreview(r);
        })
        .catch((e) => {
          if (!canceled) setPreviewError(String(e));
        });
    return () => {
      canceled = true;
    };
  }, [name, instructions, ingredients, servings, yieldWeight]);
  function update(i: number, p: FoodPortion) {
    setIngredients(ingredients.map((v, j) => (i === j ? p : v)));
  }
  return (
    <Modal title={recipe ? "Edit recipe" : "Create recipe"} {...common}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(build());
        }}
      >
        <fieldset disabled={common.busy}>
          <label>
            Recipe name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
            />
          </label>
          <label>
            Instructions, optional
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={4000}
              rows={3}
            />
          </label>
          <h3>Ingredients</h3>
          <p className="muted">
            Use the correct raw/cooked food record. Include oils, sauces and
            additions explicitly.
          </p>
          {ingredients.map((p, i) => (
            <section
              className="ingredient-row"
              key={i}
              aria-label={`Ingredient ${i + 1}`}
            >
              <strong>{p.food.name}</strong>
              <p className="source-note">
                {p.food.state} · {p.food.source} · v{p.food.version}
              </p>
              <div className="form-row">
                <label>
                  Ingredient {i + 1} amount
                  <input
                    type="number"
                    value={p.quantity}
                    min="0.000001"
                    max="100000"
                    step="any"
                    required
                    onChange={(e) =>
                      update(i, { ...p, quantity: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Ingredient {i + 1} unit
                  <select
                    value={p.unit}
                    onChange={(e) => update(i, { ...p, unit: e.target.value })}
                  >
                    {p.food.portions.map((v, j) => (
                      <option value={`portion:${j}`} key={j}>
                        {v.label} ({v.quantity} {p.food.basisUnit})
                      </option>
                    ))}
                    {foodUnits(p.food).map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="section-toolbar">
                <button
                  type="button"
                  onClick={() =>
                    setIngredients(ingredients.filter((_, j) => j !== i))
                  }
                >
                  Remove ingredient {i + 1}
                </button>
                {foods.find(
                  (f) => f.id === p.food.id && f.version !== p.food.version,
                ) && (
                  <button
                    type="button"
                    onClick={() =>
                      update(i, {
                        ...p,
                        food: foods.find((f) => f.id === p.food.id)!,
                      })
                    }
                  >
                    Use latest ingredient data
                  </button>
                )}
              </div>
            </section>
          ))}
          <label>
            Add ingredient from library
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose a food</option>
              {foods.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {f.state}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!selected || ingredients.length >= 100}
            onClick={() => {
              const food = foods.find((f) => f.id === selected)!;
              setIngredients([
                ...ingredients,
                { food, quantity: food.basisQuantity, unit: food.basisUnit },
              ]);
              setSelected("");
            }}
          >
            Add ingredient
          </button>
          <div className="form-row recipe-yield">
            <label>
              Number of servings, optional
              <input
                type="number"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                min="0.000001"
                max="100000"
                step="any"
              />
            </label>
            <label>
              Measured finished weight (g), optional
              <input
                type="number"
                value={yieldWeight}
                onChange={(e) => setYieldWeight(e.target.value)}
                min="0.000001"
                max="100000"
                step="any"
              />
            </label>
          </div>
          <p className="muted">
            Enter at least one yield. Cooking changes water weight: measured
            finished weight is required for weighed portions. Ingredient weight
            is never substituted.
          </p>
          {preview && (
            <>
              <h3>Whole recipe</h3>
              <RecipeValues result={preview} />
              {optional(servings) && (
                <p className="muted">
                  {formatKcal(preview.nutrients.kcal! / Number(servings))} kcal
                  per serving
                </p>
              )}
            </>
          )}
          {previewError && (
            <p className="error" role="alert">
              {previewError}
            </p>
          )}
        </fieldset>
        {common.error && (
          <p className="error" role="alert">
            {common.error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={common.onClose} disabled={common.busy}>
            Cancel
          </button>
          <button className="primary" disabled={common.busy || !preview}>
            Save recipe
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function RecipeLogForm({
  recipe,
  date,
  entry,
  onSave,
  ...common
}: Common & {
  recipe: Recipe;
  date: string;
  entry?: Entry;
  onSave: (e: EntryInput) => void;
}) {
  const [id] = useState(entry?.id ?? crypto.randomUUID());
  const [quantity, setQuantity] = useState(entry?.recipePortion?.quantity ?? 1);
  const [unit, setUnit] = useState(
    entry?.recipePortion?.unit ?? (recipe.servings ? "serving" : "g"),
  );
  const [day, setDay] = useState(entry?.date ?? date);
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? "Lunch");
  const [name, setName] = useState(entry?.name ?? recipe.name);
  const [preview, setPreview] = useState<RecipeNutrition | null>(null);
  const [previewError, setPreviewError] = useState("");
  const portion: RecipePortion = { recipe, quantity, unit };
  useEffect(() => {
    let canceled = false;
    setPreview(null);
    setPreviewError("");
    storage
      .recipePortion(portion)
      .then((r) => {
        if (!canceled) setPreview(r);
      })
      .catch((e) => {
        if (!canceled) setPreviewError(String(e));
      });
    return () => {
      canceled = true;
    };
  }, [recipe, quantity, unit]);
  return (
    <Modal title={entry ? "Edit recipe entry" : "Log recipe"} {...common}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            id,
            date: day,
            meal,
            name,
            kcal: 0,
            revision: entry?.revision ?? null,
            nutrition: {
              ...blankNutrition(),
              recipePortion: portion,
              timezone: entry?.timezone ?? timezone(),
            },
          });
        }}
      >
        <fieldset disabled={common.busy}>
          <p className="source-note">
            {recipe.name} · recipe v{recipe.version}. This version stays with
            the logged entry.
          </p>
          <label>
            Diary entry name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <div className="form-row">
            <label>
              Recipe portion amount
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                min="0.000001"
                max="100000"
                step="any"
                required
              />
            </label>
            <label>
              Recipe portion unit
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {recipe.servings && <option value="serving">serving</option>}
                {recipe.finishedYieldG &&
                  ["g", "kg", "oz", "lb"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
              </select>
            </label>
          </div>
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
                value={day}
                onChange={(e) => setDay(e.target.value)}
                required
              />
            </label>
          </div>
          {preview && <RecipeValues result={preview} />}{" "}
          {previewError && (
            <p className="error" role="alert">
              {previewError}
            </p>
          )}
        </fieldset>
        {common.error && (
          <p className="error" role="alert">
            {common.error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={common.onClose} disabled={common.busy}>
            Cancel
          </button>
          <button className="primary" disabled={common.busy || !preview}>
            Save to diary
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function SavedMealForm({
  meal,
  entries,
  date,
  onSave,
  ...common
}: Common & {
  meal: SavedMeal | null;
  entries: Entry[];
  date: string;
  onSave: (m: SavedMeal) => void;
}) {
  const [id] = useState(meal?.id ?? crypto.randomUUID());
  const [name, setName] = useState(meal?.name ?? "");
  const [items, setItems] = useState(meal?.items ?? []);
  const [selected, setSelected] = useState<string[]>([]);
  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      id,
      version: meal?.version ?? 1,
      name,
      items: [
        ...items,
        ...entries.filter((e) => selected.includes(e.id)).map(mealItem),
      ],
    });
  }
  return (
    <Modal title={meal ? "Edit saved meal" : "Create saved meal"} {...common}>
      <form onSubmit={submit}>
        <fieldset disabled={common.busy}>
          <label>
            Saved meal name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
            />
          </label>
          <h3>Saved items</h3>
          {items.map((item, i) => (
            <div className="library-row" key={i}>
              <span>
                {item.name} · {formatKcal(item.kcal)} kcal · {item.meal}
              </span>
              <button
                type="button"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
              >
                Remove saved item {i + 1}
              </button>
            </div>
          ))}
          <h3>Add entries from {date}</h3>
          {entries.length ? (
            entries.map((e) => (
              <label className="checkbox-label" key={e.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(e.id)}
                  onChange={(v) =>
                    setSelected(
                      v.target.checked
                        ? [...selected, e.id]
                        : selected.filter((id) => id !== e.id),
                    )
                  }
                />
                {e.name} · {formatKcal(e.kcal)} kcal · {e.meal}
              </label>
            ))
          ) : (
            <p className="muted">
              Log foods or a recipe on this diary date first.
            </p>
          )}
          <p className="muted">
            Saved meals keep the selected nutrition and portions. Editing this
            meal does not change earlier diary entries.
          </p>
        </fieldset>
        {common.error && (
          <p className="error" role="alert">
            {common.error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" disabled={common.busy} onClick={common.onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={common.busy || !(items.length + selected.length)}
          >
            Save meal
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function SavedMealLogForm({
  meal,
  date,
  onSave,
  ...common
}: Common & {
  meal: SavedMeal;
  date: string;
  onSave: (input: MealLog) => void;
}) {
  const [day, setDay] = useState(date);
  const [group, setGroup] = useState("");
  const [ids] = useState(() => meal.items.map(() => crypto.randomUUID()));
  return (
    <Modal title="Log saved meal" {...common}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            savedMeal: meal,
            date: day,
            meal: group ? (group as Meal) : null,
            entryIds: ids,
            timezone: timezone(),
          });
        }}
      >
        <fieldset disabled={common.busy}>
          <h3>
            {meal.name} · v{meal.version}
          </h3>
          <ul>
            {meal.items.map((v, i) => (
              <li key={i}>
                {v.name} · {formatKcal(v.kcal)} kcal · {v.meal}
              </li>
            ))}
          </ul>
          <label>
            Saved meal date
            <input
              type="date"
              required
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <label>
            Meal grouping
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Keep original groups</option>
              {meals.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <p className="muted">
            All items are saved together as independent diary entries.
          </p>
        </fieldset>
        {common.error && (
          <p className="error" role="alert">
            {common.error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" disabled={common.busy} onClick={common.onClose}>
            Cancel
          </button>
          <button className="primary" disabled={common.busy}>
            Save meal to diary
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function RecipeHistory({
  id,
  onClose,
  busy,
}: {
  id: string;
  onClose: () => void;
  busy: boolean;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let canceled = false;
    storage
      .recipeHistory(id)
      .then((r) => {
        if (!canceled) setRecipes(r);
      })
      .catch((e) => {
        if (!canceled) setError(String(e));
      });
    return () => {
      canceled = true;
    };
  }, [id]);
  return (
    <Modal title="Recipe version history" busy={busy} onClose={onClose}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {recipes.map((r) => (
        <section className="ingredient-row" key={r.version}>
          <h3>
            {r.name} · v{r.version}
          </h3>
          <p>
            {r.servings ? `${r.servings} servings` : "No serving count"} ·{" "}
            {r.finishedYieldG
              ? `${r.finishedYieldG} g measured yield`
              : "No measured yield"}
          </p>
          <ul>
            {r.ingredients.map((p, i) => (
              <li key={i}>
                {p.food.name} · v{p.food.version} · {p.quantity}{" "}
                {p.unit.startsWith("portion:")
                  ? p.food.portions[Number(p.unit.slice(8))]?.label
                  : p.unit}{" "}
                · {p.food.state}
              </li>
            ))}
          </ul>
          {r.instructions && <p className="instructions">{r.instructions}</p>}
        </section>
      ))}
    </Modal>
  );
}
export function RecipesPanel({
  library,
  date,
  disabled,
  onCreate,
  onEdit,
  onLog,
  onHistory,
  onMealCreate,
  onMealEdit,
  onMealLog,
}: {
  library: RecipeLibrary;
  date: string;
  disabled: boolean;
  onCreate: () => void;
  onEdit: (r: Recipe) => void;
  onLog: (r: Recipe) => void;
  onHistory: (r: Recipe) => void;
  onMealCreate: () => void;
  onMealEdit: (m: SavedMeal) => void;
  onMealLog: (m: SavedMeal) => void;
}) {
  return (
    <>
      <section aria-label="Recipes">
        <div className="section-toolbar">
          <h2>Your recipes</h2>
          <button className="primary" disabled={disabled} onClick={onCreate}>
            Create recipe
          </button>
        </div>
        <p className="muted">
          Log portions to {date}. Each saved edit creates a new version.
        </p>
        {!library.recipes.length && (
          <p className="empty-note">
            Create a recipe from local or custom foods, then log servings or
            measured portions.
          </p>
        )}
        {library.recipes.map((r) => (
          <div className="library-row" key={r.id}>
            <div>
              <h3>{r.name}</h3>
              <p className="source-note">
                v{r.version} ·{" "}
                {r.servings ? `${r.servings} servings` : "No serving count"} ·{" "}
                {r.finishedYieldG
                  ? `${r.finishedYieldG} g finished weight`
                  : "No measured yield"}
              </p>
            </div>
            <button
              aria-label={`Log recipe ${r.name}`}
              disabled={disabled}
              onClick={() => onLog(r)}
            >
              Log portion
            </button>
            <button
              aria-label={`Edit recipe ${r.name}`}
              disabled={disabled}
              onClick={() => onEdit(r)}
            >
              Edit
            </button>
            <button
              aria-label={`History of ${r.name}`}
              disabled={disabled}
              onClick={() => onHistory(r)}
            >
              History
            </button>
          </div>
        ))}
      </section>
      <section className="saved-meals" aria-label="Saved meals">
        <div className="section-toolbar">
          <h2>Saved meals</h2>
          <button disabled={disabled} onClick={onMealCreate}>
            Create saved meal
          </button>
        </div>
        <p className="muted">
          Choose current diary entries to save a repeatable meal, including
          recipe portions.
        </p>
        {!library.savedMeals.length && (
          <p className="empty-note">
            Log a meal first, then save its entries here.
          </p>
        )}
        {library.savedMeals.map((m) => (
          <div className="library-row" key={m.id}>
            <div>
              <h3>{m.name}</h3>
              <p className="source-note">
                v{m.version} · {m.items.length}{" "}
                {m.items.length === 1 ? "item" : "items"} ·{" "}
                {formatKcal(m.items.reduce((sum, i) => sum + i.kcal, 0))} kcal
              </p>
            </div>
            <button
              aria-label={`Log saved meal ${m.name}`}
              disabled={disabled}
              onClick={() => onMealLog(m)}
            >
              Log meal
            </button>
            <button
              aria-label={`Edit saved meal ${m.name}`}
              disabled={disabled}
              onClick={() => onMealEdit(m)}
            >
              Edit
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
