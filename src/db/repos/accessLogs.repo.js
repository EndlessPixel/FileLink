import { all, get, getDb, run } from '../index.js';

const SORT_COLUMNS = {
  created_at: 'created_at',
  duration_ms: 'duration_ms',
  bytes_sent: 'bytes_sent',
};

function toLog(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    ip: row.ip,
    method: row.method,
    path: row.path,
    code: Number(row.code),
    bytesSent: Number(row.bytes_sent),
    durationMs: Number(row.duration_ms),
    ua: row.ua,
    referer: row.referer,
    createdAt: Number(row.created_at),
  };
}

/** 事务批量插入，避免逐条写入放大开销 */
export function insertMany(entries) {
  if (!entries || entries.length === 0) return 0;
  const db = getDb();
  const statement = db.prepare(
    `INSERT INTO access_logs (ip, method, path, code, bytes_sent, duration_ms, ua, referer, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  db.exec('BEGIN');
  try {
    for (const entry of entries) {
      statement.run(
        entry.ip,
        entry.method,
        entry.path,
        entry.code,
        entry.bytesSent,
        entry.durationMs,
        entry.ua,
        entry.referer,
        entry.createdAt
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return entries.length;
}

function buildFilter({ q, from, to, code } = {}) {
  const clauses = [];
  const params = [];

  const keyword = typeof q === 'string' ? q.trim() : '';
  if (keyword !== '') {
    const like = `%${keyword}%`;
    clauses.push('(path LIKE ? OR ip LIKE ? OR method LIKE ?)');
    params.push(like, like, like);
  }
  if (Number.isFinite(from)) {
    clauses.push('created_at >= ?');
    params.push(Math.trunc(from));
  }
  if (Number.isFinite(to)) {
    clauses.push('created_at <= ?');
    params.push(Math.trunc(to));
  }
  if (Number.isInteger(code)) {
    clauses.push('code = ?');
    params.push(code);
  }

  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** 分页查询 */
export function queryLogs({ page = 1, pageSize = 20, sort = 'created_at', order = 'desc', ...filters } = {}) {
  const { sql: where, params } = buildFilter(filters);
  const column = SORT_COLUMNS[sort] ?? 'created_at';
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * pageSize;

  const total = Number(get(`SELECT COUNT(*) AS total FROM access_logs ${where}`, ...params)?.total ?? 0);
  const rows = all(
    `SELECT id, ip, method, path, code, bytes_sent, duration_ms, ua, referer, created_at
     FROM access_logs ${where}
     ORDER BY ${column} ${direction}, id ${direction}
     LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    offset
  );

  return { rows: rows.map(toLog), total };
}

/** 按同一筛选条件导出（不分页，用于 CSV） */
export function streamLogsForExport({ limit = 50000, sort = 'created_at', order = 'desc', ...filters } = {}) {
  const { sql: where, params } = buildFilter(filters);
  const column = SORT_COLUMNS[sort] ?? 'created_at';
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  const rows = all(
    `SELECT id, ip, method, path, code, bytes_sent, duration_ms, ua, referer, created_at
     FROM access_logs ${where}
     ORDER BY ${column} ${direction}, id ${direction}
     LIMIT ?`,
    ...params,
    limit
  );
  return rows.map(toLog);
}

/** 统计卡片数据 */
export function statsLogs(filters = {}) {
  const { sql: where, params } = buildFilter(filters);

  const summary = get(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(bytes_sent), 0) AS bytes,
            COALESCE(SUM(CASE WHEN code = 444 THEN 1 ELSE 0 END), 0) AS disconnects
     FROM access_logs ${where}`,
    ...params
  );

  const topIps = all(
    `SELECT ip, COUNT(*) AS count
     FROM access_logs ${where}
     GROUP BY ip
     ORDER BY count DESC, ip ASC
     LIMIT 5`,
    ...params
  );

  return {
    total: Number(summary?.total ?? 0),
    bytes: Number(summary?.bytes ?? 0),
    disconnects: Number(summary?.disconnects ?? 0),
    topIps: topIps.map((row) => ({ ip: row.ip, count: Number(row.count) })),
  };
}

/** 清理过期日志 */
export function deleteLogsBefore(timestamp) {
  return run('DELETE FROM access_logs WHERE created_at < ?', Math.trunc(timestamp)).changes;
}

export function countLogs() {
  return Number(get('SELECT COUNT(*) AS total FROM access_logs')?.total ?? 0);
}
