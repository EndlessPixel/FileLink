import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import logger from '../utils/logger.js';

/** 缓存 TTL 兜底（毫秒）：即使 mtime 未变也最多用 5 分钟 */
const TTL_MS = 5 * 60 * 1000;

/** LRU 上限 */
const MAX_ENTRIES = 200;

/** path -> { mtime, cachedAt, data }；Map 的插入顺序即 LRU 顺序（旧在前） */
const cache = new Map();

export class DirectoryServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'DirectoryServiceError';
    this.status = status;
  }
}

/** 路径遍历防护：必须能解析为合法绝对路径，拒绝空字节与非法输入 */
export function normalizeBrowsePath(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.includes('\0')) return '';
  if (!isAbsolute(trimmed)) return '';
  const resolved = resolve(trimmed);
  return isAbsolute(resolved) ? resolved : '';
}

function byName(a, b) {
  const aHidden = a.name.startsWith('.');
  const bHidden = b.name.startsWith('.');
  if (aHidden !== bHidden) return aHidden ? 1 : -1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
}

/** 扫描目录（不跟随符号链接，符号链接项直接跳过），返回 { mtime, data } */
async function scanDirectory(dirPath) {
  const dirInfo = await lstat(dirPath);
  if (dirInfo.isSymbolicLink()) {
    const err = new Error('符号链接路径不支持浏览');
    err.code = 'ENOLINK';
    throw err;
  }
  if (!dirInfo.isDirectory()) {
    const err = new Error('路径不是一个目录');
    err.code = 'ENOTDIR';
    throw err;
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const directories = [];
  const files = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const childPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      directories.push({ name: entry.name, path: childPath });
    } else if (entry.isFile()) {
      files.push({ name: entry.name, path: childPath, size: 0 });
    }
  }

  // 补文件大小，lstat 不跟随符号链接
  for (const file of files) {
    try {
      file.size = (await lstat(file.path)).size;
    } catch {
      file.size = 0;
    }
  }

  directories.sort(byName);
  files.sort(byName);

  return { mtime: dirInfo.mtimeMs, data: { directories, files } };
}

function bumpToMostRecent(path, entry) {
  cache.delete(path);
  cache.set(path, entry);
}

function trimIfNeeded() {
  while (cache.size > MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

/**
 * 带缓存的目录浏览：
 * 命中缓存且目录 mtime 未变、未超过 TTL 时直接返回缓存；否则重新扫描并更新缓存。
 * 返回 { path, directories, files, cached, mtime }。
 */
export async function listDirectory(rawPath) {
  const dirPath = normalizeBrowsePath(rawPath);
  if (!dirPath) throw new DirectoryServiceError('必须提供合法的绝对路径', 400);

  const now = Date.now();
  const cached = cache.get(dirPath);

  let currentMtime = null;
  try {
    currentMtime = (await lstat(dirPath)).mtimeMs;
  } catch {
    currentMtime = null;
  }

  if (cached && currentMtime !== null) {
    const fresh = cached.mtime === currentMtime && now - cached.cachedAt < TTL_MS;
    if (fresh) {
      bumpToMostRecent(dirPath, cached);
      return { path: dirPath, ...cached.data, cached: true, mtime: cached.mtime };
    }
  }

  let scanned;
  try {
    scanned = await scanDirectory(dirPath);
  } catch (err) {
    if (err.code === 'ENOENT') throw new DirectoryServiceError('目录不存在', 404);
    if (err.code === 'EACCES' || err.code === 'EPERM') throw new DirectoryServiceError('没有权限访问该目录', 403);
    if (err.code === 'ENOTDIR' || err.code === 'ENOLINK') throw new DirectoryServiceError(err.message, 400);
    logger.warn(`directory scan failed for ${dirPath}: ${err.message}`);
    throw new DirectoryServiceError('无法读取该目录', 500);
  }

  cache.set(dirPath, { mtime: scanned.mtime, cachedAt: now, data: scanned.data });
  trimIfNeeded();
  return { path: dirPath, ...scanned.data, cached: false, mtime: scanned.mtime };
}

/** 强制失效某路径缓存（前端目录旁刷新按钮使用） */
export function invalidateCache(rawPath) {
  const dirPath = normalizeBrowsePath(rawPath);
  if (!dirPath) return { path: '', invalidated: false };
  return { path: dirPath, invalidated: cache.delete(dirPath) };
}

export function resetDirectoryCache() {
  cache.clear();
}

export function directoryCacheSize() {
  return cache.size;
}

export const DIRECTORY_CACHE_LIMIT = MAX_ENTRIES;
