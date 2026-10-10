import { get, run } from '../index.js';

export function getFailure(ip) {
  const row = get('SELECT ip, count, last_fail, banned_until FROM login_failures WHERE ip = ?', ip);
  if (!row) return null;
  return {
    ip: row.ip,
    count: Number(row.count),
    lastFail: Number(row.last_fail),
    bannedUntil: Number(row.banned_until),
  };
}

export function saveFailure(ip, count, lastFail, bannedUntil) {
  run(
    `INSERT INTO login_failures (ip, count, last_fail, banned_until) VALUES (?, ?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET count = excluded.count, last_fail = excluded.last_fail, banned_until = excluded.banned_until`,
    ip,
    Math.trunc(count),
    Math.trunc(lastFail),
    Math.trunc(bannedUntil)
  );
}

export function clearFailure(ip) {
  return run('DELETE FROM login_failures WHERE ip = ?', ip).changes;
}

/** 清理封禁已结束的记录 */
export function deleteExpiredBans(now) {
  return run('DELETE FROM login_failures WHERE banned_until > 0 AND banned_until <= ?', Math.trunc(now)).changes;
}
