import { all, get, getDb, run } from '../index.js';

function toEntry(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    ip: row.ip,
    action: row.action,
    target: row.target,
    detail: row.detail,
    createdAt: Number(row.created_at),
  };
}

/** 事务批量插入，避免逐条写入放大开销 */
export function insertMany(entries) {
  if (!entries || entries.length === 0) return 0;
  const db = getDb();
  const statement = db.prepare(
    `INSERT INTO audit_logs (ip, action, target, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );

  db.exec('BEGIN');
  try {
    for (const entry of entries) {
      statement.run(entry.ip, entry.action, entry.target, entry.detail, entry.createdAt);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return entries.length;
}

function buildFilter({ q, action } = {}) {
  const clauses = [];
  const params = [];

  const keyword = typeof q === 'string' ? q.trim() : '';
  if (keyword !== '') {
    const like = `%${keyword.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    clauses.push("(target LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\' OR ip LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }
  if (typeof action === 'string' && action.trim() !== '') {
    clauses.push('action = ?');
    params.push(action.trim());
  }

  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function queryAuditLogs({ page = 1, pageSize = 20, ...filters } = {}) {
  const { sql: where, params } = buildFilter(filters);
  const offset = (Math.max(page, 1) - 1) * pageSize;

  const total = Number(get(`SELECT COUNT(*) AS total FROM audit_logs ${where}`, ...params)?.total ?? 0);
  const rows = all(
    `SELECT id, ip, action, target, detail, created_at
     FROM audit_logs ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    offset
  );

  return { rows: rows.map(toEntry), total };
}

/** 出现过的操作类型，供前端筛选下拉使用 */
export function listAuditActions() {
  return all('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC').map((row) => row.action);
}

export function deleteAuditBefore(timestamp) {
  return run('DELETE FROM audit_logs WHERE created_at < ?', Math.trunc(timestamp)).changes;
}

export function countAuditLogs() {
  return Number(get('SELECT COUNT(*) AS total FROM audit_logs')?.total ?? 0);
}
