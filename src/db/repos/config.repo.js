import { all, run } from '../index.js';

export function getAllConfig() {
  return all('SELECT key, value FROM config');
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
