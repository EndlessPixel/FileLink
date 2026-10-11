import { all, get, run } from '../index.js';
import { createIpRuleIndex } from '../../core/ipRuleIndex.js';

/**
 * 白名单内存索引：下载热路径只读内存，避免每个请求都查一次库。
 * 启动时装载一次，增删时同步重建。
 */
const index = createIpRuleIndex();

function rebuild() {
  try {
    index.rebuild(all('SELECT ip FROM ip_whitelist').map((row) => row.ip));
  } catch {
    index.rebuild([]);
  }
}

/** 启动时调用一次 */
export function loadWhitelistCache() {
  rebuild();
}

function toEntry(row) {
  if (!row) return null;
  return { ip: row.ip, reason: row.reason, addedAt: Number(row.added_at) };
}

export function addToWhitelist(ip, reason, addedAt) {
  run(
    `INSERT INTO ip_whitelist (ip, reason, added_at) VALUES (?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, added_at = excluded.added_at`,
    ip,
    reason ?? '',
    Math.trunc(addedAt)
  );
  rebuild();
}

export function removeFromWhitelist(ip) {
  const changes = run('DELETE FROM ip_whitelist WHERE ip = ?', ip).changes;
  if (changes > 0) rebuild();
  return changes;
}

/** 该 IP 是否享受免并发限制与免限速待遇（支持 CIDR 段） */
export function isWhitelisted(ip) {
  return index.has(ip);
}

export function listWhitelist() {
  return all('SELECT ip, reason, added_at FROM ip_whitelist ORDER BY added_at DESC').map(toEntry);
}

export function getWhitelistEntry(ip) {
  return toEntry(get('SELECT ip, reason, added_at FROM ip_whitelist WHERE ip = ?', ip));
}

export function countWhitelist() {
  return Number(get('SELECT COUNT(*) AS total FROM ip_whitelist')?.total ?? 0);
}

/** 测试辅助 */
export function resetWhitelistCache() {
  index.reset();
}
