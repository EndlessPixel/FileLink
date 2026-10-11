import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/store.js';
import { closeDb, initDb } from '../src/db/index.js';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
let tempDir;

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-health-'));
  initDb(join(tempDir, 'test.db'));
  loadConfig();

  const app = createApp({ sessionSecret: 'test-secret' });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('GET /healthz 返回存活状态且禁止缓存', async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');

  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.db, 'ok');
  assert.ok(Number.isInteger(body.uptimeSeconds));
});

test('健康检查不占用 API 限流额度', async () => {
  // API 限额为每分钟 30 次，这里连续探测远超该值仍应全部放行
  for (let i = 0; i < 60; i += 1) {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
  }
});
