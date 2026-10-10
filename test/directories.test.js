import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DIRECTORY_CACHE_LIMIT,
  directoryCacheSize,
  invalidateCache,
  listDirectory,
  normalizeBrowsePath,
  resetDirectoryCache,
} from '../src/services/directoryService.js';

let root;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'filelink-dir-'));
  mkdirSync(join(root, 'alpha'));
  mkdirSync(join(root, 'beta'));
  writeFileSync(join(root, 'file.txt'), 'hello');
  writeFileSync(join(root, 'alpha', 'inner.txt'), 'x');
  symlinkSync(join(root, 'alpha'), join(root, 'alpha-link'), 'dir');
  symlinkSync(join(root, 'file.txt'), join(root, 'file-link.txt'), 'file');
  resetDirectoryCache();
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

test('normalizeBrowsePath 规范化并拒绝非法输入', () => {
  assert.equal(normalizeBrowsePath('/'), '/');
  assert.equal(normalizeBrowsePath('/a/../b'), '/b');
  assert.equal(normalizeBrowsePath('  /var/log  '), '/var/log');
  assert.equal(normalizeBrowsePath('relative/path'), '');
  assert.equal(normalizeBrowsePath(''), '');
  assert.equal(normalizeBrowsePath('abc\0def'), '');
  assert.equal(normalizeBrowsePath(123), '');
});

test('listDirectory 返回目录与文件，符号链接被跳过', async () => {
  const result = await listDirectory(root);
  assert.equal(result.path, root);
  assert.equal(result.cached, false);
  assert.ok(Number.isFinite(result.mtime));

  const dirNames = result.directories.map((d) => d.name);
  const fileNames = result.files.map((f) => f.name);
  assert.deepEqual(dirNames, ['alpha', 'beta']);
  assert.deepEqual(fileNames, ['file.txt']);
  assert.ok(!dirNames.includes('alpha-link'), '目录符号链接应被跳过');
  assert.ok(!fileNames.includes('file-link.txt'), '文件符号链接应被跳过');

  const file = result.files[0];
  assert.equal(file.path, join(root, 'file.txt'));
  assert.equal(file.size, 5);
});

test('命中缓存时第二次返回 cached: true，mtime 变化后重新扫描', async () => {
  resetDirectoryCache();
  const first = await listDirectory(root);
  assert.equal(first.cached, false);

  const second = await listDirectory(root);
  assert.equal(second.cached, true);

  // 显式修改目录 mtime，应触发重新扫描
  const later = new Date(Date.now() + 10_000);
  utimesSync(root, later, later);
  const third = await listDirectory(root);
  assert.equal(third.cached, false);

  const fourth = await listDirectory(root);
  assert.equal(fourth.cached, true);
});

test('invalidateCache 强制下次重新扫描', async () => {
  await listDirectory(root);
  const cached = await listDirectory(root);
  assert.equal(cached.cached, true);

  const result = invalidateCache(root);
  assert.equal(result.invalidated, true);
  assert.equal(result.path, root);

  const again = await listDirectory(root);
  assert.equal(again.cached, false);

  // 对未被缓存的键失效返回 false，不存在的路径也不报错
  assert.equal(invalidateCache('/tmp/definitely-not-cached-path-xyz').invalidated, false);
  assert.equal(invalidateCache('not-a-path').invalidated, false);
});

test('非法路径与不存在的目录返回可预期错误', async () => {
  await assert.rejects(() => listDirectory('relative'), /绝对路径/);
  await assert.rejects(() => listDirectory(''), /绝对路径/);
  await assert.rejects(() => listDirectory(join(root, 'no-such-dir')), (err) => {
    assert.equal(err.status, 404);
    return true;
  });
  await assert.rejects(() => listDirectory(join(root, 'file.txt')), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
});

test(`缓存 LRU 上限为 ${DIRECTORY_CACHE_LIMIT} 条`, async () => {
  resetDirectoryCache();
  const manyRoot = join(root, 'many');
  mkdirSync(manyRoot);
  for (let i = 0; i < DIRECTORY_CACHE_LIMIT + 5; i += 1) {
    const dir = join(manyRoot, `d${i}`);
    mkdirSync(dir);
    await listDirectory(dir);
  }
  assert.ok(directoryCacheSize() <= DIRECTORY_CACHE_LIMIT);
});
