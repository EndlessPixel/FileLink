import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, setValue } from '../src/config/store.js';
import { resetApiWindows } from '../src/core/apiRateLimit.js';
import { resetBuckets } from '../src/core/throttle.js';
import { closeDb, initDb } from '../src/db/index.js';
import * as blacklistRepo from '../src/db/repos/blacklist.repo.js';
import * as filesRepo from '../src/db/repos/files.repo.js';
import * as linksRepo from '../src/db/repos/links.repo.js';
import * as whitelistRepo from '../src/db/repos/whitelist.repo.js';
import { createApp } from '../src/app.js';

const SHA = 'c'.repeat(64);
const CODE = '0123456789abcdef';
const BLOB_SIZE = 64 * 1024;

let server;
let baseUrl;
let tempDir;

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-iprules-'));
  initDb(join(tempDir, 'test.db'));
  loadConfig();

  const filePath = join(tempDir, 'blob.bin');
  writeFileSync(filePath, Buffer.alloc(BLOB_SIZE, 7));

  filesRepo.upsertFile({ sha256: SHA, filePath, size: BLOB_SIZE, addedAt: Date.now() });
  linksRepo.insertLink({ code: CODE, sha256: SHA, createdAt: Date.now() });
  blacklistRepo.loadBlacklistCache();
  whitelistRepo.loadWhitelistCache();

  const app = createApp({ sessionSecret: 'test-secret' });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  resetApiWindows();
  resetBuckets();
  await new Promise((resolve) => server.close(resolve));
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('CIDR 黑名单命中回环地址后返回 403', async () => {
  blacklistRepo.addToBlacklist('127.0.0.0/8', '测试网段', Date.now());

  const res = await fetch(`${baseUrl}/d/${CODE}`);
  assert.equal(res.status, 403);
  await res.text();

  blacklistRepo.removeFromBlacklist('127.0.0.0/8');
});

test('移出 CIDR 黑名单后恢复正常下载', async () => {
  const res = await fetch(`${baseUrl}/d/${CODE}`);
  assert.equal(res.status, 200);
  assert.equal(Number(res.headers.get('content-length')), BLOB_SIZE);

  const body = await res.arrayBuffer();
  assert.equal(body.byteLength, BLOB_SIZE);
});

test('CIDR 规则不会误伤网段外的地址', async () => {
  blacklistRepo.addToBlacklist('198.51.100.0/24', '无关网段', Date.now());

  const res = await fetch(`${baseUrl}/d/${CODE}`);
  assert.equal(res.status, 200);
  await res.arrayBuffer();

  blacklistRepo.removeFromBlacklist('198.51.100.0/24');
});

test('白名单 IP 不受带宽限速约束', async () => {
  // 1 KB/s 的限速下，64KB 需要约 64 秒；白名单应几乎瞬间完成
  setValue('max_speed_bps', '8000');
  whitelistRepo.addToWhitelist('127.0.0.1', '测试豁免', Date.now());

  const startedAt = Date.now();
  const res = await fetch(`${baseUrl}/d/${CODE}`);
  const body = await res.arrayBuffer();
  const elapsed = Date.now() - startedAt;

  assert.equal(res.status, 200);
  assert.equal(body.byteLength, BLOB_SIZE);
  assert.ok(elapsed < 3000, `白名单下载耗时 ${elapsed}ms，不应被限速`);

  whitelistRepo.removeFromWhitelist('127.0.0.1');
  resetBuckets();
  setValue('max_speed_bps', '1000000');
});

test('白名单支持 CIDR 网段判定', () => {
  whitelistRepo.addToWhitelist('10.10.0.0/16', '内网豁免', Date.now());

  assert.equal(whitelistRepo.isWhitelisted('10.10.5.9'), true);
  assert.equal(whitelistRepo.isWhitelisted('10.11.5.9'), false);

  whitelistRepo.removeFromWhitelist('10.10.0.0/16');
  assert.equal(whitelistRepo.isWhitelisted('10.10.5.9'), false);
});
