import { stat } from 'node:fs/promises';
import { normalize } from 'node:path';
import * as filesRepo from '../db/repos/files.repo.js';
import { fileMeta, sha256File } from '../core/hash.js';
import { isSafeAbsolutePath } from '../utils/validate.js';

export class FileServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'FileServiceError';
    this.status = status;
  }
}

/**
 * 通过服务器绝对路径登记文件：校验可读性 → 流式计算 sha256 → 写入映射。
 * 同一文件重复添加视为刷新（按 sha256 去重）。
 */
export async function addFileByPath(rawPath) {
  if (!isSafeAbsolutePath(rawPath)) {
    throw new FileServiceError('必须提供合法的服务器绝对路径');
  }
  const filePath = normalize(String(rawPath).trim());

  let meta;
  try {
    meta = await fileMeta(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') throw new FileServiceError('文件不存在', 404);
    if (err.code === 'EACCES') throw new FileServiceError('文件不可读（权限不足）', 403);
    if (err.code === 'EISDIR') throw new FileServiceError('目标路径是一个目录，不是文件');
    throw new FileServiceError(err.message || '无法读取该文件');
  }

  const sha256 = await sha256File(filePath);

  const existing = filesRepo.getFile(sha256);
  filesRepo.upsertFile({
    sha256,
    filePath,
    size: meta.size,
    addedAt: existing?.addedAt ?? Date.now(),
  });

  return { sha256, filePath, size: meta.size, isNew: !existing, addedAt: existing?.addedAt ?? Date.now() };
}

/** 仅移除数据库映射，不触碰磁盘文件 */
export function removeFile(sha256) {
  const changes = filesRepo.deleteFile(sha256);
  if (changes === 0) throw new FileServiceError('文件记录不存在', 404);
  return true;
}

export function getFile(sha256) {
  const file = filesRepo.getFile(sha256);
  if (!file) throw new FileServiceError('文件记录不存在', 404);
  return file;
}

/** 磁盘存在性检测结果缓存时长：30 秒内重复调用不会重新扫盘 */
const HEALTH_CACHE_MS = 30_000;
/** 并发检测上限，避免文件很多时耗尽文件描述符 */
const HEALTH_CONCURRENCY = 16;

let healthCache = { at: 0, missing: new Set(), checked: 0 };

/**
 * 检测已登记文件在磁盘上是否仍存在。
 * 结果带 30 秒缓存；force 为 true 时强制重新扫描。
 */
export async function checkFilesHealth({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - healthCache.at < HEALTH_CACHE_MS) return healthCache;

  const files = filesRepo.listFiles();
  const missing = new Set();
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor];
      cursor += 1;
      try {
        const info = await stat(file.filePath);
        if (!info.isFile()) missing.add(file.sha256);
      } catch {
        // 文件被移走、改名或权限不足，一律视为失效
        missing.add(file.sha256);
      }
    }
  }

  const workers = Math.min(HEALTH_CONCURRENCY, files.length);
  await Promise.all(Array.from({ length: workers }, worker));

  healthCache = { at: now, missing, checked: files.length };
  return healthCache;
}

/** 批量移除磁盘上已不存在的映射（依然不触碰磁盘文件） */
export async function cleanupMissingFiles() {
  const { missing } = await checkFilesHealth({ force: true });

  const removed = [];
  for (const sha256 of missing) {
    try {
      if (filesRepo.deleteFile(sha256) > 0) removed.push(sha256);
    } catch {
      // 单条失败不影响其余清理
    }
  }

  healthCache = { at: 0, missing: new Set(), checked: 0 };
  return { removed: removed.length, sha256List: removed };
}

/** 测试辅助 */
export function resetHealthCache() {
  healthCache = { at: 0, missing: new Set(), checked: 0 };
}
