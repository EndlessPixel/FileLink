import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/store.js';
import { resetApiWindows } from '../src/core/apiRateLimit.js';
import { closeDb, initDb } from '../src/db/index.js';
import * as filesRepo from '../src/db/repos/files.repo.js';
import { createApp } from '../src/app.js';
import { setRuntimeCredentials } from '../src/services/securityService.js';

const SHA = 'a'.repeat(64);
const UNKNOWN_SHA = 'b'.repeat(64);
const ADMIN_PATH = '/test-admin-abc';

let server;
let baseUrl;
let tempDir;

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-api-'));
  initDb(join(tempDir, 'test.db'));
  loadConfig();
  filesRepo.upsertFile({ sha256: SHA, filePath: '/tmp/whatever.bin', size: 1234, addedAt: Date.now() });
  setRuntimeCredentials({ adminPath: ADMIN_PATH, password: 'RuntimePass1!' });

  const app = createApp({ sessionSecret: 'test-secret' });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  resetApiWindows();
  await new Promise((resolve) => server.close(resolve));
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('缺少或非法 sha256 返回 400', async () => {
  for (const query of ['', `?sha256=xyz`, `?sha256=${'a'.repeat(63)}`]) {
    const res = await fetch(`${baseUrl}/api/filelink${query}`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_sha256');
  }
});

test('GET /api/filelink 为已登记文件创建链接并返回完整 URL', async () => {
  const res = await fetch(`${baseUrl}/api/filelink?sha256=${SHA}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sha256, SHA);
  assert.match(body.code, /^[0-9a-f]{16}$/);
  assert.equal(body.url, `${baseUrl}/d/${body.code}`);
  assert.equal(body.downloadCount, 0);
  assert.equal(body.created, true);
});

test('重复请求返回同一个短码', async () => {
  const first = await (await fetch(`${baseUrl}/api/filelink?sha256=${SHA}`)).json();
  const second = await (await fetch(`${baseUrl}/api/filelink?sha256=${SHA}`)).json();
  assert.equal(first.code, second.code);
  assert.equal(second.created, false);
});

test('未登记文件返回 404', async () => {
  const res = await fetch(`${baseUrl}/api/filelink?sha256=${UNKNOWN_SHA}`);
  assert.equal(res.status, 404);
});

test('POST /api/refresh 更换短码，旧链接失效', async () => {
  const before = await (await fetch(`${baseUrl}/api/filelink?sha256=${SHA}`)).json();
  const res = await fetch(`${baseUrl}/api/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sha256: SHA }),
  });
  assert.equal(res.status, 200);
  const after = await res.json();
  assert.notEqual(after.code, before.code);
  assert.equal(after.refreshed, true);

  await assert.rejects(async () => {
    const res = await fetch(`${baseUrl}/d/${before.code}`);
    await res.text();
  }, /fetch failed|ECONNRESET|socket hang up|other side closed/);
});

test('GET /api/info 返回文件与链接状态', async () => {
  const res = await fetch(`${baseUrl}/api/info?sha256=${SHA}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sha256, SHA);
  assert.equal(body.size, 1234);
  assert.equal(body.filePath, '/tmp/whatever.bin');
  assert.match(body.code, /^[0-9a-f]{16}$/);
});

test('管理路由挂在当前安全入口下：前缀被正确剥离', async () => {
  const unauthorized = await fetch(`${baseUrl}${ADMIN_PATH}/api/security`);
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).error, 'unauthorized');

  // 入口需要尾斜杠访问
  const redirect = await fetch(`${baseUrl}${ADMIN_PATH}`, { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), `${ADMIN_PATH}/`);

  // 非该前缀一律断开连接
  await assert.rejects(async () => {
    const res = await fetch(`${baseUrl}/admin-guess/api/security`);
    await res.text();
  }, /fetch failed|ECONNRESET|other side closed/);
});

test('单 IP 每分钟超过 30 次返回 429', async () => {
  resetApiWindows();
  let limited = 0;
  let lastStatus = 0;
  for (let i = 0; i < 33; i += 1) {
    const res = await fetch(`${baseUrl}/api/info?sha256=${SHA}`);
    lastStatus = res.status;
    if (res.status === 429) {
      limited += 1;
      const body = await res.json();
      assert.equal(body.error, 'rate_limit_exceeded');
      assert.ok(res.headers.get('retry-after'));
    }
  }
  assert.equal(lastStatus, 429);
  assert.equal(limited, 3);
});
