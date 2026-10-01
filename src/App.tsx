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
} from "./storage";
import { Modal } from "./Modal";
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
  const [goalOpen, setGoalOpen] = useState(false);
  const [customFood, setCustomFood] = useState<Food | null | undefined>(
    undefined,
  );
  const [today, setToday] = useState(localDate);
  const [settings, setSettings] = useState<Settings>({ theme: "system" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composer, setComposer] = useState<Composer | null>(null);
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
      const [result, library, week, goals] = await Promise.all([
        storage.day(date),
        storage.library(),
        storage.week(date),
        storage.goals(),
      ]);
      if (token === request.current) {
        setDay(result);
        setLibrary(library);
        setWeek(week);
        setGoals(goals);
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
    setComposer({ id: entry.id, date: entry.date, meal: entry.meal, entry });
  }

  function save(input: EntryInput) {
    void mutate(async () => {
      await storage.save(input);
      setComposer(null);
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
          !settingsOpen &&
          !goalOpen &&
          customFood === undefined && (
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
                                : "Manual entry"}
                              {entry.energyType?.startsWith("derived")
                                ? " · energy derived (4/4/9)"
                                : ""}
                            </p>
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
            <p className="storage-note muted">
              Weight and body measurements are planned for milestone 3.
            </p>
            <button onClick={() => setPage("Today")}>Back to diary</button>
          </>
        ) : (
          <section className="future-feature">
            <div className="feature-symbol" aria-hidden="true">
              {page === "Recipes" ? "≋" : "↗"}
            </div>
            <h2>
              {page === "Recipes"
                ? "Your favorites, ready to repeat."
                : "A little progress, day by day."}
            </h2>
            <p>
              {page === "Recipes"
                ? "Recipe creation and reusable meals are planned for milestone 3. For now, log a meal and its calories in your diary."
                : "Weight and body-measurement tracking are planned for milestone 3. Your calorie diary is ready to use today."}
            </p>
            <button onClick={() => setPage("Today")}>Back to diary</button>
          </section>
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
          onClose={() => {
            setComposer(null);
            setError(null);
          }}
          busy={busy}
          error={error}
        />
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
      {settingsOpen && (
        <Modal
          title="Settings"
          onClose={() => {
            setSettingsOpen(false);
            setError(null);
          }}
          busy={busy}
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
    </div>
  );
}
