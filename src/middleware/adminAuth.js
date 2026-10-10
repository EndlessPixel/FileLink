import { SESSION_COOKIE } from '../config/constants.js';
import { readSession } from '../services/authService.js';

/** 管理接口鉴权：无有效会话一律 401。cookie path 取当前生效的安全入口 */
export function requireAuth() {
  return (req, res, next) => {
    const session = readSession(req);
    if (!session) {
      res.clearCookie(SESSION_COOKIE, { path: req.adminBasePath ?? '' });
      res.status(401).json({ error: 'unauthorized', message: '会话已失效，请重新登录' });
      return;
    }
    req.adminSession = session;
    next();
  };
}

export default requireAuth;
