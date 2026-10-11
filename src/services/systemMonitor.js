import { readFile, statfs } from 'node:fs/promises';
import os from 'node:os';
import { getNumber } from '../config/store.js';
import logger from '../utils/logger.js';

/**
 * 系统资源采样：磁盘容量、磁盘 IO 速率、内存占用与 CPU 负载。
 * 与 networkMonitor 平行，按固定间隔采样，历史数据仅存于进程内存。
 */

/** 采样间隔（毫秒） */
export const SAMPLE_INTERVAL_MS = 5000;

/** 速率历史保留点数：5s × 360 = 最近 30 分钟 */
export const MAX_SAMPLES = 360;

/** 只统计整块设备，避免分区（sda1）造成重复计数 */
const DEVICE_REGEX = /^(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+)$/;

/** /proc/diskstats 的扇区固定为 512 字节 */
const SECTOR_BYTES = 512;

let points = [];
let lastCounters = null;
let lastCpu = null;

let disks = [];
let memory = null;
let loadInfo = null;
let cpuPercent = 0;
let peakMemoryUsed = 0;

let timer = null;
let supported = true;
let ioSupported = true;
let deviceLabel = '';
let lastError = '';

/**
 * 解析 /proc/diskstats。
 * 每行：major minor name reads_completed reads_merged sectors_read time_reading
 *       writes_completed writes_merged sectors_written ...
 */
export function parseDiskStats(content) {
  const result = [];
  for (const rawLine of String(content ?? '').split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    const parts = line.split(/\s+/);
    if (parts.length < 14) continue;

    const name = parts[2];
    if (!DEVICE_REGEX.test(name)) continue;

    const readSectors = Number(parts[5]);
    const writeSectors = Number(parts[9]);
    if (!Number.isFinite(readSectors) || !Number.isFinite(writeSectors)) continue;

    result.push({
      name,
      read: readSectors * SECTOR_BYTES,
      write: writeSectors * SECTOR_BYTES,
    });
  }
  return result;
}

/** 由累计字节数差值计算读写速率 */
export function computeIoRate(previous, current, elapsedMs) {
  if (!previous || elapsedMs <= 0) return null;
  const seconds = elapsedMs / 1000;
  return {
    read: Math.max(Math.round((current.read - previous.read) / seconds), 0),
    write: Math.max(Math.round((current.write - previous.write) / seconds), 0),
  };
}

/** 由两次 CPU 时间片差值计算占用率（百分比，保留一位小数） */
export function computeCpuPercent(previous, current) {
  if (!previous || !current) return 0;
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (totalDelta <= 0) return 0;
  const used = 1 - idleDelta / totalDelta;
  return Math.min(Math.max(Math.round(used * 1000) / 10, 0), 100);
}

function readCpuTimes() {
  const cpus = os.cpus();
  return cpus.reduce(
    (acc, cpu) => {
      const times = cpu.times ?? {};
      acc.idle += times.idle ?? 0;
      acc.total += (times.user ?? 0) + (times.nice ?? 0) + (times.sys ?? 0) + (times.idle ?? 0) + (times.irq ?? 0);
      return acc;
    },
    { idle: 0, total: 0 }
  );
}

async function readIoSectors() {
  if (process.platform !== 'linux') return null;

  let content;
  try {
    content = await readFile('/proc/diskstats', 'utf8');
  } catch {
    return null;
  }

  const entries = parseDiskStats(content);
  if (entries.length === 0) return null;

  const forced = String(process.env.MONITOR_DISK ?? '').trim();
  const selected = forced ? entries.filter((entry) => entry.name === forced) : entries;
  const list = selected.length > 0 ? selected : entries;

  deviceLabel = list.map((entry) => entry.name).join(', ');
  return list.reduce((acc, entry) => ({ read: acc.read + entry.read, write: acc.write + entry.write }), {
    read: 0,
    write: 0,
  });
}

