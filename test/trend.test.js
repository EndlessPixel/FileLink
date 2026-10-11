import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/store.js';
import { closeDb, initDb } from '../src/db/index.js';
import * as logRepo from '../src/db/repos/accessLogs.repo.js';
import { queryTrend } from '../src/services/accessLogService.js';

const DAY = 24 * 60 * 60 * 1000;
let tempDir;

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-trend-'));
  initDb(join(tempDir, 'test.db'));
  loadConfig();

  const now = Date.now();
  const entry = (extra) => ({
    ip: '1.1.1.1',
    method: 'GET',
    path: '/d/aaaaaaaaaaaaaaaa',
    code: 200,
    bytesSent: 0,
    durationMs: 1,
    ua: '',
    referer: '',
    createdAt: now,
    ...extra,
  });

  logRepo.insertMany([
    entry({ code: 200, bytesSent: 1000 }),
    entry({ code: 206, bytesSent: 500 }),
    entry({ code: 444, ip: '2.2.2.2', createdAt: now - DAY }),
  ]);
});

after(() => {
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('queryTrend 按天聚合、补零并统计总量', () => {
  const result = queryTrend({ days: 7 });

  assert.equal(result.days, 7);
  assert.equal(result.points.length, 7);
  assert.equal(result.totals.requests, 3);
  assert.equal(result.totals.downloads, 2); // 200 与 206 计入下载
  assert.equal(result.totals.bytes, 1500);

  const today = result.points[result.points.length - 1];
  assert.equal(today.requests, 2);
  assert.equal(today.downloads, 2);

  const yesterday = result.points[result.points.length - 2];
  assert.equal(yesterday.requests, 1);
  assert.equal(yesterday.downloads, 0);
});

test('queryTrend 的 days 参数被限制在 1 到 90 之间', () => {
  assert.equal(queryTrend({ days: 0 }).days, 1);
  assert.equal(queryTrend({ days: 999 }).days, 90);
  assert.equal(queryTrend({}).days, 14);
});
