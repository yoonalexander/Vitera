-- Configuration contains a credential reference only. Secrets live in the OS store.
CREATE TABLE ai_config (
  id INTEGER PRIMARY KEY CHECK(id=1),
  record TEXT NOT NULL,
  credential_ref TEXT NOT NULL
);
CREATE TABLE ai_saves (
  request_id TEXT PRIMARY KEY,
  reviewed_request TEXT NOT NULL
);
