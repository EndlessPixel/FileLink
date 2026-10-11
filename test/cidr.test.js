import test from 'node:test';
import assert from 'node:assert/strict';
import { isCidr, matchCidr, parseCidr } from '../src/core/cidr.js';
import { isIpRule } from '../src/utils/validate.js';

test('parseCidr 解析 IPv4 网段', () => {
  const rule = parseCidr('192.168.1.0/24');
  assert.equal(rule.version, 4);
  assert.equal(rule.prefix, 24);
  assert.equal(rule.base, 0xc0a80100n);
});

test('matchCidr 判定 IPv4 命中与不命中', () => {
  assert.equal(matchCidr('192.168.1.55', '192.168.1.0/24'), true);
  assert.equal(matchCidr('192.168.2.1', '192.168.1.0/24'), false);
  assert.equal(matchCidr('10.0.0.1', '10.0.0.1'), true);
  assert.equal(matchCidr('10.0.0.2', '10.0.0.1'), false);
});

test('matchCidr 支持 IPv6 与其内嵌 IPv4 写法', () => {
  assert.equal(matchCidr('2001:db8::1', '2001:db8::/32'), true);
  assert.equal(matchCidr('2001:db9::1', '2001:db8::/32'), false);
  assert.equal(matchCidr('::ffff:192.168.0.5', '::ffff:192.168.0.0/120'), true);

  // 版本不同不应互相匹配
  assert.equal(matchCidr('::ffff:192.168.0.5', '192.168.0.0/24'), false);
});

test('/0 匹配同协议族的任意地址', () => {
  assert.equal(matchCidr('8.8.8.8', '0.0.0.0/0'), true);
  assert.equal(matchCidr('2001:db8::1', '::/0'), true);
});

test('非法规则与非法地址被拒绝', () => {
  assert.equal(parseCidr('192.168.1.0/33'), null);
  assert.equal(parseCidr('999.1.1.1/24'), null);
  assert.equal(parseCidr('abc'), null);
  assert.equal(parseCidr(''), null);
  assert.equal(parseCidr('2001:db8::1/129'), null);

  assert.equal(matchCidr('not-an-ip', '192.168.1.0/24'), false);
  assert.equal(isCidr('192.168.1.0/24'), true);
  assert.equal(isCidr('192.168.1.1'), false);
});

test('isIpRule 同时接受单地址、CIDR 与 IPv6', () => {
  assert.equal(isIpRule('203.0.113.9'), true);
  assert.equal(isIpRule('203.0.113.0/24'), true);
  assert.equal(isIpRule('2001:db8::/32'), true);
  assert.equal(isIpRule('203.0.113.0/33'), false);
  assert.equal(isIpRule('nope'), false);
  assert.equal(isIpRule(''), false);
});
