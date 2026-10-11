import * as filesRepo from '../db/repos/files.repo.js';
import * as linksRepo from '../db/repos/links.repo.js';
import { generateCode } from '../core/code.js';
import { checkFilesHealth } from './fileService.js';

export class LinkServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'LinkServiceError';
    this.status = status;
  }
}

function createUniqueCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateCode();
    if (!linksRepo.getLinkByCode(code)) return code;
  }
  throw new LinkServiceError('短码生成失败，请重试', 500);
}

/** 获取已有链接；不存在则创建。返回 { code, sha256, downloadCount, createdAt, isNew } */
export function getOrCreateLink(sha256) {
  const file = filesRepo.getFile(sha256);
  if (!file) throw new LinkServiceError('该 sha256 尚未登记文件', 404);

  const existing = linksRepo.getLinkBySha(sha256);
  if (existing) return { ...existing, isNew: false };

  const code = createUniqueCode();
  const createdAt = Date.now();
  linksRepo.insertLink({ code, sha256, createdAt });
  return { code, sha256, createdAt, downloadCount: 0, isNew: true };
}

/** 重新生成短码：旧短码立即失效，下载计数保留 */
export function refreshLink(sha256) {
  const file = filesRepo.getFile(sha256);
  if (!file) throw new LinkServiceError('该 sha256 尚未登记文件', 404);

  const code = createUniqueCode();
  const createdAt = Date.now();
  const existing = linksRepo.getLinkBySha(sha256);
  if (existing) {
    linksRepo.replaceCode(sha256, code, createdAt);
    return { code, sha256, createdAt, downloadCount: existing.downloadCount, isNew: false };
  }
  linksRepo.insertLink({ code, sha256, createdAt });
  return { code, sha256, createdAt, downloadCount: 0, isNew: true };
}

/** 查询链接信息（附带文件信息） */
export function getLinkInfo(sha256) {
  const file = filesRepo.getFile(sha256);
  if (!file) throw new LinkServiceError('该 sha256 尚未登记文件', 404);
  const link = linksRepo.getLinkBySha(sha256);
  return { file, link };
}

export function listFilesWithLinks() {
  const links = new Map(linksRepo.listLinks().map((link) => [link.sha256, link]));
  return filesRepo.listFiles().map((file) => ({
    ...file,
    code: links.get(file.sha256)?.code ?? null,
    downloadCount: links.get(file.sha256)?.downloadCount ?? 0,
    linkCreatedAt: links.get(file.sha256)?.createdAt ?? null,
  }));
}

/** 允许的每页条数与排序字段 */
const PAGE_SIZES = [10, 20, 50, 100];
const SORT_KEYS = new Set(['added_at', 'size', 'name', 'download_count']);

/** 分页查询文件列表，附带链接信息与磁盘存在性标记 */
export async function queryFilesWithLinks(rawQuery = {}) {
  const page = Math.max(Math.trunc(Number(rawQuery.page) || 1), 1);
  const requested = Math.trunc(Number(rawQuery.pageSize) || 20);
  const pageSize = PAGE_SIZES.includes(requested) ? requested : 20;
  const q = typeof rawQuery.q === 'string' ? rawQuery.q.trim().slice(0, 200) : '';
  const sort = SORT_KEYS.has(rawQuery.sort) ? rawQuery.sort : 'added_at';
  const order = rawQuery.order === 'asc' ? 'asc' : 'desc';

  const { rows, total } = filesRepo.queryFiles({ q, sort, order, page, pageSize });
  const { missing } = await checkFilesHealth();

  return {
    files: rows.map((file) => ({ ...file, missing: missing.has(file.sha256) })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
      pageSizes: PAGE_SIZES,
    },
    missingCount: missing.size,
    filters: { q, sort, order },
  };
}

/** 统计信息（后台首页指标） */
export function getStats() {
  return {
    fileCount: filesRepo.countFiles(),
    linkCount: linksRepo.countLinks(),
    downloadCount: linksRepo.sumDownloads(),
  };
}
