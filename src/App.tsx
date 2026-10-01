import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  storage,
  meals,
  localDate,
  shiftDate,
  formatKcal,
  type Day,
  type Entry,
  type EntryInput,
  type Meal,
  type Settings,
  type Library,
  type Week,
  type Food,
  type Goal,
  macroLabel,
  repeatInput,
  foodInput,
  type Metric,
  type MetricHistory,
  type RecipeLibrary,
  type Recipe,
  type SavedMeal,
  formatMetric,
} from "./storage";
import { MetricForm, MetricsPanel } from "./MetricsUI";
import {
  RecipesPanel,
  RecipeForm,
  RecipeLogForm,
  SavedMealForm,
  SavedMealLogForm,
  RecipeHistory,
} from "./RecipesUI";
import { Modal } from "./Modal";
import { DataSettings } from "./DataUI";
import { AISettings, DescriptionForm } from "./AIUI";
import { ai } from "./ai";
import {
  FoodForm,
  CustomFoodForm,
  GoalForm,
  WeeklySummary,
} from "./NutritionUI";

type Page = "Today" | "Recipes" | "Progress";
export type Composer = { id: string; date: string; meal: Meal; entry?: Entry };

export function App() {
  const [page, setPage] = useState<Page>("Today");
  const [date, setDate] = useState(localDate);
  const [day, setDay] = useState<Day | null>(null);
  const [library, setLibrary] = useState<Library>({ foods: [], recent: [] });
  const [week, setWeek] = useState<Week | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recipeLibrary, setRecipeLibrary] = useState<RecipeLibrary>({
    recipes: [],
    savedMeals: [],
  });
  const [recipeEditor, setRecipeEditor] = useState<Recipe | null | undefined>(
    undefined,
  );
  const [recipeLog, setRecipeLog] = useState<{
    recipe: Recipe;
    entry?: Entry;
  } | null>(null);
  const [recipeHistory, setRecipeHistory] = useState<string | null>(null);
  const [mealEditor, setMealEditor] = useState<SavedMeal | null | undefined>(
    undefined,
  );
  const [mealLog, setMealLog] = useState<SavedMeal | null>(null);
  const [metricEditor, setMetricEditor] = useState<{
    kind: string;
    entry?: Metric;
  } | null>(null);
  const [metricToken, setMetricToken] = useState(0);
  const [water, setWater] = useState<MetricHistory | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [customFood, setCustomFood] = useState<Food | null | undefined>(
    undefined,
  );
  const [today, setToday] = useState(localDate);
  const [settings, setSettings] = useState<Settings>({ theme: "system" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [description, setDescription] = useState<{
    photo: boolean;
    date: string;
    meal: Meal;
  } | null>(null);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<Entry | null>(null);
  const mutating = useRef(false);
  const request = useRef(0);
  const native = isTauri();

  const refresh = useCallback(async () => {
    const token = ++request.current;
    setLoading(true);
    try {
      const [result, library, week, goals, recipes, water] = await Promise.all([
        storage.day(date),
        storage.library(),
        storage.week(date),
        storage.goals(),
        storage.recipeLibrary(),
        storage.metricHistory(date, 7, "water", "Water"),
      ]);
      if (token === request.current) {
        setDay(result);
        setLibrary(library);
        setWeek(week);
        setGoals(goals);
        setRecipeLibrary(recipes);
        setWater(water);
      }
    } catch (failure) {
      if (token === request.current) setError(String(failure));
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    const check = () => {
      const current = localDate();
      if (current !== today) {
        setToday(current);
        setDate((selected) => (selected === today ? current : selected));
      }
    };
    const timer = window.setInterval(check, 15000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [today]);

  useEffect(() => {
    if (!native) {
      setLoading(false);
      return;
    }
    setDay(null);
    setError(null);
    void refresh();
    return () => {
      request.current += 1;
    };
  }, [refresh, native]);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    storage
      .settings()
      .then((result) => {
        if (!cancelled) setSettings(result);
      })
      .catch((failure) => {
        if (!cancelled) setError(String(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [native]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  async function mutate(action: () => Promise<void>) {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(String(failure));
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  function addFood(meal: Meal = "Lunch") {
    setError(null);
    setComposer({ id: crypto.randomUUID(), date, meal });
  }

  function edit(entry: Entry) {
    setError(null);
    if (entry.recipePortion) {
      setRecipeLog({ recipe: entry.recipePortion.recipe, entry });
      return;
    }
    setComposer({ id: entry.id, date: entry.date, meal: entry.meal, entry });
  }

  function save(input: EntryInput) {
    void mutate(async () => {
      await storage.save(input);
      setComposer(null);
      setRecipeLog(null);
      setNotice(
        `Saved ${input.name.trim()}${input.date !== date ? ` to ${input.date}` : ""}.`,
      );
      await refresh();
    });
  }

  function remove(entry: Entry) {
    void mutate(async () => {
      const deleted = await storage.remove(entry);
      setUndo(deleted);
      setNotice(`Deleted ${entry.name}.`);
      await refresh();
    });
  }

  function restore() {
    if (!undo) return;
    const deleted = undo;
    void mutate(async () => {
      await storage.restore(deleted);
      setUndo(null);
      setNotice(
        `Restored ${deleted.name}${deleted.date !== date ? ` to ${deleted.date}` : ""}.`,
      );
      await refresh();
    });
  }

  const disabled = busy || loading || !native || !day;
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to diary
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="#main"
          aria-label="CalPal home"
          onClick={() => setPage("Today")}
        >
          <img src="/calpal.svg" alt="" />
          CalPal
        </a>
        <nav aria-label="Main navigation">
          {(["Today", "Recipes", "Progress"] as const).map((value) => (
            <button
              key={value}
              aria-current={page === value ? "page" : undefined}
              className={page === value ? "nav-active" : ""}
              onClick={() => setPage(value)}
            >
              {value}
            </button>
          ))}
        </nav>
        <button
          className="settings-button"
          onClick={() => {
            setError(null);
            setSettingsOpen(true);
          }}
          disabled={!native}
        >
          Settings
        </button>
      </header>

      <main id="main" tabIndex={-1}>
        {!native && (
          <div className="error" role="alert">
            Open CalPal from the installed Windows app to use the diary. Browser
            previews do not store personal records.
          </div>
        )}
        {error &&
          !composer &&
          !description &&
          !settingsOpen &&
          !goalOpen &&
          customFood === undefined &&
          !metricEditor &&
          recipeEditor === undefined &&
          !recipeLog &&
          mealEditor === undefined &&
          !mealLog && (
            <div className="error" role="alert">
              {error}{" "}
              <button
                onClick={() => {
                  setError(null);
                  void refresh();
                }}
                disabled={busy}
              >
                Retry loading
              </button>
            </div>
          )}
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR DAILY DIARY</p>
            <h1>
              {page === "Today"
                ? date === today
                  ? "Today"
                  : "Food diary"
                : page}
            </h1>
          </div>
          <button
            className="primary"
            onClick={() => addFood()}
            disabled={disabled}
          >
            ＋ Add food
          </button>
        </div>

        {page === "Today" ? (
          <>
            <div className="date-toolbar">
              <div className="date-controls">
                <button
                  className="icon-button"
                  aria-label="Previous day"
                  disabled={busy}
                  onClick={() => setDate(shiftDate(date, -1))}
                >
                  ‹
                </button>
                <label className="date-input">
                  <span className="sr-only">Diary date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => {
                      if (event.target.value) setDate(event.target.value);
                    }}
                    disabled={busy}
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label="Next day"
                  disabled={busy}
                  onClick={() => setDate(shiftDate(date, 1))}
                >
                  ›
                </button>
              </div>
              <button
                onClick={() => setDate(localDate())}
                disabled={busy || date === localDate()}
              >
                Today
              </button>
            </div>
            <section className="calorie-summary" aria-label="Daily calories">
              <div>
                <p className="muted">Calories logged</p>
                <p className="calorie-value" aria-live="polite">
                  <span data-testid="daily-total">
                    {day ? formatKcal(day.totalKcal) : "—"}
                  </span>
                  <span className="unit">kcal</span>
                </p>
              </div>
              <div className="summary-note">
                <p>{dateLabel}</p>
                <p className="muted">
                  {day
                    ? `${day.entries.length} ${day.entries.length === 1 ? "entry" : "entries"}`
                    : loading
                      ? "Loading diary…"
                      : "Diary unavailable"}
                </p>
              </div>
            </section>
            <section
              className="nutrition-summary"
              aria-label="Nutrition and target"
            >
              <div className="target-line">
                <div>
                  <p className="muted">Daily target</p>
                  <p data-testid="daily-target">
                    {day?.target
                      ? `${formatKcal(day.target.kcal)} kcal${day.target.estimate ? " · estimate" : ""}`
                      : "Not set"}
                  </p>
                </div>
                <div>
                  <p className="muted">
                    {day?.target && day.totalKcal > day.target.kcal
                      ? "Over target"
                      : "Remaining"}
                  </p>
                  <p>
                    {day?.target
                      ? `${formatKcal(Math.abs(day.target.kcal - day.totalKcal))} kcal`
                      : "—"}
                  </p>
                </div>
                <button
                  disabled={disabled}
                  onClick={() => {
                    setError(null);
                    setGoalOpen(true);
                  }}
                >
                  Set target
                </button>
              </div>
              {day?.target && (
                <progress
                  className="target-progress"
                  aria-label="Calories toward daily target"
                  max={day.target.kcal}
                  value={Math.min(day.totalKcal, day.target.kcal)}
                />
              )}
              <div className="macro-summary">
                {day &&
                  (["protein", "carbohydrate", "fat"] as const).map((key) => (
                    <div key={key}>
                      <span className="muted">
                        {key === "carbohydrate"
                          ? "Carbohydrate"
                          : key === "protein"
                            ? "Protein"
                            : "Fat"}
                      </span>
                      <p>{macroLabel(day[key])}</p>
                    </div>
                  ))}
              </div>
              <div className="completion-line">
                <p>
                  {day?.complete ? "Diary complete" : "Diary incomplete"}
                  <span className="muted">
                    Changes to entries reopen the day.
                  </span>
                </p>
                <button
                  disabled={disabled}
                  aria-pressed={day?.complete ?? false}
                  onClick={() =>
                    void mutate(async () => {
                      await storage.complete(date, !day?.complete);
                      await refresh();
                    })
                  }
                >
                  {day?.complete ? "Reopen day" : "Mark day complete"}
                </button>
              </div>
            </section>
            <section
              className="water-shortcuts"
              aria-label="Water and measurements"
            >
              <div>
                <h2>Water recorded</h2>
                <p>
                  {water?.points.at(-1)?.value === null || !water
                    ? "Nothing recorded"
                    : `${formatMetric(water.points.at(-1)!.value!)} ml recorded`}
                </p>
              </div>
              <button
                disabled={disabled}
                onClick={() => {
                  setError(null);
                  setMetricEditor({ kind: "water" });
                }}
              >
                Log water
              </button>
              <button
                disabled={disabled}
                onClick={() => {
                  setError(null);
                  setMetricEditor({ kind: "weight" });
                }}
              >
                Log weight
              </button>
            </section>
            <section className="repeat-section" aria-label="Repeat foods">
              <h2>Log again</h2>
              <p className="muted">
                One click logs the saved portion and meal to {date}.
              </p>
              <div className="repeat-foods">
                {library.recent.map((entry) => (
                  <button
                    key={entry.id}
                    disabled={disabled}
                    aria-label={`Add recent ${entry.name}`}
                    onClick={() => save(repeatInput(entry, date))}
                  >
                    {entry.name}
                    <span>
                      {formatKcal(entry.kcal)} kcal · {entry.meal}
                    </span>
                  </button>
                ))}
              </div>
              {!library.recent.length && (
                <p className="muted">Your recent entries will appear here.</p>
              )}
              {library.foods.some((f) => f.favorite) && (
                <>
                  <h3>Favorites</h3>
                  <p className="muted">
                    Adds one first listed portion (or the nutrition basis), to
                    Lunch. Edit any portion in the diary.
                  </p>
                  <div className="repeat-foods">
                    {library.foods
                      .filter((f) => f.favorite)
                      .map((food) => (
                        <button
                          key={food.id}
                          aria-label={`Add favorite ${food.name}`}
                          disabled={disabled}
                          onClick={() => save(foodInput(food, date))}
                        >
                          {food.name}
                          <span>
                            {food.portions[0]?.label ??
                              `${food.basisQuantity} ${food.basisUnit}`}
                          </span>
                        </button>
                      ))}
                  </div>
                </>
              )}
              <details>
                <summary>Food library ({library.foods.length})</summary>
                <button
                  disabled={disabled}
                  onClick={() => {
                    setError(null);
                    setCustomFood(null);
                  }}
                >
                  Create custom food
                </button>
                <div className="library-list">
                  {library.foods.map((food) => (
                    <div className="library-row" key={food.id}>
                      <div>
                        <p>{food.name}</p>
                        <p className="source-note">
                          {food.state} · {food.source} · v{food.version}
                        </p>
                      </div>
                      <button
                        aria-label={`${food.favorite ? "Unfavorite" : "Favorite"} ${food.name}`}
                        aria-pressed={food.favorite}
                        disabled={disabled}
                        onClick={() =>
                          void mutate(async () => {
                            await storage.favorite(food);
                            await refresh();
                          })
                        }
                      >
                        {food.favorite ? "★ Saved" : "☆ Favorite"}
                      </button>
                      {food.source === "Custom label/manual" && (
                        <button
                          aria-label={`Edit custom ${food.name}`}
                          disabled={disabled}
                          onClick={() => {
                            setError(null);
                            setCustomFood(food);
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </section>
            <div className="diary" aria-busy={loading}>
              {meals.map((meal) => {
                const entries =
                  day?.entries.filter((entry) => entry.meal === meal) ?? [];
                const total = entries.reduce(
                  (sum, entry) => sum + entry.kcal,
                  0,
                );
                return (
                  <section
                    className="meal-section"
                    key={meal}
                    aria-label={meal}
                  >
                    <div className="meal-heading">
                      <h2>{meal}</h2>
                      <span className="meal-total">
                        {formatKcal(total)} <span className="muted">kcal</span>
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`Add food to ${meal}`}
                        disabled={disabled}
                        onClick={() => addFood(meal)}
                      >
                        ＋
                      </button>
                    </div>
                    {entries.length ? (
                      entries.map((entry) => (
                        <div className="entry" key={entry.id}>
                          <div>
                            <p className="entry-name">{entry.name}</p>
                            <p className="entry-source">
                              {entry.foodPortion
                                ? `${entry.foodPortion.quantity} ${entry.foodPortion.unit.startsWith("portion:") ? entry.foodPortion.food.portions[Number(entry.foodPortion.unit.slice(8))]?.label : entry.foodPortion.unit} · ${entry.foodPortion.food.state} · ${entry.foodPortion.food.source} · v${entry.foodPortion.food.version}`
                                : entry.recipePortion
                                  ? `${entry.recipePortion.quantity} ${entry.recipePortion.unit} · ${entry.recipePortion.recipe.name} · recipe v${entry.recipePortion.recipe.version}`
                                  : entry.ai
                                    ? `AI-only reviewed estimate · ${entry.ai.quantity} ${entry.ai.unit}`
                                    : "Manual entry"}
                              {entry.ai && (
                                <span> · AI draft: {entry.ai.model}</span>
                              )}
                              {entry.energyType?.startsWith("derived")
                                ? " · energy derived (4/4/9)"
                                : ""}
                            </p>
                            {entry.ai && (
                              <details className="entry-assumptions">
                                <summary>Estimate assumptions</summary>
                                <p>
                                  {entry.ai.originalName} · original portion:{" "}
                                  {entry.ai.originalQuantity ?? "unspecified"}{" "}
                                  {entry.ai.originalUnit?.startsWith("portion:")
                                    ? "named food portion"
                                    : (entry.ai.originalUnit ?? "")}
                                </p>
                                {entry.ai.assumptions.map((a, i) => (
                                  <p key={i}>{a}</p>
                                ))}
                                {entry.ai.questions.map((q, i) => (
                                  <p key={i}>{q}</p>
                                ))}
                                <p className="source-note">
                                  Reviewed before saving ·{" "}
                                  {entry.ai.promptVersion} · schema{" "}
                                  {entry.ai.schemaVersion}
                                </p>
                              </details>
                            )}
                          </div>
                          <span className="entry-kcal">
                            {formatKcal(entry.kcal)}{" "}
                            <span className="sr-only">kcal</span>
                          </span>
                          <div className="entry-actions">
                            <button
                              aria-label={`Edit ${entry.name}`}
                              disabled={busy || loading}
                              onClick={() => edit(entry)}
                            >
                              Edit
                            </button>
                            <button
                              className="delete-button"
                              aria-label={`Delete ${entry.name}`}
                              disabled={busy || loading}
                              onClick={() => remove(entry)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="meal-empty">
                        {loading ? "Loading…" : "Nothing logged yet."}
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        ) : page === "Progress" ? (
          <>
            <WeeklySummary week={week} />
            {native && (
              <MetricsPanel
                date={date}
                onDate={setDate}
                token={metricToken}
                disabled={disabled}
                onError={setError}
                onAdd={(kind) => {
                  setError(null);
                  setMetricEditor({ kind });
                }}
                onEdit={(entry) => {
                  setError(null);
                  setMetricEditor({ kind: entry.kind, entry });
                }}
                onDelete={(entry) =>
                  void mutate(async () => {
                    await storage.deleteMetric(entry);
                    setMetricToken((v) => v + 1);
                    setNotice(`Deleted ${entry.label} record.`);
                    await refresh();
                  })
                }
              />
            )}
            <button onClick={() => setPage("Today")}>Back to diary</button>
          </>
        ) : (
          <>
            <RecipesPanel
              library={recipeLibrary}
              date={date}
              disabled={disabled}
              onCreate={() => {
                setError(null);
                setRecipeEditor(null);
              }}
              onEdit={(r) => {
                setError(null);
                setRecipeEditor(r);
              }}
              onLog={(recipe) => {
                setError(null);
                setRecipeLog({ recipe });
              }}
              onHistory={(r) => setRecipeHistory(r.id)}
              onMealCreate={() => {
                setError(null);
                setMealEditor(null);
              }}
              onMealEdit={(m) => {
                setError(null);
                setMealEditor(m);
              }}
              onMealLog={(m) => {
                setError(null);
                setMealLog(m);
              }}
            />
            <button onClick={() => setPage("Today")}>Back to diary</button>
          </>
        )}
        <footer className="app-footer">
          <span>
            <span className="status-dot" aria-hidden="true" />
            Stored on this device
          </span>
          <span>No account needed</span>
        </footer>
      </main>

      <div className="notification" role="status" aria-live="polite">
        {notice && (
          <>
            <span>{notice}</span>
            {undo && (
              <button onClick={restore} disabled={busy}>
                Undo delete
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => {
                setNotice("");
                setUndo(null);
              }}
              disabled={busy}
            >
              ×
            </button>
          </>
        )}
      </div>

      {composer && (
        <FoodForm
          key={composer.id}
          composer={composer}
          library={library}
          onSave={save}
          onDescribe={(photo) => {
            setDescription({ date: composer.date, meal: composer.meal, photo });
            setComposer(null);
            setError(null);
          }}
          onClose={() => {
            setComposer(null);
            setError(null);
          }}
          busy={busy}
          error={error}
        />
      )}
      {description && (
        <DescriptionForm
          photoMode={description.photo}
          date={description.date}
          meal={description.meal}
          foods={library.foods}
          busy={busy}
          error={error}
          onClose={() => {
            setDescription(null);
            setError(null);
          }}
          onSave={(entries, photoId, retainPhoto) =>
            void mutate(async () => {
              await ai.save(entries, photoId, retainPhoto);
              setDescription(null);
              setNotice(`Saved ${entries.length} reviewed items.`);
              await refresh();
            })
          }
        />
      )}
      {aiSettingsOpen && (
        <AISettings onClose={() => setAiSettingsOpen(false)} />
      )}
      {customFood !== undefined && (
        <CustomFoodForm
          food={customFood}
          busy={busy}
          error={error}
          onClose={() => {
            setCustomFood(undefined);
            setError(null);
          }}
          onSave={(food) =>
            void mutate(async () => {
              await storage.saveFood(food);
              setCustomFood(undefined);
              setNotice(`Saved custom food ${food.name}.`);
              await refresh();
            })
          }
        />
      )}
      {goalOpen && (
        <GoalForm
          goals={goals}
          busy={busy}
          error={error}
          onClose={() => {
            setGoalOpen(false);
            setError(null);
          }}
          onSave={(goal) =>
            void mutate(async () => {
              await storage.saveGoal(goal);
              setGoalOpen(false);
              setNotice(`Target applied from ${goal.effectiveDate}.`);
              await refresh();
            })
          }
        />
      )}
      {metricEditor && (
        <MetricForm
          kind={metricEditor.kind}
          entry={metricEditor.entry}
          date={date}
          busy={busy}
          error={error}
          onClose={() => {
            setMetricEditor(null);
            setError(null);
          }}
          onSave={(m) =>
            void mutate(async () => {
              await storage.saveMetric(m);
              setMetricEditor(null);
              setMetricToken((v) => v + 1);
              setNotice(`Saved ${m.label} measurement.`);
              await refresh();
            })
          }
        />
      )}
      {recipeEditor !== undefined && (
        <RecipeForm
          recipe={recipeEditor}
          foods={library.foods}
          busy={busy}
          error={error}
          onClose={() => {
            setRecipeEditor(undefined);
            setError(null);
          }}
          onSave={(r) =>
            void mutate(async () => {
              await storage.saveRecipe(r);
              setRecipeEditor(undefined);
              setNotice(`Saved recipe ${r.name}.`);
              await refresh();
            })
          }
        />
      )}
      {recipeLog && (
        <RecipeLogForm
          recipe={recipeLog.recipe}
          entry={recipeLog.entry}
          date={date}
          busy={busy}
          error={error}
          onClose={() => {
            setRecipeLog(null);
            setError(null);
          }}
          onSave={save}
        />
      )}
      {recipeHistory && (
        <RecipeHistory
          id={recipeHistory}
          busy={busy}
          onClose={() => setRecipeHistory(null)}
        />
      )}
      {mealEditor !== undefined && (
        <SavedMealForm
          meal={mealEditor}
          entries={day?.entries ?? []}
          date={date}
          busy={busy}
          error={error}
          onClose={() => {
            setMealEditor(undefined);
            setError(null);
          }}
          onSave={(m) =>
            void mutate(async () => {
              await storage.saveMeal(m);
              setMealEditor(undefined);
              setNotice(`Saved meal ${m.name}.`);
              await refresh();
            })
          }
        />
      )}
      {mealLog && (
        <SavedMealLogForm
          meal={mealLog}
          date={date}
          busy={busy}
          error={error}
          onClose={() => {
            setMealLog(null);
            setError(null);
          }}
          onSave={(input) =>
            void mutate(async () => {
              await storage.logMeal(input);
              setMealLog(null);
              setNotice(`Logged ${input.savedMeal.name}.`);
              await refresh();
            })
          }
        />
      )}
      {settingsOpen && (
        <Modal
          title="Settings"
          onClose={() => {
            setSettingsOpen(false);
            setError(null);
          }}
          busy={busy}
          active={!aiSettingsOpen && !dataOpen}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSettingsOpen(false);
            }}
          >
            <label>
              Appearance
              <select
                value={settings.theme}
                disabled={busy}
                onChange={(event) => {
                  const theme = event.target.value as Settings["theme"];
                  void mutate(async () => {
                    setSettings(await storage.saveSettings({ theme }));
                  });
                }}
              >
                <option value="system">Use system setting</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <div className="storage-note">
              <h3>Your diary stays here.</h3>
              <p>
                Records are saved locally and work offline. Closing, restarting,
                or upgrading the app preserves them.
              </p>
              <p>No AI connection or account is needed for calorie entries.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAiSettingsOpen(true)}
              >
                AI settings
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDataOpen(true)}
              >
                Export & backup
              </button>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                Done
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dataOpen && (
        <DataSettings
          onClose={() => setDataOpen(false)}
          onRestored={async () => {
            setUndo(null);
            setNotice("");
            setError(null);
            setSettings(await storage.settings());
            setMetricToken((v) => v + 1);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
