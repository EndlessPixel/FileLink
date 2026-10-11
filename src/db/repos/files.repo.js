import { all, get, run } from '../index.js';

function toFile(row) {
  if (!row) return null;
  return {
    sha256: row.sha256,
    filePath: row.file_path,
    size: Number(row.size),
    addedAt: Number(row.added_at),
  };
}

/** 登记文件；已存在时刷新路径与大小（保留原 added_at） */
export function upsertFile({ sha256, filePath, size, addedAt }) {
  run(
    `INSERT INTO files (sha256, file_path, size, added_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(sha256) DO UPDATE SET file_path = excluded.file_path, size = excluded.size`,
    sha256,
    filePath,
    Math.trunc(size),
    Math.trunc(addedAt)
  );
}

export function getFile(sha256) {
  return toFile(get('SELECT sha256, file_path, size, added_at FROM files WHERE sha256 = ?', sha256));
}

export function listFiles() {
  return all('SELECT sha256, file_path, size, added_at FROM files ORDER BY added_at DESC').map(toFile);
}

export function deleteFile(sha256) {
  return run('DELETE FROM files WHERE sha256 = ?', sha256).changes;
}

export function countFiles() {
  const row = get('SELECT COUNT(*) AS total FROM files');
  return Number(row?.total ?? 0);
}

/** 排序字段白名单：杜绝把用户输入拼进 ORDER BY */
const SORT_COLUMNS = {
  added_at: 'f.added_at',
  size: 'f.size',
  name: 'f.file_path',
  download_count: 'l.download_count',
};

/** LIKE 通配符转义，避免用户输入的 % 与 _ 变成模糊匹配 */
function escapeLike(text) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 分页查询文件（LEFT JOIN links 以支持按下载次数排序与按短码搜索） */
export function queryFiles({ q = '', sort = 'added_at', order = 'desc', page = 1, pageSize = 20 } = {}) {
  const column = SORT_COLUMNS[sort] ?? 'f.added_at';
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  const keyword = typeof q === 'string' ? q.trim() : '';

  const clauses = [];
  const params = [];
  if (keyword !== '') {
    const like = `%${escapeLike(keyword)}%`;
    clauses.push(
      "(f.file_path LIKE ? ESCAPE '\\' OR f.sha256 LIKE ? ESCAPE '\\' OR l.code LIKE ? ESCAPE '\\')"
    );
    params.push(like, like, like);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const join = 'FROM files f LEFT JOIN links l ON l.sha256 = f.sha256';

  const total = Number(get(`SELECT COUNT(*) AS total ${join} ${where}`, ...params)?.total ?? 0);
  const rows = all(
    `SELECT f.sha256, f.file_path, f.size, f.added_at,
            l.code, l.created_at AS link_created_at, l.download_count
     ${join} ${where}
     ORDER BY ${column} ${direction}, f.sha256 ASC
     LIMIT ? OFFSET ?`,
    ...params,
    Math.max(Math.trunc(pageSize) || 20, 1),
    (Math.max(Math.trunc(page) || 1, 1) - 1) * (Math.max(Math.trunc(pageSize) || 20, 1))
  );

  return {
    rows: rows.map((row) => ({
      sha256: row.sha256,
      filePath: row.file_path,
      size: Number(row.size),
      addedAt: Number(row.added_at),
      code: row.code ?? null,
      downloadCount: Number(row.download_count ?? 0),
      linkCreatedAt: row.link_created_at === null || row.link_created_at === undefined
        ? null
        : Number(row.link_created_at),
    })),
    total,
  };
}
