import { all, get, run } from '../index.js';
import { createIpRuleIndex } from '../../core/ipRuleIndex.js';

/**
 * 精确地址走 SQL 主键查询（快且不占内存），
 * 仅把含 '/' 的 CIDR 规则缓存在内存里供热路径比对。
 */
const cidrIndex = createIpRuleIndex();

function rebuildIndex() {
  try {
    cidrIndex.rebuild(all("SELECT ip FROM ip_blacklist WHERE ip LIKE '%/%'").map((row) => row.ip));
  } catch {
    cidrIndex.reset();
  }
}

/** 启动时调用一次 */
export function loadBlacklistCache() {
  rebuildIndex();
}

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
  rebuildIndex();
}

export function removeFromBlacklist(ip) {
  const changes = run('DELETE FROM ip_blacklist WHERE ip = ?', ip).changes;
  if (changes > 0) rebuildIndex();
  return changes;
}

/** 判定是否命中黑名单：精确命中或落在任一 CIDR 段内 */
export function isBlacklisted(ip) {
  if (get('SELECT 1 AS hit FROM ip_blacklist WHERE ip = ?', ip)) return true;
  return cidrIndex.has(ip);
}

export function listBlacklist() {
  return all('SELECT ip, reason, added_at FROM ip_blacklist ORDER BY added_at DESC').map(toEntry);
}

export function countBlacklist() {
  const row = get('SELECT COUNT(*) AS total FROM ip_blacklist');
  return Number(row?.total ?? 0);
}

/** 测试辅助 */
export function resetBlacklistCache() {
  cidrIndex.reset();
}
