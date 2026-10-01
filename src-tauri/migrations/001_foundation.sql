CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT NOT NULL CHECK (theme IN ('system', 'light', 'dark'))
);
INSERT INTO settings (id, theme) VALUES (1, 'system');

CREATE TABLE diary_entries (
    id TEXT PRIMARY KEY,
    diary_date TEXT NOT NULL,
    meal TEXT NOT NULL CHECK (meal IN ('Breakfast', 'Lunch', 'Dinner', 'Snacks')),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    kcal REAL NOT NULL CHECK (kcal >= 0 AND kcal <= 100000),
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX diary_entries_date ON diary_entries (diary_date, deleted);
