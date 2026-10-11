import { isIP } from 'node:net';
import { isAbsolute, normalize } from 'node:path';
import { parseCidr } from '../core/cidr.js';

const SHA256_REGEX = /^[0-9a-f]{64}$/;

export function isSha256(value) {
  return typeof value === 'string' && SHA256_REGEX.test(value);
}

/** 统一小写比较 */
export function normalizeSha256(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isIpAddress(value) {
  return typeof value === 'string' && isIP(value.trim()) !== 0;
}

/** 合法 IP 或 CIDR 网段（如 198.51.100.0/24） */
export function isIpRule(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text === '') return false;
  if (!text.includes('/')) return isIP(text) !== 0;
  return parseCidr(text) !== null;
}

/** 服务器端绝对路径（拒绝含空字节的输入） */
export function isSafeAbsolutePath(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.includes('\0')) return false;
  return isAbsolute(normalize(trimmed));
}

export function toNonNegativeInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}
