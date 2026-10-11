import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/store.js';
import { closeDb, initDb } from '../src/db/index.js';
import * as filesRepo from '../src/db/repos/files.repo.js';
import * as linksRepo from '../src/db/repos/links.repo.js';
import { cleanupMissingFiles, resetHealthCache } from '../src/services/fileService.js';
import { queryFilesWithLinks } from '../src/services/linkService.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64); // 对应文件不在磁盘上
const SHA_C = 'c'.repeat(64);

let tempDir;

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-filequery-'));
  initDb(join(tempDir, 'test.db'));
  loadConfig();

  writeFileSync(join(tempDir, 'alpha.bin'), Buffer.alloc(1024));
  writeFileSync(join(tempDir, 'gamma.bin'), Buffer.alloc(4096));

  const now = Date.now();
  filesRepo.upsertFile({ sha256: SHA_A, filePath: join(tempDir, 'alpha.bin'), size: 1024, addedAt: now - 3000 });
  filesRepo.upsertFile({ sha256: SHA_B, filePath: join(tempDir, 'beta-missing.bin'), size: 2048, addedAt: now - 2000 });
  filesRepo.upsertFile({ sha256: SHA_C, filePath: join(tempDir, 'gamma.bin'), size: 4096, addedAt: now - 1000 });

  linksRepo.insertLink({ code: '1111111111111111', sha256: SHA_A, createdAt: now });
  linksRepo.insertLink({ code: '2222222222222222', sha256: SHA_C, createdAt: now });
});

after(() => {
  resetHealthCache();
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('queryFilesWithLinks 支持分页与总数', async () => {
  resetHealthCache();
  const result = await queryFilesWithLinks({ page: 1, pageSize: 10 });

  assert.equal(result.files.length, 3);
  assert.equal(result.pagination.total, 3);
  assert.equal(result.pagination.totalPages, 1);
  assert.ok(result.files[0].code, '应带上短码信息');
});

test('超出范围的页码返回空列表，非法每页条数回退默认值', async () => {
  resetHealthCache();
  const beyond = await queryFilesWithLinks({ page: 5, pageSize: 10 });
  assert.equal(beyond.files.length, 0);
  assert.equal(beyond.pagination.total, 3);

  const fallback = await queryFilesWithLinks({ pageSize: 999 });
  assert.equal(fallback.pagination.pageSize, 20);
});

test('按文件名关键词搜索', async () => {
  resetHealthCache();
  const result = await queryFilesWithLinks({ q: 'gamma' });

  assert.equal(result.pagination.total, 1);
  assert.equal(result.files[0].sha256, SHA_C);
});

test('LIKE 通配符被转义，不会匹配全部', async () => {
  resetHealthCache();
  const result = await queryFilesWithLinks({ q: '%' });
  assert.equal(result.pagination.total, 0);
});

test('支持按大小与下载次数排序', async () => {
  resetHealthCache();
  const bySize = await queryFilesWithLinks({ sort: 'size', order: 'desc' });
  assert.deepEqual(bySize.files.map((file) => file.size), [4096, 2048, 1024]);

  resetHealthCache();
  const byName = await queryFilesWithLinks({ sort: 'name', order: 'asc' });
  assert.equal(byName.files[0].sha256, SHA_A);
});

test('失效映射被标记，且可一键清理', async () => {
  resetHealthCache();

  const before = await queryFilesWithLinks({});
  assert.equal(before.missingCount, 1);
  assert.equal(before.files.find((file) => file.missing)?.sha256, SHA_B);

  const cleaned = await cleanupMissingFiles();
  assert.equal(cleaned.removed, 1);
  assert.deepEqual(cleaned.sha256List, [SHA_B]);

  const after = await queryFilesWithLinks({});
  assert.equal(after.pagination.total, 2);
  assert.equal(after.missingCount, 0);
});
