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
import * as whitelistRepo from '../db/repos/whitelist.repo.js';
import { recordAccess } from '../services/accessLogService.js';
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
  const startedAt = Date.now();
  const startBytes = req.socket?.bytesWritten ?? 0;
  /** 写入日志的状态码；444 表示直接断开连接、未返回任何 HTTP 状态码 */
  let logCode = 0;
  /** 白名单 IP 免并发限制、免带宽限速 */
  const exempt = whitelistRepo.isWhitelisted(ip);

  // 响应结束（正常写完 / 客户端中断 / 服务端断开）后异步入队，不阻塞响应
  res.on('close', () => {
    recordAccess({
      ip,
      method: req.method,
      path: (req.originalUrl || req.url || '').split('?')[0],
      code: logCode || res.statusCode || 0,
      bytesSent: Math.max((req.socket?.bytesWritten ?? 0) - startBytes, 0),
      durationMs: Date.now() - startedAt,
      ua: req.headers['user-agent'] ?? '',
      referer: req.headers.referer ?? req.headers.referrer ?? '',
      createdAt: startedAt,
    });
  });

  // 1.5 黑名单优先：不查短码直接 403
  if (blacklistRepo.isBlacklisted(ip)) {
    logCode = 403;
    res.status(403).type('text/plain; charset=utf-8').send('Forbidden');
    return;
  }

  // 1.6 短码格式不匹配：直接断开连接，不返回任何 HTTP 状态码
  const { code } = req.params;
  if (!isValidCode(code)) {
    logCode = 444;
    abortConnection(req, res);
    return;
  }

  // 4.1 单 IP 并发连接限制（白名单 IP 直接放行，不占用名额）
  if (!exempt) {
    if (!acquireSlot(ip)) {
      logCode = 503;
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
  }

  // 1.2 短码不存在：直接断开连接
  const link = linksRepo.getLinkByCode(code);
  if (!link) {
    logCode = 444;
    abortConnection(req, res);
    return;
  }

  const file = filesRepo.getFile(link.sha256);
  if (!file) {
    logCode = 444;
    abortConnection(req, res);
    return;
  }

  let info;
  try {
    info = await stat(file.filePath);
  } catch {
    logger.warn(`download target missing on disk: ${file.filePath}`);
    logCode = 444;
    abortConnection(req, res);
    return;
  }
  if (!info.isFile()) {
    logCode = 444;
    abortConnection(req, res);
    return;
  }

  const size = info.size;
  const range = parseRange(req.headers.range, size);
  if (range && range.invalid) {
    logCode = 416;
    res.status(416).set('Content-Range', `bytes */${size}`).end();
    return;
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : Math.max(size - 1, 0);
  const statusCode = range ? 206 : 200;
  const length = size === 0 ? 0 : end - start + 1;
  logCode = statusCode;

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

  const readStream = createReadStream(file.filePath, {
    start,
    end,
    highWaterMark: STREAM_CHUNK_SIZE,
  });

  try {
    // 4.2 单 IP 聚合带宽限速（白名单 IP 直接透传，不经过令牌桶）
    if (exempt) {
      await pipeline(readStream, res);
    } else {
      await pipeline(readStream, createThrottleStream(ip), res);
    }
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
