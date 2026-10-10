/**
 * 表结构定义。
 * links 表不设 expires_at / is_revoked（短码无有效期、无吊销概念），
 * 与 sha256 一对一，重新生成链接即替换短码。
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS files (
  sha256    TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  size      INTEGER NOT NULL,
  added_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
  code           TEXT PRIMARY KEY,
  sha256         TEXT NOT NULL UNIQUE REFERENCES files(sha256) ON DELETE CASCADE,
  created_at     INTEGER NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ip_blacklist (
  ip       TEXT PRIMARY KEY,
  reason   TEXT,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_failures (
  ip           TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  last_fail    INTEGER NOT NULL DEFAULT 0,
  banned_until INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_links_sha256 ON links(sha256);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);
`;
