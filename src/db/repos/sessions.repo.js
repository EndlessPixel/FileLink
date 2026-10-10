import { get, run } from '../index.js';

export function createSession(sessionId, createdAt, expiresAt) {
  run(
    'INSERT INTO admin_sessions (session_id, created_at, expires_at) VALUES (?, ?, ?)',
    sessionId,
    Math.trunc(createdAt),
    Math.trunc(expiresAt)
  );
}

/** 返回未过期会话，过期则返回 null */
export function getActiveSession(sessionId, now) {
  const row = get(
    'SELECT session_id, created_at, expires_at FROM admin_sessions WHERE session_id = ? AND expires_at > ?',
    sessionId,
    Math.trunc(now)
  );
  if (!row) return null;
  return {
    sessionId: row.session_id,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
  };
}

export function deleteSession(sessionId) {
  return run('DELETE FROM admin_sessions WHERE session_id = ?', sessionId).changes;
}

export function deleteExpiredSessions(now) {
  return run('DELETE FROM admin_sessions WHERE expires_at <= ?', Math.trunc(now)).changes;
}

export function countActiveSessions(now) {
  const row = get('SELECT COUNT(*) AS total FROM admin_sessions WHERE expires_at > ?', Math.trunc(now));
  return Number(row?.total ?? 0);
}
