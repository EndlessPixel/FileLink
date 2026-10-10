import { readFile } from 'node:fs/promises';
import logger from '../utils/logger.js';

/** 采样间隔（毫秒） */
export const SAMPLE_INTERVAL_MS = 5000;

/** 保留的最大样本数：5s × 360 = 最近 30 分钟 */
export const MAX_SAMPLES = 360;

/** 速率历史：[{ t, rx, tx }]，单位 bytes/s */
let samples = [];
/** 上一次的累计计数器，用于求差分 */
let lastCounters = null;
/** 最近一次读到的网卡累计值 */
let lastTotal = { rx: 0, tx: 0 };

let timer = null;
let interfaceName = '';
let supported = true;

/**
 * 解析 /proc/net/dev，返回 [{ name, rx, tx }]（已跳过 lo 与表头）。
 * 每行格式：iface: rx_bytes rx_packets ... tx_bytes ...
 */
export function parseProcNetDev(content) {
  const result = [];
  for (const rawLine of String(content ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line.includes(':')) continue;
    const [namePart, rest] = line.split(':');
    const name = namePart.trim();
    if (!name || name === 'lo') continue;
    const fields = rest.trim().split(/\s+/).map(Number);
    if (fields.length < 9 || !Number.isFinite(fields[0]) || !Number.isFinite(fields[8])) continue;
    result.push({ name, rx: fields[0], tx: fields[8] });
  }
  return result;
}

/** 解析 /proc/net/route，取默认路由（Destination 为 00000000）的接口名 */
export function parseDefaultRoute(content) {
  for (const rawLine of String(content ?? '').split('\n').slice(1)) {
    const parts = rawLine.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === '00000000' && parts[0]) return parts[0];
  }
  return '';
}

/** 根据累计计数器差值计算速率并写入历史 */
export function computeRate(previous, current, elapsedMs) {
  if (!previous || elapsedMs <= 0) return null;
  const elapsedSeconds = elapsedMs / 1000;
  return {
    rx: Math.max(Math.round((current.rx - previous.rx) / elapsedSeconds), 0),
    tx: Math.max(Math.round((current.tx - previous.tx) / elapsedSeconds), 0),
  };
}

async function readCounters() {
  const content = await readFile('/proc/net/dev', 'utf8');
  const entries = parseProcNetDev(content);
  if (entries.length === 0) return null;

  if (interfaceName) {
    const found = entries.find((entry) => entry.name === interfaceName);
    if (found) return { rx: found.rx, tx: found.tx };
  }
  // 未指定接口或找不到时，累加全部非 lo 接口
  return entries.reduce((acc, entry) => ({ rx: acc.rx + entry.rx, tx: acc.tx + entry.tx }), {
    rx: 0,
    tx: 0,
  });
}

async function detectInterface() {
  if (process.env.MONITOR_INTERFACE) return process.env.MONITOR_INTERFACE;
  try {
    return parseDefaultRoute(await readFile('/proc/net/route', 'utf8'));
  } catch {
    return '';
  }
}

async function sample() {
  const counters = await readCounters();
  if (!counters) {
    supported = false;
    return;
  }

  const now = Date.now();
  lastTotal = counters;

  if (lastCounters) {
    const rate = computeRate(lastCounters, counters, now - lastCounters.t);
    if (rate) {
      samples.push({ t: now, ...rate });
      if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
    }
  }
  lastCounters = { t: now, ...counters };
}

/** 启动采样：仅在 Linux 上可用（依赖 /proc） */
export async function startNetworkMonitor() {
  if (process.platform !== 'linux') {
    supported = false;
    logger.info('network monitor disabled: /proc is only available on Linux');
    return;
  }

  interfaceName = await detectInterface();
  await sample(); // 建立第一个基准点
  timer = setInterval(() => {
    sample().catch((err) => logger.warn(`network sample failed: ${err.message}`));
  }, SAMPLE_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  logger.info(`network monitor started on ${interfaceName || '(all non-lo interfaces)'}`);
}

export function stopNetworkMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** 供管理接口读取的快照 */
export function getNetworkSnapshot() {
  const current =
    samples.length > 0 ? samples[samples.length - 1] : { t: Date.now(), rx: 0, tx: 0 };
  const peak = samples.reduce(
    (acc, point) => ({ rx: Math.max(acc.rx, point.rx), tx: Math.max(acc.tx, point.tx) }),
    { rx: 0, tx: 0 }
  );
  return {
    supported,
    interface: interfaceName,
    intervalMs: SAMPLE_INTERVAL_MS,
    windowSamples: MAX_SAMPLES,
    points: samples,
    current,
    peak,
    counters: lastTotal,
  };
}

/** 测试辅助 */
export function resetNetworkMonitor() {
  samples = [];
  lastCounters = null;
  lastTotal = { rx: 0, tx: 0 };
  supported = true;
}
