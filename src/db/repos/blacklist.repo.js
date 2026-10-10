import { all, get, run } from '../index.js';

function toEntry(row) {
  if (!row) return null;
  return { ip: row.ip, reason: row.reason, addedAt: Number(row.added_at) };
}

export function addToBlacklist(ip, reason, addedAt) {
  run(
    `INSERT INTO ip_blacklist (ip, reason, added_at) VALUES (?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, added_at = excluded.added_at`,
    ip,
    reason ?? '',
    Math.trunc(addedAt)
  );
}

export function removeFromBlacklist(ip) {
  return run('DELETE FROM ip_blacklist WHERE ip = ?', ip).changes;
}

export function isBlacklisted(ip) {
  return Boolean(get('SELECT 1 AS hit FROM ip_blacklist WHERE ip = ?', ip));
}

export function listBlacklist() {
  return all('SELECT ip, reason, added_at FROM ip_blacklist ORDER BY added_at DESC').map(toEntry);
}

export function countBlacklist() {
  const row = get('SELECT COUNT(*) AS total FROM ip_blacklist');
  return Number(row?.total ?? 0);
}
