import { Router } from 'express';
import { hitApiLimit } from '../core/apiRateLimit.js';
import { getLinkInfo, getOrCreateLink, refreshLink } from '../services/linkService.js';
import { isSha256, normalizeSha256 } from '../utils/validate.js';

/** 下载链接基址：优先环境变量，其次按请求头推断 */
function buildBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function linkPayload(req, sha256, link, extra = {}) {
  return {
    sha256,
    code: link.code,
    url: `${buildBaseUrl(req)}/d/${link.code}`,
    downloadCount: link.downloadCount,
    createdAt: link.createdAt,
    ...extra,
  };
}

/** 2.4 API 单 IP 每分钟请求上限 */
function rateLimit(req, res, next) {
  const result = hitApiLimit(req.clientIp);
  res.set('X-RateLimit-Limit', String(result.limit));
  res.set('X-RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) {
    res.set('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: '请求过于频繁，请稍后重试',
      retryAfterSeconds: result.retryAfterSeconds,
    });
    return;
  }
  next();
}

function readSha256(value) {
  const sha256 = normalizeSha256(value);
  return isSha256(sha256) ? sha256 : '';
}

export function createApiRouter() {
  const router = Router();

  router.use(rateLimit);

  // 2.1 获取（必要时创建）下载链接
  router.get('/filelink', (req, res) => {
    const sha256 = readSha256(req.query.sha256);
    if (!sha256) {
      res.status(400).json({ error: 'invalid_sha256', message: 'sha256 参数必须是 64 位十六进制' });
      return;
    }
    const link = getOrCreateLink(sha256);
    res.json(linkPayload(req, sha256, link, { created: link.isNew }));
  });

  // 2.2 重新生成链接（旧短码立即失效，下载计数保留）
  router.post('/refresh', (req, res) => {
    const sha256 = readSha256(req.body?.sha256);
    if (!sha256) {
      res.status(400).json({ error: 'invalid_sha256', message: '请求体 sha256 必须是 64 位十六进制' });
      return;
    }
    const link = refreshLink(sha256);
    res.json(linkPayload(req, sha256, link, { refreshed: true }));
  });

  // 2.3 查询文件与链接状态
  router.get('/info', (req, res) => {
    const sha256 = readSha256(req.query.sha256);
    if (!sha256) {
      res.status(400).json({ error: 'invalid_sha256', message: 'sha256 参数必须是 64 位十六进制' });
      return;
    }
    const { file, link } = getLinkInfo(sha256);
    res.json({
      sha256,
      size: file.size,
      filePath: file.filePath,
      addedAt: file.addedAt,
      code: link?.code ?? null,
      url: link ? `${buildBaseUrl(req)}/d/${link.code}` : null,
      downloadCount: link?.downloadCount ?? 0,
      linkCreatedAt: link?.createdAt ?? null,
    });
  });

  return router;
}

export default createApiRouter;
