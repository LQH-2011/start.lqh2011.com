-- Sync KV store for start.lqh2011.com — run once in the Neon SQL editor:
--   psql "$DATABASE_URL" -f schema.sql
CREATE TABLE IF NOT EXISTS kv (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at BIGINT NOT NULL
);

-- AI chat history for start.lqh2011.com (single-user, the logged-in owner).
-- A session groups one thread; a title is generated from the first user
-- message. Messages keep the thread order (user + assistant alternate, but a
-- deleted message can make two of the same role adjacent — that's fine).
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS chat_messages_session_idx
  ON chat_messages (session_id, created_at, id);
