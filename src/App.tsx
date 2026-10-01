import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
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
} from "./storage";

type Page = "Today" | "Recipes" | "Progress";
type Composer = { id: string; date: string; meal: Meal; entry?: Entry };

function Modal({
  title,
  children,
  onClose,
  busy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    dialog
      .querySelector<HTMLElement>("[data-autofocus], input, select, textarea")
      ?.focus();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}

function FoodForm({
  composer,
  onSave,
  onClose,
  busy,
  error,
}: {
  composer: Composer;
  onSave: (input: EntryInput) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(composer.entry?.name ?? "");
  const [kcal, setKcal] = useState(
    composer.entry ? String(composer.entry.kcal) : "",
  );
  const [meal, setMeal] = useState<Meal>(composer.meal);
  const [date, setDate] = useState(composer.date);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      id: composer.id,
      date,
      meal,
      name,
      kcal: Number(kcal),
      revision: composer.entry?.revision ?? null,
    });
  }
  return (
    <Modal
      title={composer.entry ? "Edit food" : "Add food"}
      onClose={onClose}
      busy={busy}
    >
      <p className="form-intro">A name and calories are all you need.</p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Food name
            <input
              data-autofocus=""
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Lunch bowl"
              required
              maxLength={120}
            />
          </label>
          <label>
            Calories (kcal)
            <input
              name="kcal"
              type="number"
              inputMode="decimal"
              value={kcal}
              onChange={(event) => setKcal(event.target.value)}
              min="0"
              max="100000"
              step="any"
              placeholder="0"
              required
            />
          </label>
          <div className="form-row">
            <label>
              Meal
              <select
                value={meal}
                onChange={(event) => setMeal(event.target.value as Meal)}
              >
                {meals.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save to diary"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function App() {
  const [page, setPage] = useState<Page>("Today");
  const [date, setDate] = useState(localDate);
  const [day, setDay] = useState<Day | null>(null);
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
      const result = await storage.day(date);
      if (token === request.current) setDay(result);
    } catch (failure) {
      if (token === request.current) setError(String(failure));
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, [date]);

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
        {error && !composer && !settingsOpen && (
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
                ? date === localDate()
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
                            <p className="entry-source">Manual entry</p>
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
          onSave={save}
          onClose={() => {
            setComposer(null);
            setError(null);
          }}
          busy={busy}
          error={error}
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
