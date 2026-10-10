import { SESSION_COOKIE } from '../config/constants.js';
import { readSession } from '../services/authService.js';

/** 管理接口鉴权：无有效会话一律 401 */
export function requireAuth(adminPath) {
  return (req, res, next) => {
    const session = readSession(req);
    if (!session) {
      res.clearCookie(SESSION_COOKIE, { path: adminPath });
      res.status(401).json({ error: 'unauthorized', message: '会话已失效，请重新登录' });
      return;
    }
    req.adminSession = session;
    next();
  };
}

export default requireAuth;
