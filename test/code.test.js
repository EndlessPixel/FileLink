import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCode,
  generateAdminPassword,
  generateAdminPathSuffix,
  isValidCode,
  randomString,
} from '../src/core/code.js';

test('generateCode 生成 16 位小写十六进制短码', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateCode();
    assert.match(code, /^[0-9a-f]{16}$/);
  }
});

test('isValidCode 只接受 16 位十六进制', () => {
  assert.equal(isValidCode('0123456789abcdef'), true);
  assert.equal(isValidCode('0123456789ABCDEF'), false);
  assert.equal(isValidCode('0123456789abcde'), false);
  assert.equal(isValidCode('0123456789abcdef0'), false);
  assert.equal(isValidCode('gggggggggggggggg'), false);
  assert.equal(isValidCode(''), false);
  assert.equal(isValidCode(undefined), false);
  assert.equal(isValidCode(1234567890123456), false);
});

test('randomString 长度与字符集受控', () => {
  const value = randomString(32, 'ab');
  assert.equal(value.length, 32);
  assert.match(value, /^[ab]{32}$/);
});

test('管理路径后缀与密码长度符合约定', () => {
  assert.match(generateAdminPathSuffix(), /^[a-z0-9]{6}$/);
  assert.equal(generateAdminPassword().length, 16);
});
