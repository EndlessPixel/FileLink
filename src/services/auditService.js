import * as auditRepo from '../db/repos/auditLogs.repo.js';
import logger from '../utils/logger.js';

/** 队列刷新间隔：合并写入，避免每个管理请求都落一次库 */
const FLUSH_INTERVAL_MS = 1000;
/** 队列长度达到阈值立即刷新 */
const MAX_QUEUE = 100;

/** 允许前端请求的每页条数 */
const PAGE_SIZES = [10, 20, 50, 100];

let queue = [];
let timer = null;

/**
 * 记录一次管理操作。
 * 同步入队后立即返回，不触碰数据库，因此不给请求增加 IO 等待。
 * 注意：调用方绝不能把密码等敏感值放进 detail。
 */
export function recordAudit({ ip, action, target = '', detail = '' } = {}) {
  if (!action) return;
  queue.push({
    ip: String(ip ?? '').slice(0, 64),
    action: String(action).slice(0, 64),
    target: String(target ?? '').slice(0, 200),
    detail: String(detail ?? '').slice(0, 500),
    createdAt: Date.now(),
  });

  if (queue.length >= MAX_QUEUE) setImmediate(flushAuditLogs);
}

/** 批量落库，出错只记日志不影响业务 */
export function flushAuditLogs() {
  if (queue.length === 0) return 0;
  const batch = queue;
  queue = [];
  try {
    return auditRepo.insertMany(batch);
  } catch (err) {
    logger.error(`failed to persist ${batch.length} audit log(s): ${err.message}`);
    return 0;
  }
}

export function startAuditWriter() {
  if (timer) return;
  timer = setInterval(flushAuditLogs, FLUSH_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopAuditWriter() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  flushAuditLogs();
}

/** 分页查询审计记录 */
export function queryAudit(rawQuery = {}) {
  const page = Math.max(Math.trunc(Number(rawQuery.page) || 1), 1);
  const requested = Math.trunc(Number(rawQuery.pageSize) || 20);
  const pageSize = PAGE_SIZES.includes(requested) ? requested : 20;
  const q = typeof rawQuery.q === 'string' ? rawQuery.q.trim().slice(0, 200) : '';
  const action = typeof rawQuery.action === 'string' ? rawQuery.action.trim().slice(0, 64) : '';

  const { rows, total } = auditRepo.queryAuditLogs({ page, pageSize, q, action });

  return {
    logs: rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
      pageSizes: PAGE_SIZES,
    },
    actions: auditRepo.listAuditActions(),
    filters: { q, action },
  };
}

/** 测试辅助 */
export function resetAuditQueue() {
  queue = [];
}