async function readDisks() {
  const configured = String(process.env.MONITOR_DISK_MOUNTS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const mounts = configured.length > 0 ? configured : [process.cwd(), '/'];

  const seen = new Set();
  const result = [];

  for (const mount of mounts) {
    try {
      const stats = await statfs(mount);
      const total = stats.blocks * stats.bsize;
      if (total <= 0) continue;

      // 同一个文件系统只保留一条记录
      const key = `${total}:${stats.bfree}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const free = stats.bavail * stats.bsize;
      const used = Math.max(total - free, 0);
      result.push({
        mount,
        total,
        used,
        free,
        usedPercent: Math.round((used / total) * 1000) / 10,
      });
    } catch (err) {
      lastError = err.message;
    }
  }
  return result;
}

function readMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(total - free, 0);
  return {
    total,
    free,
    used,
    usedPercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
  };
}

function readLoad() {
  const [avg1 = 0, avg5 = 0, avg15 = 0] = os.loadavg();
  const round = (value) => Math.round(value * 100) / 100;
  return { avg1: round(avg1), avg5: round(avg5), avg15: round(avg15), cores: os.cpus().length };
}

async function sample() {
  const now = Date.now();

  const nextDisks = await readDisks();
  if (nextDisks.length > 0) {
    disks = nextDisks;
    supported = true;
  } else if (disks.length === 0) {
    supported = false;
  }

  memory = readMemory();
  peakMemoryUsed = Math.max(peakMemoryUsed, memory.used);

  loadInfo = readLoad();
  const cpu = readCpuTimes();
  cpuPercent = computeCpuPercent(lastCpu, cpu);
  lastCpu = cpu;

  const counters = await readIoSectors();
  if (!counters) {
    ioSupported = false;
    return;
  }

  ioSupported = true;
  if (lastCounters) {
    const rate = computeIoRate(lastCounters, counters, now - lastCounters.t);
    if (rate) {
      points.push({ t: now, ...rate });
      if (points.length > MAX_SAMPLES) points.splice(0, points.length - MAX_SAMPLES);
    }
  }
  lastCounters = { t: now, ...counters };
}

/** 启动采样（磁盘 IO 依赖 /proc，仅 Linux 可用；容量与内存各平台均可） */
export async function startSystemMonitor() {
  await sample().catch((err) => {
    supported = false;
    lastError = err.message;
    logger.warn(`system monitor unavailable: ${err.message}`);
  });

  timer = setInterval(() => {
    sample().catch((err) => logger.warn(`system sample failed: ${err.message}`));
  }, SAMPLE_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  logger.info(
    `system monitor started (disk io: ${ioSupported ? deviceLabel || 'auto' : 'unavailable'})`
  );
}

export function stopSystemMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** 供管理接口读取的快照 */
export function getSystemSnapshot() {
  const current = points.length > 0 ? points[points.length - 1] : { t: Date.now(), read: 0, write: 0 };
  const peak = points.reduce(
    (acc, point) => ({ read: Math.max(acc.read, point.read), write: Math.max(acc.write, point.write) }),
    { read: 0, write: 0 }
  );

  const empty = { total: 0, free: 0, used: 0, usedPercent: 0 };

  return {
    supported,
    error: lastError || null,
    intervalMs: SAMPLE_INTERVAL_MS,
    windowSamples: MAX_SAMPLES,
    alertPercent: getNumber('disk_alert_percent'),
    disks,
    io: {
      supported: ioSupported,
      devices: deviceLabel,
      points,
      current,
      peak,
    },
    memory: memory ? { ...memory, peakUsed: peakMemoryUsed } : { ...empty, peakUsed: 0 },
    load: { ...(loadInfo ?? { avg1: 0, avg5: 0, avg15: 0, cores: 1 }), cpuPercent },
    uptimeSeconds: Math.round(os.uptime()),
  };
}

/** 测试辅助 */
export function resetSystemMonitor() {
  points = [];
  lastCounters = null;
  lastCpu = null;
  disks = [];
  memory = null;
  loadInfo = null;
  cpuPercent = 0;
  peakMemoryUsed = 0;
  supported = true;
  ioSupported = true;
  deviceLabel = '';
  lastError = '';
}
