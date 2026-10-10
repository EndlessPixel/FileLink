import test from 'node:test';
import assert from 'node:assert/strict';
import { contentDisposition, parseRange } from '../src/utils/http.js';

const SIZE = 1000;

test('无 Range 头返回 null（全量 200）', () => {
  assert.equal(parseRange(undefined, SIZE), null);
  assert.equal(parseRange('', SIZE), null);
});

test('标准区间与开放式区间', () => {
  assert.deepEqual(parseRange('bytes=0-499', SIZE), { start: 0, end: 499 });
  assert.deepEqual(parseRange('bytes=500-', SIZE), { start: 500, end: 999 });
  assert.deepEqual(parseRange('bytes=999-2000', SIZE), { start: 999, end: 999 });
});

test('后缀区间', () => {
  assert.deepEqual(parseRange('bytes=-200', SIZE), { start: 800, end: 999 });
  assert.deepEqual(parseRange('bytes=-5000', SIZE), { start: 0, end: 999 });
});

test('非法区间返回 invalid（416）', () => {
  assert.deepEqual(parseRange('items=0-10', SIZE), { invalid: true });
  assert.deepEqual(parseRange('bytes=0-10, 20-30', SIZE), { invalid: true });
  assert.deepEqual(parseRange('bytes=1000-', SIZE), { invalid: true });
  assert.deepEqual(parseRange('bytes=500-100', SIZE), { invalid: true });
  assert.deepEqual(parseRange('bytes=abc-def', SIZE), { invalid: true });
  assert.deepEqual(parseRange('bytes=-0', SIZE), { invalid: true });
  assert.deepEqual(parseRange('bytes=0-10', 0), { invalid: true });
});

test('Content-Disposition 对非 ASCII 文件名使用 filename* 编码', () => {
  const header = contentDisposition('中文 文件.zip');
  assert.match(header, /^attachment;/);
  assert.match(header, /filename\*=UTF-8''/);
  assert.match(header, /%E4%B8%AD%E6%96%87/);
});
