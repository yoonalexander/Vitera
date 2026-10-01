import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "./Modal";

interface Summary {
  createdAt: string;
  entries: number;
  deletedEntries: number;
  metrics: number;
  recipes: number;
  savedMeals: number;
  foods: number;
  goals: number;
  days: number;
  attachments: number;
}
interface Preview {
  token: string;
  incoming: Summary;
  current: Summary;
}

export function DataSettings({
  onClose,
  onRestored,
}: {
  onClose: () => void;
  onRestored: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [filename, setFilename] = useState("");
  const mutating = useRef(false);
  const focus = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (preview) focus.current?.focus();
  }, [preview]);
  useEffect(
    () => () => {
      void invoke("discard_backup").catch(() => {});
    },
    [],
  );
  async function run(action: () => Promise<void>) {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      setError(String(failure));
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  const exportFile = (kind: string) =>
    void run(async () => {
      const path = await invoke<string | null>("export_data", { kind });
      setNotice(
        path ? `Saved to ${path}` : "Save cancelled. No file was written.",
      );
    });
  async function choose(file: File) {
    setPreview(null);
    setConfirmed(false);
    setFilename(file.name);
    await invoke("discard_backup");
    if (file.size > 64 * 1024 * 1024)
      throw new Error(
        "Choose a CalPal backup no larger than 64 MiB. Current records are unchanged.",
      );
    const next = await invoke<Preview>("preview_backup", {
      data: await file.text(),
    });
    setPreview(next);
  }
  return (
    <Modal title="Export & backup" busy={busy} onClose={onClose}>
      <p className="muted">
        Keep a copy outside this device. Backups contain personal records and
        retained photos; store them privately. They are not encrypted.
        Credentials are excluded.
      </p>
      <section aria-label="Export data" className="data-section">
        <h3>Export your records</h3>
        <p>
          CSV includes all active records, original units and source details.
          Blank nutrients stay unknown. CSV cannot restore the app.
        </p>
        <div className="data-actions">
          <button
            type="button"
            data-autofocus
            disabled={busy}
            onClick={() => exportFile("diary")}
          >
            Export diary CSV
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => exportFile("metrics")}
          >
            Export metrics CSV
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => exportFile("backup")}
          >
            Save complete backup
          </button>
        </div>
      </section>
      <section aria-label="Restore data" className="data-section">
        <h3>Restore a backup</h3>
        <p>
          Restore replaces this installation’s records, targets, foods, history,
          appearance and retained photos. It does not merge. AI stays off until
          you enable it again; authentication must be set up separately.
        </p>
        <label>
          Choose CalPal backup
          <input
            type="file"
            accept=".calpal,application/json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void run(() => choose(file));
            }}
          />
        </label>
        {preview && (
          <div className="restore-preview">
            <h4 ref={focus} tabIndex={-1}>
              Backup ready to restore
            </h4>
            <p className="file-path">
              {filename} · created{" "}
              {new Date(preview.incoming.createdAt).toLocaleString()}
            </p>
            <dl className="backup-counts">
              {(
                [
                  ["Active diary entries", "entries"],
                  ["Deleted diary entries", "deletedEntries"],
                  ["Active measurements", "metrics"],
                  ["Recipe versions", "recipes"],
                  ["Saved meal versions", "savedMeals"],
                  ["Foods", "foods"],
                  ["Target versions", "goals"],
                  ["Diary days", "days"],
                  ["Retained photos", "attachments"],
                ] as const
              ).map(([label, key]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {preview.current[key]} here → {preview.incoming[key]} in
                    backup
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              A recovery backup of current records is saved in the app’s
              recovery folder before replacement. If that copy cannot be saved,
              restore stops.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I understand this replaces all current records.
            </label>
            <button
              className="primary"
              type="button"
              disabled={busy || !confirmed}
              onClick={() =>
                void run(async () => {
                  const recovery = await invoke<string>("restore_backup", {
                    token: preview.token,
                  });
                  setPreview(null);
                  setConfirmed(false);
                  // Report the successful commit even if refreshing the view fails.
                  setNotice(
                    `Restore complete. Previous records are backed up at ${recovery}`,
                  );
                  await onRestored();
                })
              }
            >
              Replace records from backup
            </button>
          </div>
        )}
      </section>
      {busy && (
        <p role="status">Working… Keep CalPal open until this finishes.</p>
      )}
      {notice && (
        <p className="file-path" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button disabled={busy} onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
