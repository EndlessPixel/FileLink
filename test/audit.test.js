import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, initDb } from '../src/db/index.js';
import * as auditRepo from '../src/db/repos/auditLogs.repo.js';
import { flushAuditLogs, queryAudit, recordAudit, resetAuditQueue } from '../src/services/auditService.js';

let tempDir;

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-audit-'));
  initDb(join(tempDir, 'test.db'));
  resetAuditQueue();
});

after(() => {
  resetAuditQueue();
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('审计记录落库后可按操作类型与关键词筛选', () => {
  auditRepo.deleteAuditBefore(Date.now() + 1000);

  recordAudit({ ip: '203.0.113.1', action: 'file.add', target: 'aaa', detail: '登记 /tmp/a.bin' });
  recordAudit({ ip: '203.0.113.1', action: 'blacklist.add', target: '198.51.100.0/24', detail: '加入黑名单' });
  recordAudit({ ip: '203.0.113.2', action: 'file.remove', target: 'bbb', detail: '移除映射' });
  flushAuditLogs();

  const all = queryAudit({ pageSize: 20 });
  assert.equal(all.pagination.total, 3);
  assert.ok(all.actions.includes('file.add'));
  assert.ok(all.actions.includes('blacklist.add'));

  const onlyFiles = queryAudit({ action: 'file.add' });
  assert.equal(onlyFiles.pagination.total, 1);
  assert.equal(onlyFiles.logs[0].detail, '登记 /tmp/a.bin');

  const keyword = queryAudit({ q: '198.51.100' });
  assert.equal(keyword.pagination.total, 1);
  assert.equal(keyword.logs[0].target, '198.51.100.0/24');
});

test('审计记录按时间倒序返回并支持分页', () => {
  auditRepo.deleteAuditBefore(Date.now() + 1000);
  resetAuditQueue();

  for (let i = 0; i < 12; i += 1) {
    recordAudit({ ip: '203.0.113.9', action: `test.action${i}`, target: String(i), detail: '' });
  }
  flushAuditLogs();

  const firstPage = queryAudit({ page: 1, pageSize: 10 });
  assert.equal(firstPage.pagination.total, 12);
  assert.equal(firstPage.pagination.totalPages, 2);
  assert.equal(firstPage.logs.length, 10);
  assert.equal(firstPage.logs[0].action, 'test.action11', '最新记录应排在最前');

  const secondPage = queryAudit({ page: 2, pageSize: 10 });
  assert.equal(secondPage.logs.length, 2);
});

test('每页条数会被收敛到预设值', () => {
  const fallback = queryAudit({ pageSize: 7 });
  assert.equal(fallback.pagination.pageSize, 20);
});

test('过期审计记录可被清理', () => {
  const removed = auditRepo.deleteAuditBefore(Date.now() + 1000);
  assert.ok(removed >= 12);
  assert.equal(auditRepo.countAuditLogs(), 0);
});
