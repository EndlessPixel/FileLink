import { all, get, run } from '../index.js';

function toLink(row) {
  if (!row) return null;
  return {
    code: row.code,
    sha256: row.sha256,
    createdAt: Number(row.created_at),
    downloadCount: Number(row.download_count),
  };
}

export function getLinkByCode(code) {
  return toLink(
    get('SELECT code, sha256, created_at, download_count FROM links WHERE code = ?', code)
  );
}

export function getLinkBySha(sha256) {
  return toLink(
    get('SELECT code, sha256, created_at, download_count FROM links WHERE sha256 = ?', sha256)
  );
}

export function insertLink({ code, sha256, createdAt }) {
  run(
    'INSERT INTO links (code, sha256, created_at, download_count) VALUES (?, ?, ?, 0)',
    code,
    sha256,
    Math.trunc(createdAt)
  );
}

/** 为已有文件更换短码，下载计数保留 */
export function replaceCode(sha256, code, createdAt) {
  return run(
    'UPDATE links SET code = ?, created_at = ? WHERE sha256 = ?',
    code,
    Math.trunc(createdAt),
    sha256
  ).changes;
}

export function incrementDownload(sha256) {
  run('UPDATE links SET download_count = download_count + 1 WHERE sha256 = ?', sha256);
}

export function listLinks() {
  return all('SELECT code, sha256, created_at, download_count FROM links ORDER BY created_at DESC').map(
    toLink
  );
}

export function deleteLinkBySha(sha256) {
  return run('DELETE FROM links WHERE sha256 = ?', sha256).changes;
}

export function countLinks() {
  const row = get('SELECT COUNT(*) AS total FROM links');
  return Number(row?.total ?? 0);
}

export function sumDownloads() {
  const row = get('SELECT COALESCE(SUM(download_count), 0) AS total FROM links');
  return Number(row?.total ?? 0);
}
