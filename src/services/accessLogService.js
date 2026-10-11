import * as logRepo from '../db/repos/accessLogs.repo.js';
import logger from '../utils/logger.js';

/** 队列刷新间隔：合并写入，避免每个请求都落一次库 */
const FLUSH_INTERVAL_MS = 1000;
/** 队列长度达到阈值立即刷新 */
const MAX_QUEUE = 200;
/** 文本字段最大长度 */
const MAX_TEXT = 512;
/** 允许的每页条数 */
const PAGE_SIZES = [10, 20, 50, 100];
/** 单次导出上限 */
const EXPORT_LIMIT = 50000;

let queue = [];
let timer = null;

/**
 * 记录一次下载请求。同步入队后立即返回，不触碰数据库，
 * 因此不会给响应增加任何 IO 等待。
 */
export function recordAccess(entry = {}) {
  queue.push({
    ip: String(entry.ip ?? '').slice(0, 64),
    method: String(entry.method ?? 'GET').slice(0, 10),
    path: String(entry.path ?? '').slice(0, MAX_TEXT),
    code: Math.trunc(Number(entry.code) || 0),
    bytesSent: Math.max(Math.trunc(Number(entry.bytesSent) || 0), 0),
    durationMs: Math.max(Math.trunc(Number(entry.durationMs) || 0), 0),
    ua: String(entry.ua ?? '').slice(0, MAX_TEXT),
    referer: String(entry.referer ?? '').slice(0, MAX_TEXT),
    createdAt: Math.trunc(Number(entry.createdAt) || Date.now()),
  });

  if (queue.length >= MAX_QUEUE) setImmediate(flushAccessLogs);
}

/** 批量落库，出错只记日志不影响业务 */
export function flushAccessLogs() {
  if (queue.length === 0) return 0;
  const batch = queue;
  queue = [];
  try {
    return logRepo.insertMany(batch);
  } catch (err) {
    logger.error(`failed to persist ${batch.length} access log(s): ${err.message}`);
    return 0;
  }
}

export function startAccessLogWriter() {
  if (timer) return;
  timer = setInterval(flushAccessLogs, FLUSH_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopAccessLogWriter() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  flushAccessLogs();
}

/** 解析并收敛查询参数 */
export function parseLogQuery(query = {}) {
  const page = Math.max(Math.trunc(Number(query.page) || 1), 1);
  const requestedSize = Math.trunc(Number(query.pageSize) || 20);
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 20;

  const from = toTimestamp(query.from);
  const to = toTimestamp(query.to);
  const code = /^\d{3}$/.test(String(query.code ?? '')) ? Number(query.code) : undefined;
  const sort = ['created_at', 'duration_ms', 'bytes_sent'].includes(query.sort) ? query.sort : 'created_at';
  const order = query.order === 'asc' ? 'asc' : 'desc';
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 200) : '';

  return { page, pageSize, q, from, to, code, sort, order };
}

function toTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

/** 分页查询 + 同条件统计 */
export function queryAccessLogs(rawQuery) {
  const params = parseLogQuery(rawQuery);
  const { rows, total } = logRepo.queryLogs(params);
  const totalPages = Math.max(Math.ceil(total / params.pageSize), 1);

  return {
    logs: rows,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages,
      pageSizes: PAGE_SIZES,
    },
    stats: logRepo.statsLogs(params),
    filters: {
      q: params.q,
      from: params.from ?? null,
      to: params.to ?? null,
      code: params.code ?? null,
      sort: params.sort,
      order: params.order,
    },
  };
}

/** 趋势图数据：按天聚合，缺失日期补零以保证折线连续 */
export function queryTrend(rawQuery = {}) {
  const parsed = Math.trunc(Number(rawQuery.days));
  const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 90) : 14;
  const rows = logRepo.dailyTrend(days);
  const byDay = new Map(rows.map((row) => [row.day, row]));

  const today = new Date();
  const points = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = formatDayKey(date);
    const row = byDay.get(key);
    points.push({
      day: key,
      requests: row?.requests ?? 0,
      downloads: row?.downloads ?? 0,
      bytes: row?.bytes ?? 0,
    });
  }

  const totals = points.reduce(
    (acc, item) => ({
      requests: acc.requests + item.requests,
      downloads: acc.downloads + item.downloads,
      bytes: acc.bytes + item.bytes,
    }),
    { requests: 0, downloads: 0, bytes: 0 }
  );

  return { days, points, totals };
}

function formatDayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 按同一筛选条件导出 CSV（带 BOM，Excel 可直接打开） */
export function exportAccessLogsCsv(rawQuery) {
  const params = parseLogQuery(rawQuery);
  const rows = logRepo.streamLogsForExport({ ...params, limit: EXPORT_LIMIT });
  return { csv: buildCsv(rows), count: rows.length };
}

const CSV_HEADERS = ['时间', 'IP', '方法', '路径', '状态码', '耗时(ms)', '字节数', 'User-Agent', 'Referer'];

function buildCsv(rows) {
  const lines = [CSV_HEADERS.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(
      [
        new Date(row.createdAt).toISOString(),
        row.ip,
        row.method,
        row.path,
        row.code,
        row.durationMs,
        row.bytesSent,
        row.ua,
        row.referer,
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** 转义单元格，并阻止 Excel 把 = + - @ 开头的值当公式执行 */
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** 测试辅助 */
export function resetAccessLogQueue() {
  queue = [];
}
