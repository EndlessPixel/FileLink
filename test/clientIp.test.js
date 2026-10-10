import test from 'node:test';
import assert from 'node:assert/strict';
import { getClientIp, isPrivateIp, normalizeIp } from '../src/core/clientIp.js';

function mockReq(remoteAddress, headers = {}) {
  return { socket: { remoteAddress }, headers };
}

test('normalizeIp 剥离 IPv4 映射前缀与 zone id', () => {
  assert.equal(normalizeIp('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(normalizeIp('fe80::1%eth0'), 'fe80::1');
  assert.equal(normalizeIp('  1.2.3.4 '), '1.2.3.4');
  assert.equal(normalizeIp(undefined), '');
});

test('isPrivateIp 识别常见内网与保留段', () => {
  for (const ip of ['10.0.0.1', '172.16.5.4', '192.168.1.1', '127.0.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fc00::1', 'fe80::1']) {
    assert.equal(isPrivateIp(ip), true, `${ip} 应判定为内网`);
  }
  for (const ip of ['8.8.8.8', '203.0.113.9', '2001:4860:4860::8888']) {
    assert.equal(isPrivateIp(ip), false, `${ip} 应判定为公网`);
  }
});

test('公网 remoteAddress 直接采用，忽略伪造头', () => {
  const req = mockReq('203.0.113.9', { 'x-forwarded-for': '1.1.1.1' });
  assert.equal(getClientIp(req), '203.0.113.9');
});

test('内网 remoteAddress 时读取 X-Forwarded-For 最左公网项', () => {
  const req = mockReq('::ffff:127.0.0.1', { 'x-forwarded-for': '10.0.0.5, 198.51.100.7, 172.16.0.1' });
  assert.equal(getClientIp(req), '198.51.100.7');
});

test('XFF 无公网项时回退 X-Real-IP，再回退 remoteAddress', () => {
  const withReal = mockReq('127.0.0.1', { 'x-forwarded-for': '10.0.0.5', 'x-real-ip': '198.51.100.9' });
  assert.equal(getClientIp(withReal), '198.51.100.9');

  const fallback = mockReq('127.0.0.1', {});
  assert.equal(getClientIp(fallback), '127.0.0.1');
});
