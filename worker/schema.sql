CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  token_hash TEXT UNIQUE,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS docs (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS subs (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS sent (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  k TEXT NOT NULL,
  PRIMARY KEY (user_id, day, k)
);
