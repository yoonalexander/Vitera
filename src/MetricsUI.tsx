import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import {
  storage,
  timezone,
  metricUnits,
  displayMetric,
  formatMetric,
  type Metric,
  type MetricHistory,
  type MetricPoint,
} from "./storage";

const kinds: Record<string, string> = {
  weight: "Weight",
  measurement: "Body measurement",
  bodyFat: "Body fat",
  water: "Water",
};
export function MetricForm({
  kind,
  date,
  entry,
  busy,
  error,
  onClose,
  onSave,
}: {
  kind: string;
  date: string;
  entry?: Metric;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (m: Metric) => void;
}) {
  const [id] = useState(entry?.id ?? crypto.randomUUID());
  const [type, setType] = useState(entry?.kind ?? kind);
  const [label, setLabel] = useState(entry?.label ?? "Waist");
  const [value, setValue] = useState(entry ? String(entry.value) : "");
  const [unit, setUnit] = useState(entry?.unit ?? metricUnits[kind][0]);
  const [day, setDay] = useState(entry?.date ?? date);
  const initialTime = new Date(entry?.recordedAt ?? Date.now())
    .toTimeString()
    .slice(0, 8);
  const [time, setTime] = useState(initialTime);
  const [timeChanged, setTimeChanged] = useState(false);
  const [note, setNote] = useState(entry?.note ?? "");
  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      id,
      date: day,
      recordedAt:
        entry && !timeChanged
          ? entry.recordedAt
          : new Date(`${day}T${time}`).toISOString(),
      timezone: entry && !timeChanged ? entry.timezone : timezone(),
      kind: type,
      label: type === "measurement" ? label : kinds[type],
      value: Number(value),
      unit,
      canonicalValue: 0,
      note,
      revision: entry?.revision ?? 0,
    });
  }
  return (
    <Modal
      title={entry ? "Edit measurement" : "Log measurement"}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Measurement type
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setUnit(metricUnits[e.target.value][0]);
              }}
            >
              {Object.entries(kinds).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {type === "measurement" && (
            <label>
              Measurement name
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                maxLength={120}
                placeholder="e.g. Waist or chest"
              />
            </label>
          )}
          <div className="form-row">
            <label>
              Measurement value
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                min="0.000001"
                step="any"
                required
              />
            </label>
            <label>
              Measurement unit
              <select
                value={unit}
                onChange={(e) => {
                  setValue(
                    value === ""
                      ? ""
                      : String(
                          displayMetric(
                            Number(value) / displayMetric(1, unit),
                            e.target.value,
                          ),
                        ),
                  );
                  setUnit(e.target.value);
                }}
              >
                {metricUnits[type].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Measurement date
              <input
                type="date"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setTimeChanged(true);
                }}
                required
              />
            </label>
            <label>
              Measurement time
              <input
                type="time"
                step="1"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  setTimeChanged(true);
                }}
                required
              />
            </label>
          </div>
          <label>
            Note, optional
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={2}
            />
          </label>
          <p className="muted">
            Multiple records per day are allowed. Water adds up; other trends
            use the last recorded measurement each day. Existing dates and times
            stay unchanged unless you edit them.
          </p>
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
          <button className="primary" disabled={busy}>
            Save measurement
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function chartGeometry(points: MetricPoint[], unit: string) {
  const values = points.flatMap((p) =>
    p.value === null ? [] : [displayMetric(p.value, unit)],
  );
  if (!values.length) return { dots: [], segments: [], min: 0, max: 0 };
  const min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || Math.max(max * 0.05, 1);
  const dots = points.flatMap((p, i) =>
    p.value === null
      ? []
      : [
          {
            date: p.date,
            index: i,
            value: displayMetric(p.value, unit),
            x: 36 + (i * 528) / Math.max(points.length - 1, 1),
            y: 154 - ((displayMetric(p.value, unit) - min) * 116) / range,
          },
        ],
  );
  const segments = dots
    .slice(1)
    .flatMap((d, i) =>
      d.index === dots[i].index + 1 ? [{ a: dots[i], b: d }] : [],
    );
  return { dots, segments, min, max };
}
function MetricChart({
  history,
  unit,
}: {
  history: MetricHistory;
  unit: string;
}) {
  const { dots, segments, min, max } = chartGeometry(history.points, unit);
  return (
    <figure className="metric-chart">
      <svg
        viewBox="0 0 600 190"
        role="img"
        aria-label={`Daily measurements in ${unit}. ${dots.length} of ${history.points.length} days recorded. Missing days have no points or connecting lines. Values are listed in the daily values table.`}
      >
        <line x1="36" x2="564" y1="154" y2="154" className="chart-axis" />
        {segments.map((s, i) => (
          <line
            key={i}
            x1={s.a.x}
            y1={s.a.y}
            x2={s.b.x}
            y2={s.b.y}
            className="chart-line"
          />
        ))}
        {dots.map((d) => (
          <circle
            key={d.date}
            data-date={d.date}
            data-value={d.value}
            cx={d.x}
            cy={d.y}
            r="4"
            className="chart-dot"
          >
            <title>
              {d.date}: {formatMetric(d.value)} {unit}
            </title>
          </circle>
        ))}
        <text x="36" y="18">
          {dots.length
            ? `${formatMetric(min)}–${formatMetric(max)} ${unit}`
            : "No records in this period"}
        </text>
        <text x="36" y="182">
          {history.points[0]?.date}
        </text>
        <text x="564" y="182" textAnchor="end">
          {history.points.at(-1)?.date}
        </text>
      </svg>
      <figcaption>
        Daily{" "}
        {history.canonicalUnit === "ml" ? "water total" : "last measurement"}.
        Gaps mean no record.
      </figcaption>
    </figure>
  );
}

