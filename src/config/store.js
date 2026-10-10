import * as configRepo from '../db/repos/config.repo.js';
import { DEFAULT_CONFIG, NUMERIC_CONFIG_KEYS } from './constants.js';
import logger from '../utils/logger.js';

/** 内存缓存：所有运行时读取都走这里，保证后台改值立即生效 */
const cache = new Map();

/** 从数据库加载配置，缺失项写入默认值 */
export function loadConfig() {
  cache.clear();
  const stored = new Map(configRepo.getAllConfig().map((row) => [row.key, row.value]));
  const missing = {};

  for (const [key, defaultValue] of Object.entries(DEFAULT_CONFIG)) {
    if (stored.has(key)) {
      cache.set(key, stored.get(key));
    } else {
      cache.set(key, defaultValue);
      missing[key] = defaultValue;
    }
  }
  if (Object.keys(missing).length > 0) configRepo.setManyConfig(missing);
  logger.debug('config loaded:', Object.fromEntries(cache));
}

function read(key) {
  if (!cache.has(key)) throw new Error(`Unknown config key: ${key}`);
  return cache.get(key);
}

/** 数值型配置（非法值回退默认） */
export function getNumber(key) {
  const parsed = Number(read(key));
  if (Number.isFinite(parsed)) return parsed;
  return Number(DEFAULT_CONFIG[key]);
}

/** 字符串型配置 */
export function getString(key) {
  return String(read(key));
}

/** 写入并立即生效 */
export function setValue(key, value) {
  if (!(key in DEFAULT_CONFIG)) throw new Error(`Unknown config key: ${key}`);
  const normalized = NUMERIC_CONFIG_KEYS.has(key) ? String(Math.trunc(Number(value))) : String(value);
  configRepo.setConfig(key, normalized);
  cache.set(key, normalized);
  logger.info(`config updated: ${key} = ${normalized}`);
  return normalized;
}

/** 当前全部配置（已按类型解析） */
export function snapshot() {
  const result = {};
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    result[key] = NUMERIC_CONFIG_KEYS.has(key) ? getNumber(key) : getString(key);
  }
  return result;
}
