import * as filesRepo from '../db/repos/files.repo.js';
import * as linksRepo from '../db/repos/links.repo.js';
import { generateCode } from '../core/code.js';

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

/** 统计信息（后台首页指标） */
export function getStats() {
  return {
    fileCount: filesRepo.countFiles(),
    linkCount: linksRepo.countLinks(),
    downloadCount: linksRepo.sumDownloads(),
  };
}
