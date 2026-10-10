import { all, get, run } from '../index.js';

export function getAllConfig() {
  return all('SELECT key, value FROM config');
}

/** 读取单个配置值，不存在返回空字符串 */
export function getConfigValue(key) {
  const row = get('SELECT value FROM config WHERE key = ?', key);
  return row ? String(row.value) : '';
}

export function setConfig(key, value) {
  run(
    `INSERT INTO config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    String(value)
  );
}

export function setManyConfig(entries) {
  for (const [key, value] of Object.entries(entries)) setConfig(key, value);
}
