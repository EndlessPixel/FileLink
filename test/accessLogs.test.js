import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, initDb } from '../src/db/index.js';
import * as logRepo from '../src/db/repos/accessLogs.repo.js';
import {
  exportAccessLogsCsv,
  flushAccessLogs,
  parseLogQuery,
  queryAccessLogs,
  recordAccess,
  resetAccessLogQueue,
} from '../src/services/accessLogService.js';

let tempDir;

const BASE = Date.UTC(2026, 9, 10, 12, 0, 0); // 2026-10-10 12:00:00 UTC

function seed() {
  logRepo.insertMany([
    { ip: '203.0.113.7', method: 'GET', path: '/d/aaa', code: 200, bytesSent: 1024, durationMs: 120, ua: 'curl/8', referer: '', createdAt: BASE },
    { ip: '203.0.113.7', method: 'GET', path: '/d/bbb', code: 206, bytesSent: 512, durationMs: 80, ua: 'curl/8', referer: '', createdAt: BASE + 60_000 },
    { ip: '198.51.100.9', method: 'HEAD', path: '/d/aaa', code: 200, bytesSent: 0, durationMs: 5, ua: 'wget', referer: '', createdAt: BASE + 120_000 },
    { ip: '203.0.113.50', method: 'GET', path: '/d/zzz', code: 444, bytesSent: 0, durationMs: 2, ua: '', referer: '', createdAt: BASE + 180_000 },
    { ip: '203.0.113.50', method: 'GET', path: '/d/yyy', code: 444, bytesSent: 0, durationMs: 1, ua: '', referer: '', createdAt: BASE + 240_000 },
  ]);
}

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-logs-'));
  initDb(join(tempDir, 'test.db'));
});

beforeEach(() => {
  resetAccessLogQueue();
  logRepo.deleteLogsBefore(Date.now() + 1);
  seed();
});

