-- Sync KV store for start.lqh2011.com — run once in the Neon SQL editor:
--   psql "$DATABASE_URL" -f schema.sql
CREATE TABLE IF NOT EXISTS kv (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at BIGINT NOT NULL
);
