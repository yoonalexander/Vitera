CREATE TABLE metric_entries (
    id TEXT PRIMARY KEY,
    diary_date TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    record TEXT NOT NULL,
    revision INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX metric_dates ON metric_entries (diary_date, recorded_at, deleted);
CREATE TABLE recipe_versions (
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (id, version)
);
CREATE TABLE saved_meal_versions (
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (id, version)
);
