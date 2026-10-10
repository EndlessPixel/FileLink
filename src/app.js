import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { getClientIp } from './core/clientIp.js';
import { createAdminRouter } from './routes/admin.route.js';
import { createApiRouter } from './routes/api.route.js';
import { createDownloadRouter } from './routes/download.route.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import * as securityService from './services/securityService.js';

/**
 * 装配 Express 应用。中间件顺序至关重要：
 * 安全头 → 真实 IP 识别 → cookie → 下载链路 → 公开 API → 管理后台 → 404 断连 → 错误处理
 *
 * 管理后台入口在运行时可被修改，因此这里每次请求都读取当前生效的路径。
 */
export function createApp({ sessionSecret }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', false); // 真实 IP 由 core/clientIp 自行判定

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  app.use((req, _res, next) => {
    req.clientIp = getClientIp(req);
    next();
  });

  app.use(cookieParser(sessionSecret));

  app.use('/d', createDownloadRouter());
  app.use('/api', express.json({ limit: '16kb' }), createApiRouter());

  // 管理后台：路径动态取自安全设置（自定义入口优先，否则为启动随机入口）
  const adminRouter = createAdminRouter();
  app.use((req, res, next) => {
    const adminPath = securityService.getAdminPath();
    if (!adminPath) {
      next();
      return;
    }

    if (req.path === adminPath) {
      res.redirect(308, `${adminPath}/`); // 保证尾斜杠，前端相对路径才能正确解析
      return;
    }

    if (!req.path.startsWith(`${adminPath}/`)) {
      next();
      return;
    }

    // 等价于 app.use(adminPath, adminRouter)：先剥离前缀再交给管理路由，
    // 否则 Router 内部的 '/api/xxx' 无法匹配带前缀的 URL
    const originalUrl = req.url;
    const originalBaseUrl = req.baseUrl;
    req.adminBasePath = adminPath;
    req.url = req.url.slice(adminPath.length) || '/';
    req.baseUrl = `${originalBaseUrl}${adminPath}`;

    adminRouter(req, res, (err) => {
      req.url = originalUrl;
      req.baseUrl = originalBaseUrl;
      next(err);
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
