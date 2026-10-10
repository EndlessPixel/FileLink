import { abortConnection } from '../core/aborter.js';
import logger from '../utils/logger.js';

/** 兜底：任何未匹配的路径都不返回状态码，直接断开连接 */
export function notFoundHandler(req, res) {
  abortConnection(req, res);
}

/** 统一错误处理：不向客户端泄漏堆栈 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    abortConnection(req, res);
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large' });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }
  logger.error('unhandled error:', err);
  res.status(500).json({ error: 'internal_error' });
}

export default errorHandler;
