import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, initDb } from '../src/db/index.js';
import {
  getAdminPath,
  hasCustomAdminPath,
  hasCustomPassword,
  loadSecuritySettings,
  resetSecuritySettings,
  setAdminPath,
  setPassword,
  setRuntimeCredentials,
  validateAdminPath,
  validatePasswordStrength,
  verifyAdminPassword,
} from '../src/services/securityService.js';

let tempDir;

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-security-'));
  initDb(join(tempDir, 'test.db'));
  setRuntimeCredentials({ adminPath: '/admin-abc123', password: 'RuntimePass1!' });
  resetSecuritySettings();
  loadSecuritySettings();
});

beforeEach(() => {
  resetSecuritySettings();
  loadSecuritySettings();
});

after(() => {
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('未自定义时使用启动随机凭据', () => {
  assert.equal(hasCustomAdminPath(), false);
  assert.equal(hasCustomPassword(), false);
  assert.equal(getAdminPath(), '/admin-abc123');
  assert.equal(verifyAdminPassword('RuntimePass1!'), true);
  assert.equal(verifyAdminPassword('WrongPass1!'), false);
  assert.equal(verifyAdminPassword(''), false);
});

test('安全入口格式校验', () => {
  assert.equal(validateAdminPath('/my-panel'), '');
  assert.equal(validateAdminPath('/panel_2026.v1~x'), '');
  assert.equal(validateAdminPath('my-panel'), '安全入口必须以 / 开头');
  assert.equal(validateAdminPath('/ab'), '安全入口长度需在 4 到 64 个字符之间');
  assert.equal(validateAdminPath(`/${'a'.repeat(70)}`), '安全入口长度需在 4 到 64 个字符之间');
  assert.notEqual(validateAdminPath('/a b/c'), '');
  assert.notEqual(validateAdminPath('/api/secret'), '');
  assert.equal(validateAdminPath('/d'), '不能与内置路径 /api、/d 冲突');
  assert.notEqual(validateAdminPath(''), '');
});

test('密码强度校验要求大小写、数字与特殊符号', () => {
  assert.equal(validatePasswordStrength('Abcdef1!'), '');
  assert.equal(validatePasswordStrength('Abcdefg1'), '密码需包含特殊符号（如 ! @ # $ % ^ & *）');
  assert.equal(validatePasswordStrength('abcdef1!'), '密码需包含大写字母');
  assert.equal(validatePasswordStrength('ABCDEF1!'), '密码需包含小写字母');
  assert.equal(validatePasswordStrength('Abcdefg!'), '密码需包含数字');
  assert.equal(validatePasswordStrength('Ab1!'), '密码至少需要 8 位');
  assert.equal(validatePasswordStrength('Abc def1!'), '密码不能包含空格或制表符');
});

test('保存自定义安全入口后立即生效并覆盖随机路径', () => {
  const result = setAdminPath('/my-secret-panel');
  assert.equal(result.path, '/my-secret-panel');
  assert.equal(hasCustomAdminPath(), true);
  assert.equal(getAdminPath(), '/my-secret-panel');
});

test('保存自定义密码后覆盖随机密码', () => {
  assert.equal(verifyAdminPassword('RuntimePass1!'), true);

  const result = setPassword('NewPassw0rd#');
  assert.equal(result.ok, true);
  assert.equal(hasCustomPassword(), true);
  assert.equal(verifyAdminPassword('NewPassw0rd#'), true);
  assert.equal(verifyAdminPassword('RuntimePass1!'), false, '随机密码应已失效');
});

test('弱密码被拒绝且不影响已有设置', () => {
  const result = setPassword('weakpass');
  assert.ok(result.error);
  assert.equal(hasCustomPassword(), false);
  assert.equal(verifyAdminPassword('RuntimePass1!'), true);
});

test('自定义设置持久化到数据库，重新装载后仍生效', () => {
  setAdminPath('/persist-path');
  setPassword('Persist1@Pass');
  loadSecuritySettings();
  assert.equal(getAdminPath(), '/persist-path');
  assert.equal(verifyAdminPassword('Persist1@Pass'), true);
});
