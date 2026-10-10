import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

/** 流式计算文件 sha256，内存占用为块大小 */
export async function sha256File(filePath) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

/** 读取文件大小（不存在或非文件时抛错） */
export async function fileSize(filePath) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('目标路径不是一个文件');
  return info.size;
}

/** 只取文件的基本信息，避免重复 stat */
export async function fileMeta(filePath) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('目标路径不是一个文件');
  return { size: info.size, mtimeMs: info.mtimeMs };
}
