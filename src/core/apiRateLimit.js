import { getNumber } from '../config/store.js';

const WINDOW_MS = 60 * 1000;

/** ip -> { windowStart, count } */
const windows = new Map();

/**
 * 固定窗口限流：单 IP 每分钟上限，上限实时读取配置。
 * @returns {{allowed:boolean, limit:number, remaining:number, retryAfterSeconds:number}}
 */
export function hitApiLimit(ip, now = Date.now()) {
  const limit = Math.max(getNumber('api_rate_limit_per_min'), 0);
  if (limit === 0) return { allowed: true, limit, remaining: 0, retryAfterSeconds: 0 };

  let entry = windows.get(ip);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
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
