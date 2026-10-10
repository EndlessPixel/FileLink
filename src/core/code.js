import { randomBytes, randomInt } from 'node:crypto';
import {
  ADMIN_PATH_ALPHABET,
  ADMIN_PATH_SUFFIX_LENGTH,
  ADMIN_PASSWORD_ALPHABET,
  ADMIN_PASSWORD_LENGTH,
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_REGEX,
} from '../config/constants.js';

/** 从给定字符集随机取样，使用 CSPRNG */
export function randomString(length, alphabet) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(0, alphabet.length)];
  return out;
}

/** 生成 16 位十六进制短码 */
export function generateCode() {
  return randomString(CODE_LENGTH, CODE_ALPHABET);
}

/** 短码格式校验（不查库） */
export function isValidCode(code) {
  return typeof code === 'string' && CODE_REGEX.test(code);
}

export function generateAdminPathSuffix() {
  return randomString(ADMIN_PATH_SUFFIX_LENGTH, ADMIN_PATH_ALPHABET);
}

export function generateAdminPassword() {
  return randomString(ADMIN_PASSWORD_LENGTH, ADMIN_PASSWORD_ALPHABET);
}

export function generateSessionId() {
  return randomBytes(32).toString('hex');
}

export function generateSecret() {
  return randomBytes(48).toString('hex');
}
