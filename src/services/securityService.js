import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import * as configRepo from '../db/repos/config.repo.js';
import logger from '../utils/logger.js';

/** config 表中的安全设置键（不参与 DEFAULT_CONFIG 白名单，也不会暴露给前端） */
export const ADMIN_PATH_KEY = 'admin_path';
export const ADMIN_PASSWORD_HASH_KEY = 'admin_password_hash';

/** 安全入口格式：以 / 开头，单层路径，4-64 字符 */
export const ADMIN_PATH_REGEX = /^\/[A-Za-z0-9._~-]{3,63}$/;

const RESERVED_PREFIXES = ['/api', '/d'];
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const SCRYPT_KEY_LENGTH = 64;

/** 自定义安全入口（空表示未配置，走启动时随机路径） */
let customAdminPath = '';
/** 自定义密码的 scrypt 哈希（空表示未配置，走启动时随机密码） */
let customPasswordHash = '';

/** 启动时注入的随机凭据 */
let runtimeAdminPath = '';
let runtimePassword = '';

let loaded = false;

function readSetting(key) {
  try {
    return configRepo.getConfigValue(key);
  } catch {
    return '';
  }
}

/** 从数据库装载安全设置（启动时调用一次） */
export function loadSecuritySettings() {
  customAdminPath = readSetting(ADMIN_PATH_KEY);
  customPasswordHash = readSetting(ADMIN_PASSWORD_HASH_KEY);
  loaded = true;
  if (customAdminPath) logger.info(`使用自定义安全入口: ${customAdminPath}`);
  if (customPasswordHash) logger.info('使用自定义管理员密码');
}

function ensureLoaded() {
  if (!loaded) loadSecuritySettings();
}

/** 注入本次运行生成的随机凭据 */
export function setRuntimeCredentials({ adminPath, password } = {}) {
  if (adminPath) runtimeAdminPath = adminPath;
  if (password) runtimePassword = password;
}

/** 当前生效的安全入口：自定义优先，否则用启动随机路径 */
export function getAdminPath() {
  ensureLoaded();
  return customAdminPath || runtimeAdminPath;
}

export function hasCustomAdminPath() {
  ensureLoaded();
  return customAdminPath !== '';
}

export function hasCustomPassword() {
  ensureLoaded();
  return customPasswordHash !== '';
}

export function validateAdminPath(raw) {
  const value = String(raw ?? '').trim();
  if (value === '') return '请输入安全入口路径';
  if (!value.startsWith('/')) return '安全入口必须以 / 开头';
  for (const prefix of RESERVED_PREFIXES) {
    if (value === prefix || value.startsWith(`${prefix}/`)) {
      return `不能与内置路径 ${RESERVED_PREFIXES.join('、')} 冲突`;
    }
  }
  if (value.length < 4 || value.length > 64) return '安全入口长度需在 4 到 64 个字符之间';
  if (!ADMIN_PATH_REGEX.test(value)) {
    return '仅允许字母、数字、点、下划线、连字符、波浪线，且不能包含额外的斜杠';
  }
  return '';
}

export function validatePasswordStrength(raw) {
  const value = String(raw ?? '');
  if (value.length < MIN_PASSWORD_LENGTH) return `密码至少需要 ${MIN_PASSWORD_LENGTH} 位`;
  if (value.length > MAX_PASSWORD_LENGTH) return `密码不能超过 ${MAX_PASSWORD_LENGTH} 位`;
  if (/\s/.test(value)) return '密码不能包含空格或制表符';
  if (!/[a-z]/.test(value)) return '密码需包含小写字母';
  if (!/[A-Z]/.test(value)) return '密码需包含大写字母';
  if (!/[0-9]/.test(value)) return '密码需包含数字';
  if (!/[^A-Za-z0-9]/.test(value)) return '密码需包含特殊符号（如 ! @ # $ % ^ & *）';
  return '';
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyHashedPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = scryptSync(password, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** 统一校验管理员密码：自定义哈希优先于启动随机密码 */
export function verifyAdminPassword(input) {
  ensureLoaded();
  const value = String(input ?? '');
  if (customPasswordHash) return verifyHashedPassword(value, customPasswordHash);
  if (runtimePassword === '') return false;
  const a = Buffer.from(value);
  const b = Buffer.from(runtimePassword);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 保存自定义安全入口，立即生效 */
export function setAdminPath(rawPath) {
  const value = String(rawPath ?? '').trim();
  const error = validateAdminPath(value);
  if (error) return { error };
  configRepo.setConfig(ADMIN_PATH_KEY, value);
  customAdminPath = value;
  loaded = true;
  logger.info(`安全入口已更新为 ${value}`);
  return { path: value };
}

/** 保存自定义密码（scrypt 哈希），立即生效 */
export function setPassword(rawPassword) {
  const error = validatePasswordStrength(rawPassword);
  if (error) return { error };
  const hash = hashPassword(String(rawPassword));
  configRepo.setConfig(ADMIN_PASSWORD_HASH_KEY, hash);
  customPasswordHash = hash;
  loaded = true;
  logger.info('管理员密码已更新为自定义密码');
  return { ok: true };
}

/** 清除自定义设置，恢复随机凭据（测试与排障用） */
export function resetSecuritySettings() {
  try {
    configRepo.setConfig(ADMIN_PATH_KEY, '');
    configRepo.setConfig(ADMIN_PASSWORD_HASH_KEY, '');
  } catch {
    // 数据库不可用时忽略
  }
  customAdminPath = '';
  customPasswordHash = '';
  loaded = true;
}

/** 测试辅助 */
export function setCustomPasswordForTest(password) {
  return setPassword(password);
}
