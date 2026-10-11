import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/store.js';
import { closeDb, initDb } from '../src/db/index.js';
import {
  computeCpuPercent,
  computeIoRate,
  getSystemSnapshot,
  parseDiskStats,
  resetSystemMonitor,
} from '../src/services/systemMonitor.js';

const SAMPLE = [
  '   8       0 sda 1000 0 20480 500 2000 0 40960 900 0 1000 1400',
  '   8       1 sda1 900 0 18432 450 1900 0 39936 850 0 900 1300',
  '   7       0 loop0 10 0 80 0 0 0 0 0 0 0 0',
  ' 253       0 dm-0 500 0 10240 250 1000 0 20480 450 0 500 700',
  ' 259       0 nvme0n1 700 0 14336 350 1400 0 28672 630 0 700 980',
].join('\n');

let tempDir;

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-system-'));
  initDb(join(tempDir, 'test.db'));
  loadConfig();
  resetSystemMonitor();
});

after(() => {
  resetSystemMonitor();
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('parseDiskStats 只统计整块设备并换算为字节', () => {
  const entries = parseDiskStats(SAMPLE);

  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['sda', 'nvme0n1']
  );

  const sda = entries.find((entry) => entry.name === 'sda');
  assert.equal(sda.read, 20480 * 512);
  assert.equal(sda.write, 40960 * 512);
});

test('parseDiskStats 忽略格式不完整的行', () => {
  assert.deepEqual(parseDiskStats('   8       0 sda 1 2 3\n\n'), []);
});

test('computeIoRate 按累计值差值计算每秒吞吐', () => {
  const previous = { read: 0, write: 0 };
  const current = { read: 1024 * 100, write: 1024 * 50 };

  const rate = computeIoRate(previous, current, 1000);
  assert.equal(rate.read, 102400);
  assert.equal(rate.write, 51200);

  assert.equal(computeIoRate(null, current, 1000), null);
  assert.equal(computeIoRate(previous, { read: 0, write: 0 }, 0), null);
});

test('computeCpuPercent 依据时间片差值计算占用率', () => {
  assert.equal(computeCpuPercent({ idle: 100, total: 200 }, { idle: 150, total: 300 }), 50);
  assert.equal(computeCpuPercent({ idle: 100, total: 200 }, { idle: 200, total: 300 }), 0);
  assert.equal(computeCpuPercent(null, { idle: 150, total: 300 }), 0);
});

test('getSystemSnapshot 返回完整结构', () => {
  resetSystemMonitor();
  const snapshot = getSystemSnapshot();

  assert.equal(snapshot.intervalMs, 5000);
  assert.equal(snapshot.alertPercent, 90);
  assert.ok(Array.isArray(snapshot.disks));
  assert.ok(Array.isArray(snapshot.io.points));
  assert.equal(typeof snapshot.io.supported, 'boolean');
  assert.equal(typeof snapshot.memory.total, 'number');
  assert.equal(typeof snapshot.memory.usedPercent, 'number');
  assert.equal(typeof snapshot.load.cores, 'number');
  assert.equal(typeof snapshot.load.cpuPercent, 'number');
  assert.equal(typeof snapshot.uptimeSeconds, 'number');
});
