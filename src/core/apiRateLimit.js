import { getNumber } from '../config/store.js';

const WINDOW_MS = 60 * 1000;

/**
 * 窗口表上限。被大规模扫描时，仅靠每小时一次的全量清扫会积压大量条目，
 * 因此达到上限后先清过期项，仍超出则淘汰最久未访问的一批，保证内存始终有界。
 */
const MAX_WINDOWS = 5000;

/** ip -> { windowStart, count } */
const windows = new Map();

/** 触发有界清理：仅在窗口表达到上限时才有实际开销 */
function enforceBound(now) {
  if (windows.size < MAX_WINDOWS) return;

  sweepApiWindows(now);

  // 仍超出时按插入顺序淘汰。Map 保持插入顺序，而窗口只在某 IP 首次出现时新建，
  // 因此队首基本就是最早那批 IP；被淘汰者随后重新计数，属极端压力下可接受的退化。
  for (const ip of windows.keys()) {
    if (windows.size < MAX_WINDOWS) break;
    windows.delete(ip);
  }
}

/**
 * 固定窗口限流：单 IP 每分钟上限，上限实时读取配置。
 * @returns {{allowed:boolean, limit:number, remaining:number, retryAfterSeconds:number}}
 */
export function hitApiLimit(ip, now = Date.now()) {
  const limit = Math.max(getNumber('api_rate_limit_per_min'), 0);
  if (limit === 0) return { allowed: true, limit, remaining: 0, retryAfterSeconds: 0 };

  let entry = windows.get(ip);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    enforceBound(now);
    entry = { windowStart: now, count: 0 };
    windows.set(ip, entry);
  }
  entry.count += 1;

  const allowed = entry.count <= limit;
  const remaining = Math.max(limit - entry.count, 0);
  const retryAfterSeconds = Math.max(Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000), 1);
  return { allowed, limit, remaining, retryAfterSeconds };
}

/** 清理已过期窗口，避免 Map 无界增长 */
export function sweepApiWindows(now = Date.now()) {
  for (const [ip, entry] of windows) {
    if (now - entry.windowStart >= WINDOW_MS) windows.delete(ip);
  }
}

export function resetApiWindows() {
  windows.clear();
}

/** 测试辅助：当前窗口表大小 */
export function apiWindowSize() {
  return windows.size;
}

/** 测试辅助：窗口表上限 */
export function apiWindowLimit() {
  return MAX_WINDOWS;
}
