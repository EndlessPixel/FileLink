import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPort, parseHost, parsePort } from '../src/config/cli.js';

test('parsePort 依次读取 --port=、--port、环境变量与默认值', () => {
  assert.equal(parsePort(['--port=8080'], {}), 8080);
  assert.equal(parsePort(['--port', '8081'], {}), 8081);
  assert.equal(parsePort([], { PORT: '9000' }), 9000);
  assert.equal(parsePort([], {}), 3000);
  assert.equal(parsePort(['--port=8080'], { PORT: '9000' }), 8080);
});

test('parsePort 对非法输入返回 NaN', () => {
  assert.ok(Number.isNaN(parsePort(['--port=abc'], {})));
  assert.ok(Number.isNaN(parsePort([], { PORT: 'abc' })));
});

test('isValidPort 限定 1-65535', () => {
  assert.equal(isValidPort(80), true);
  assert.equal(isValidPort(65535), true);
  assert.equal(isValidPort(0), false);
  assert.equal(isValidPort(65536), false);
  assert.equal(isValidPort(Number.NaN), false);
});

test('parseHost 默认 0.0.0.0，可被参数或环境变量覆盖', () => {
  assert.equal(parseHost([], {}), '0.0.0.0');
  assert.equal(parseHost([], { HOST: '127.0.0.1' }), '127.0.0.1');
  assert.equal(parseHost(['--host=127.0.0.1'], { HOST: '0.0.0.0' }), '127.0.0.1');
  assert.equal(parseHost(['--host', '::1'], {}), '::1');
});
