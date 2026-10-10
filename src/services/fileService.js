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
