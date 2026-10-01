-- Only explicitly retained, resized, metadata-free JPEGs enter durable storage.
CREATE TABLE photo_saves (
    request_id TEXT PRIMARY KEY REFERENCES ai_saves(request_id),
    photo_id TEXT NOT NULL,
    retained INTEGER NOT NULL CHECK(retained IN (0,1))
);
CREATE TABLE photo_attachments (
    request_id TEXT PRIMARY KEY REFERENCES photo_saves(request_id),
    jpeg BLOB NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL
);
