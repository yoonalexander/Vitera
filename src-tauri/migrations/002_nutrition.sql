ALTER TABLE diary_entries ADD COLUMN nutrition TEXT;
CREATE TABLE foods (id TEXT PRIMARY KEY, record TEXT NOT NULL);
CREATE TABLE goal_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    effective_date TEXT NOT NULL,
    record TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX goal_dates ON goal_versions (effective_date, id);
CREATE TABLE diary_days (
    diary_date TEXT PRIMARY KEY,
    target TEXT,
    complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1))
);