export function MetricsPanel({
  date,
  onDate,
  token,
  disabled,
  onAdd,
  onEdit,
  onDelete,
  onError,
}: {
  date: string;
  onDate: (d: string) => void;
  token: number;
  disabled: boolean;
  onAdd: (kind: string) => void;
  onEdit: (entry: Metric) => void;
  onDelete: (entry: Metric) => void;
  onError: (error: string) => void;
}) {
  const [kind, setKind] = useState("weight");
  const [label, setLabel] = useState("Waist");
  const [days, setDays] = useState(30);
  const [unit, setUnit] = useState("kg");
  const [labels, setLabels] = useState<string[]>([]);
  const [history, setHistory] = useState<MetricHistory | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setHistory(null);
    Promise.all([
      storage.metricHistory(date, days, kind, label),
      storage.metricLabels(),
    ])
      .then(([h, l]) => {
        if (!canceled) {
          setHistory(h);
          setLabels(l);
        }
      })
      .catch((e) => {
        if (!canceled) onError(String(e));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [date, days, kind, label, token]);
  return (
    <section className="metrics-panel" aria-label="Measurement history">
      <div className="section-toolbar">
        <h2>Measurements & water</h2>
        <button
          className="primary"
          disabled={disabled}
          onClick={() => onAdd(kind)}
        >
          Log measurement
        </button>
      </div>
      <div className="metric-controls">
        <label>
          History type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setUnit(metricUnits[e.target.value][0]);
            }}
          >
            {Object.entries(kinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          History period
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90, 365].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <label>
          Display unit
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {metricUnits[kind].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          History ending date
          <input
            type="date"
            value={date}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value) onDate(e.target.value);
            }}
          />
        </label>
      </div>
      {kind === "measurement" && (
        <label>
          History measurement name
          <input
            list="measurement-labels"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <datalist id="measurement-labels">
            {labels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </datalist>
        </label>
      )}
      {loading ? (
        <p role="status">Loading measurements…</p>
      ) : (
        history && (
          <>
            <p className="metric-summary">
              {history.recordedDays}/{days} days recorded ·{" "}
              {history.entries.length} records
              {history.change !== null && kind !== "water"
                ? ` · change ${history.change > 0 ? "+" : ""}${formatMetric(displayMetric(history.change, unit))} ${unit}`
                : ""}
            </p>
            <p className="muted">
              {kind === "water"
                ? "Water totals sum recorded drinks. Missing days are unknown, not zero."
                : "Daily values use the last measurement by recorded time. Change compares the first and last recorded days; gaps remain unknown."}
            </p>
            <MetricChart history={history} unit={unit} />
            <details>
              <summary>Daily values and seven-day means</summary>
              <div className="table-scroll">
                <table>
                  <caption>
                    Daily history in {unit}; means use available days only.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Daily value</th>
                      <th scope="col">Records</th>
                      <th scope="col">7-day mean</th>
                      <th scope="col">Coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.points.map((p) => (
                      <tr key={p.date}>
                        <th scope="row">{p.date}</th>
                        <td>
                          {p.value === null
                            ? "—"
                            : formatMetric(displayMetric(p.value, unit))}
                        </td>
                        <td>{p.measurements}</td>
                        <td>
                          {p.mean === null
                            ? "—"
                            : formatMetric(displayMetric(p.mean, unit))}
                        </td>
                        <td>{p.meanSamples}/7 days</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <h3>Individual records</h3>
            {!history.entries.length && (
              <p className="muted">Log a measurement to start this history.</p>
            )}
            <div className="metric-records">
              {history.entries.map((m) => (
                <div className="library-row" key={m.id}>
                  <div>
                    <p>
                      {m.label}: {formatMetric(m.value)} {m.unit}
                    </p>
                    <p className="source-note">
                      {m.date} ·{" "}
                      {new Date(m.recordedAt).toLocaleTimeString(undefined, {
                        timeZone: m.timezone,
                      })}{" "}
                      · {m.timezone}
                      {m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  <button
                    aria-label={`Edit measurement ${m.id}`}
                    onClick={() => onEdit(m)}
                    disabled={disabled}
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Delete measurement ${m.id}`}
                    onClick={() => onDelete(m)}
                    disabled={disabled}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </>
        )
      )}
    </section>
  );
}
