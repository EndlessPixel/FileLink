import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRate,
  parseDefaultRoute,
  parseProcNetDev,
} from '../src/services/networkMonitor.js';

const PROC_NET_DEV = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1000000    1000    0    0    0     0          0         0  1000000    1000    0    0    0     0       0          0
  eth0: 5000000    4000    0    0    0     0          0         0  2000000    3000    0    0    0     0       0          0
docker0:  800000     900    0    0    0     0          0         0   400000     800    0    0    0     0       0          0
`;

const PROC_NET_ROUTE = `Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT
eth0\t00000000\t0101A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0
eth0\t0001A8C0\t00000000\t0001\t0\t0\t100\t00FFFFFF\t0\t0\t0
`;

test('parseProcNetDev 跳过表头与 lo，字段位置正确', () => {
  const entries = parseProcNetDev(PROC_NET_DEV);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { name: 'eth0', rx: 5000000, tx: 2000000 });
  assert.deepEqual(entries[1], { name: 'docker0', rx: 800000, tx: 400000 });
});

test('parseProcNetDev 对空内容与异常行不报错', () => {
  assert.deepEqual(parseProcNetDev(''), []);
  assert.deepEqual(parseProcNetDev(undefined), []);
  assert.deepEqual(parseProcNetDev('garbage line without colon'), []);
  assert.deepEqual(parseProcNetDev('eth0: 1 2 3'), []);
});

test('parseDefaultRoute 取默认路由接口', () => {
  assert.equal(parseDefaultRoute(PROC_NET_ROUTE), 'eth0');
  assert.equal(parseDefaultRoute(''), '');
  assert.equal(parseDefaultRoute('Iface\tDestination\n'), '');
});

test('computeRate 按时间差计算速率', () => {
  const rate = computeRate({ rx: 1000, tx: 500 }, { rx: 3000, tx: 1500 }, 2000);
  assert.deepEqual(rate, { rx: 1000, tx: 500 });
});

test('computeRate 对计数器回绕与非法间隔返回 0 而不是负数', () => {
  const wrapped = computeRate({ rx: 9000, tx: 9000 }, { rx: 100, tx: 100 }, 1000);
  assert.deepEqual(wrapped, { rx: 0, tx: 0 });
  assert.equal(computeRate(null, { rx: 1, tx: 1 }, 1000), null);
  assert.equal(computeRate({ rx: 0, tx: 0 }, { rx: 1, tx: 1 }, 0), null);
});
