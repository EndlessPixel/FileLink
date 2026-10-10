import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { getClientIp } from './core/clientIp.js';
import { createApiRouter } from './routes/api.route.js';
import { createDownloadRouter } from './routes/download.route.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * 装配 Express 应用。中间件顺序至关重要：
 * 安全头 → 真实 IP 识别 → cookie → 下载链路 → 404 断连 → 错误处理
 */
export function createApp({ sessionSecret }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', false); // IP 识别自行处理，不依赖 Express

  app.use(
    helmet({
      contentSecurityPolicy: false, // 管理后台为独立 SPA，稍后按需配置
      crossOriginResourcePolicy: { policy: 'same-site' },
    })
  );

  app.use((req, _res, next) => {
    req.clientIp = getClientIp(req);
    next();
  });

  app.use(cookieParser(sessionSecret));

  app.use('/d', createDownloadRouter());

  app.use('/api', express.json({ limit: '16kb' }), createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
