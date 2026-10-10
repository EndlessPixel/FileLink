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
