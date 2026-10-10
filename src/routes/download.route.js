import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { STREAM_CHUNK_SIZE } from '../config/constants.js';
import { abortConnection } from '../core/aborter.js';
import { isValidCode } from '../core/code.js';
import { acquireSlot, releaseSlot } from '../core/concurrency.js';
import { createThrottleStream } from '../core/throttle.js';
import * as blacklistRepo from '../db/repos/blacklist.repo.js';
import * as filesRepo from '../db/repos/files.repo.js';
import * as linksRepo from '../db/repos/links.repo.js';
import { basename, contentDisposition, parseRange } from '../utils/http.js';
import logger from '../utils/logger.js';

const IGNORABLE_STREAM_ERRORS = new Set([
  'ERR_STREAM_PREMATURE_CLOSE',
  'ERR_STREAM_DESTROYED',
  'ECONNRESET',
  'EPIPE',
]);

async function handleDownload(req, res) {
  const ip = req.clientIp;

  // 1.5 黑名单优先：不查短码直接 403
  if (blacklistRepo.isBlacklisted(ip)) {
    res.status(403).type('text/plain; charset=utf-8').send('Forbidden');
    return;
  }

  // 1.6 短码格式不匹配：直接断开连接，不返回任何 HTTP 状态码
  const { code } = req.params;
  if (!isValidCode(code)) {
    abortConnection(req, res);
    return;
  }

  // 4.1 单 IP 并发连接限制
  if (!acquireSlot(ip)) {
    res.status(503).set('Retry-After', '5').type('text/plain; charset=utf-8').send('Too Many Connections');
    return;
  }
  let slotHeld = true;
  const releaseOnce = () => {
    if (!slotHeld) return;
    slotHeld = false;
    releaseSlot(ip);
  };
  res.on('close', releaseOnce);

  // 1.2 短码不存在：直接断开连接
  const link = linksRepo.getLinkByCode(code);
  if (!link) {
    abortConnection(req, res);
    return;
  }

  const file = filesRepo.getFile(link.sha256);
  if (!file) {
    abortConnection(req, res);
    return;
  }

  let info;
  try {
    info = await stat(file.filePath);
  } catch {
    logger.warn(`download target missing on disk: ${file.filePath}`);
    abortConnection(req, res);
    return;
  }
  if (!info.isFile()) {
    abortConnection(req, res);
    return;
  }

  const size = info.size;
  const range = parseRange(req.headers.range, size);
  if (range && range.invalid) {
    res.status(416).set('Content-Range', `bytes */${size}`).end();
    return;
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : Math.max(size - 1, 0);
  const statusCode = range ? 206 : 200;
  const length = size === 0 ? 0 : end - start + 1;

  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': contentDisposition(basename(file.filePath)),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': String(length),
  };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;

  res.writeHead(statusCode, headers);

  if (req.method === 'HEAD' || length === 0) {
    res.end();
    return;
  }

  // 下载计数：响应完整写出后累加
  res.on('finish', () => {
    try {
      linksRepo.incrementDownload(link.sha256);
    } catch (err) {
      logger.warn('failed to increase download count:', err.message);
    }
  });

  // 4.2 单 IP 聚合带宽限速
  const readStream = createReadStream(file.filePath, {
    start,
    end,
    highWaterMark: STREAM_CHUNK_SIZE,
  });
  const throttleStream = createThrottleStream(ip);

  try {
    await pipeline(readStream, throttleStream, res);
  } catch (err) {
    if (IGNORABLE_STREAM_ERRORS.has(err?.code)) return;
    if (!res.headersSent) abortConnection(req, res);
    else res.destroy();
    logger.debug(`download stream ended abnormally: ${err?.message}`);
  }
}

export function createDownloadRouter() {
  const router = Router();
  router.get('/:code', handleDownload);
  return router;
}

export default createDownloadRouter;
