import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { getClientIp } from './core/clientIp.js';
import { createAdminRouter } from './routes/admin.route.js';
import { createApiRouter } from './routes/api.route.js';
import { createDownloadRouter } from './routes/download.route.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * 装配 Express 应用。中间件顺序至关重要：
 * 安全头 → 真实 IP 识别 → cookie → 下载链路 → 公开 API → 管理后台 → 404 断连 → 错误处理
 */
export function createApp({ sessionSecret, adminPath, adminPassword }) {
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

  if (adminPath) {
    // 保证管理页面始终以尾斜杠访问，前端相对路径才能正确解析
    app.use((req, res, next) => {
      if (req.path === adminPath) {
        res.redirect(308, `${adminPath}/`);
        return;
      }
      next();
    });
    app.use(adminPath, createAdminRouter({ adminPath, adminPassword }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
