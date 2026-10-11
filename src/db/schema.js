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

-- 白名单 IP 不受并发连接上限与带宽限速约束（ip 列同样可存 CIDR 段）
CREATE TABLE IF NOT EXISTS ip_whitelist (
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

-- 下载请求日志：code 为 444 表示「直接断开连接、未返回状态码」
CREATE TABLE IF NOT EXISTS access_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT NOT NULL,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  code        INTEGER NOT NULL,
  bytes_sent  INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  ua          TEXT NOT NULL DEFAULT '',
  referer     TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_logs_created ON access_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_access_logs_ip ON access_logs(ip);
CREATE INDEX IF NOT EXISTS idx_access_logs_code ON access_logs(code);

-- 管理操作审计：记录后台的每一次写操作（不含密码等敏感值）
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip         TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
`;