after(() => {
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('parseLogQuery 收敛非法参数', () => {
  assert.deepEqual(parseLogQuery({}).pageSize, 20);
  assert.equal(parseLogQuery({ pageSize: '999' }).pageSize, 20, '不在白名单内的分页大小回退默认值');
  assert.equal(parseLogQuery({ pageSize: '50' }).pageSize, 50);
  assert.equal(parseLogQuery({ page: '-3' }).page, 1);
  assert.equal(parseLogQuery({ sort: 'drop table' }).sort, 'created_at');
  assert.equal(parseLogQuery({ order: 'asc' }).order, 'asc');
  assert.equal(parseLogQuery({ code: 'abc' }).code, undefined);
  assert.equal(parseLogQuery({ code: '444' }).code, 444);
  assert.equal(parseLogQuery({ from: '0' }).from, undefined);
  assert.equal(parseLogQuery({ from: '1000' }).from, 1000);
});

test('分页与统计同时返回，统计跟随筛选条件', () => {
  const result = queryAccessLogs({ pageSize: '10' });
  assert.equal(result.logs.length, 5);
  assert.equal(result.pagination.total, 5);
  assert.equal(result.pagination.pageSizes.join(','), '10,20,50,100');
  assert.equal(result.stats.total, 5);
  assert.equal(result.stats.bytes, 1536);
  assert.equal(result.stats.disconnects, 2);
  // 203.0.113.7 与 203.0.113.50 同为 2 次，并列时按 IP 升序
  assert.deepEqual(result.stats.topIps[0], { ip: '203.0.113.50', count: 2 });
  assert.deepEqual(result.stats.topIps[1], { ip: '203.0.113.7', count: 2 });
});

test('按状态码筛选只统计命中的记录', () => {
  const result = queryAccessLogs({ code: '444', pageSize: '10' });
  assert.equal(result.pagination.total, 2);
  assert.equal(result.stats.total, 2);
  assert.equal(result.stats.bytes, 0);
  assert.equal(result.stats.disconnects, 2);
  assert.ok(result.logs.every((log) => log.code === 444));
});

test('关键词可匹配路径、IP 与方法', () => {
  assert.equal(queryAccessLogs({ q: '/d/aaa', pageSize: '10' }).pagination.total, 2);
  assert.equal(queryAccessLogs({ q: '198.51.100.9', pageSize: '10' }).pagination.total, 1);
  assert.equal(queryAccessLogs({ q: 'HEAD', pageSize: '10' }).pagination.total, 1);
  assert.equal(queryAccessLogs({ q: 'no-such-keyword', pageSize: '10' }).pagination.total, 0);
});

test('时间范围筛选按 created_at 生效', () => {
  const from = BASE + 60_000;
  const to = BASE + 180_000;
  const result = queryAccessLogs({ from: String(from), to: String(to), pageSize: '10' });
  assert.equal(result.pagination.total, 3);
  assert.ok(result.logs.every((log) => log.createdAt >= from && log.createdAt <= to));
});

test('排序支持时间、耗时与字节数', () => {
  const byDuration = queryAccessLogs({ sort: 'duration_ms', order: 'desc', pageSize: '10' });
  const durations = byDuration.logs.map((log) => log.durationMs);
  assert.deepEqual(durations, [...durations].sort((a, b) => b - a));

  const byBytes = queryAccessLogs({ sort: 'bytes_sent', order: 'asc', pageSize: '10' });
  const bytes = byBytes.logs.map((log) => log.bytesSent);
  assert.deepEqual(bytes, [...bytes].sort((a, b) => a - b));

  const oldest = queryAccessLogs({ sort: 'created_at', order: 'asc', pageSize: '10' });
  assert.equal(oldest.logs[0].createdAt, BASE);
});

test('分页页码越界返回空列表但保留统计', () => {
  const result = queryAccessLogs({ page: '99', pageSize: '10' });
  assert.equal(result.logs.length, 0);
  assert.equal(result.pagination.total, 5);
  assert.equal(result.pagination.page, 99);
});

test('recordAccess 先入队，flush 后才落库', () => {
  logRepo.deleteLogsBefore(Date.now() + 1);
  recordAccess({ ip: '1.2.3.4', method: 'GET', path: '/d/x', code: 200, bytesSent: 10, durationMs: 3 });
  assert.equal(logRepo.countLogs(), 0, '未 flush 前不应写库');

  const written = flushAccessLogs();
  assert.equal(written, 1);
  assert.equal(logRepo.countLogs(), 1);

  const [log] = queryAccessLogs({ pageSize: '10' }).logs;
  assert.equal(log.ip, '1.2.3.4');
  assert.equal(log.code, 200);
  assert.equal(log.bytesSent, 10);
});

test('recordAccess 对超长字段做截断，负数归零', () => {
  logRepo.deleteLogsBefore(Date.now() + 1);
  recordAccess({
    ip: 'a'.repeat(100),
    method: 'GET',
    path: `/${'p'.repeat(900)}`,
    code: 200,
    bytesSent: -5,
    durationMs: -1,
    ua: 'u'.repeat(900),
  });
  flushAccessLogs();
  const [log] = queryAccessLogs({ pageSize: '10' }).logs;
  assert.equal(log.ip.length, 64);
  assert.equal(log.path.length, 512);
  assert.equal(log.ua.length, 512);
  assert.equal(log.bytesSent, 0);
  assert.equal(log.durationMs, 0);
});

test('CSV 导出带 BOM、表头正确并防公式注入', () => {
  logRepo.deleteLogsBefore(Date.now() + 1);
  logRepo.insertMany([
    {
      ip: '=cmd|calc',
      method: 'GET',
      path: '/d/含逗号,和"引号"',
      code: 444,
      bytesSent: 0,
      durationMs: 1,
      ua: 'x',
      referer: '',
      createdAt: BASE,
    },
  ]);

  const { csv, count } = exportAccessLogsCsv({ pageSize: '10' });
  assert.equal(count, 1);
  assert.ok(csv.startsWith('\uFEFF'), '应带 UTF-8 BOM 以便 Excel 识别');
  assert.ok(csv.includes('时间,IP,方法,路径,状态码,耗时(ms),字节数,User-Agent,Referer'));
  assert.ok(csv.includes("'=cmd|calc"), '公式注入应被前置单引号中和');
  assert.ok(csv.includes('"/d/含逗号,和""引号"""'), '逗号与引号应被正确转义');
});

test('deleteLogsBefore 按严格小于清理日志', () => {
  const removed = logRepo.deleteLogsBefore(BASE + 120_000);
  assert.equal(removed, 2, 'BASE 与 BASE+60s 被删除，恰好等于边界的保留');
  assert.equal(logRepo.countLogs(), 3);
});
