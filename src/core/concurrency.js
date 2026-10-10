import { getNumber } from '../config/store.js';

/** ip -> 当前活跃下载连接数 */
const counters = new Map();

/**
 * 尝试占用一个下载连接名额。
 * 上限每次实时读取配置，后台改值立即生效。
 * @returns {boolean} 是否取得名额
 */
export function acquireSlot(ip) {
  const limit = getNumber('max_concurrent_downloads');
  const current = counters.get(ip) ?? 0;
  if (current >= limit) return false;
  counters.set(ip, current + 1);
  return true;
}

export function releaseSlot(ip) {
  const current = counters.get(ip) ?? 0;
  if (current <= 1) counters.delete(ip);
  else counters.set(ip, current - 1);
}

export function activeConnections(ip) {
  return counters.get(ip) ?? 0;
}

/** 测试辅助 */
export function resetCounters() {
  counters.clear();
}
