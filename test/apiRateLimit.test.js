import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, setValue } from '../src/config/store.js';
import {
  apiWindowLimit,
  apiWindowSize,
  hitApiLimit,
  resetApiWindows,
} from '../src/core/apiRateLimit.js';
import { closeDb, initDb } from '../src/db/index.js';

let tempDir;

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-ratelimit-'));
  initDb(join(tempDir, 'test.db'));
  loadConfig();
});

after(() => {
  resetApiWindows();
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('未超限时放行并逐次递减剩余次数', () => {
  resetApiWindows();
  const now = Date.now();

  const first = hitApiLimit('203.0.113.7', now);
  assert.equal(first.allowed, true);
  assert.equal(first.limit, 30);
  assert.equal(first.remaining, 29);

  const second = hitApiLimit('203.0.113.7', now + 1000);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 28);
});

test('超过上限后拒绝并给出重试秒数', () => {
  resetApiWindows();
  const now = Date.now();

  let last = null;
  for (let i = 0; i < 31; i += 1) last = hitApiLimit('203.0.113.8', now);

  assert.equal(last.allowed, false);
  assert.equal(last.remaining, 0);
  assert.ok(last.retryAfterSeconds > 0);
});

test('窗口过期后重新计数', () => {
  resetApiWindows();
  const now = Date.now();

  for (let i = 0; i < 30; i += 1) hitApiLimit('203.0.113.9', now);
  assert.equal(hitApiLimit('203.0.113.9', now + 100).allowed, false);
  assert.equal(hitApiLimit('203.0.113.9', now + 61_000).allowed, true);
});

test('大量不同 IP 访问时窗口表保持有界', () => {
  resetApiWindows();
  const limit = apiWindowLimit();
  const now = Date.now();

  for (let i = 0; i < limit * 2; i += 1) hitApiLimit(`198.51.100.${i}`, now + i);

  assert.ok(apiWindowSize() <= limit, `窗口表 ${apiWindowSize()} 条，应不超过 ${limit}`);
});

test('上限配置为 0 时全部放行且不记录窗口', () => {
  resetApiWindows();
  setValue('api_rate_limit_per_min', '0');

  const result = hitApiLimit('203.0.113.10', Date.now());
  assert.equal(result.allowed, true);
  assert.equal(apiWindowSize(), 0);

  setValue('api_rate_limit_per_min', '30');
});
