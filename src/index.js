import { resolve } from 'node:path';
import { createApp } from './app.js';
import { ADMIN_PATH_PREFIX, CLEANUP_INTERVAL_MS, DEFAULT_DB_PATH, DEFAULT_PORT } from './config/constants.js';
import { loadConfig } from './config/store.js';
import { generateAdminPassword, generateAdminPathSuffix, generateSecret } from './core/code.js';
import { sweepApiWindows } from './core/apiRateLimit.js';
import { closeDb, initDb } from './db/index.js';
import { deleteExpiredBans } from './db/repos/loginFailures.repo.js';
import { deleteExpiredSessions } from './db/repos/sessions.repo.js';
import logger from './utils/logger.js';

function parsePort(argv, env) {
  const inline = argv.find((arg) => arg.startsWith('--port='));
  if (inline) return Number(inline.slice('--port='.length));
  const idx = argv.indexOf('--port');
  if (idx !== -1 && argv[idx + 1]) return Number(argv[idx + 1]);
  if (env.PORT) return Number(env.PORT);
  return DEFAULT_PORT;
}

/** 6.3 清理过期会话与已结束的封禁记录 */
function runCleanup() {
  const now = Date.now();
  try {
    const sessions = deleteExpiredSessions(now);
    const bans = deleteExpiredBans(now);
    sweepApiWindows(now);
    if (sessions > 0 || bans > 0) {
      logger.info(`cleanup done: ${sessions} session(s), ${bans} ban record(s) removed`);
    }
  } catch (err) {
    logger.error('cleanup failed:', err);
  }
}

/** 6.1 启动凭据打印区块（仅 stdout 明文，不进入日志） */
function printBanner({ port, dbPath, adminPath, adminPassword, passwordFromEnv }) {
  const line = '─'.repeat(58);
  process.stdout.write(
    [
      '',
      line,
      '  FileLink 已启动',
      line,
      `  监听端口     : ${port}`,
      `  数据库       : ${dbPath}`,
      `  管理后台路径 : ${adminPath}`,
      `  管理员密码   : ${adminPassword}${passwordFromEnv ? '  (来自环境变量 ADMIN_PASSWORD)' : ''}`,
      line,
      '  以上凭据仅在本次运行期间有效，重启后会重新生成。',
      line,
      '',
      '',
    ].join('\n')
  );
}

function main() {
  const port = parsePort(process.argv.slice(2), process.env);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    logger.error(`无效的端口号: ${port}`);
    process.exit(1);
  }

  const dbPath = process.env.DB_PATH ? resolve(process.env.DB_PATH) : resolve(process.cwd(), DEFAULT_DB_PATH);

  // 6.2 建表 + 配置装载
  initDb(dbPath);
  loadConfig();

  const sessionSecret = generateSecret();
  const adminPath = `/${ADMIN_PATH_PREFIX}${generateAdminPathSuffix()}`;
  const passwordFromEnv = Boolean(process.env.ADMIN_PASSWORD);
  const adminPassword = process.env.ADMIN_PASSWORD || generateAdminPassword();

  runCleanup();

  const app = createApp({ sessionSecret, adminPath, adminPassword });
  const server = app.listen(port, () => {
    printBanner({ port, dbPath, adminPath, adminPassword, passwordFromEnv });
    logger.info(`server listening on http://0.0.0.0:${port}`);
    logger.info(`admin console available at ${adminPath}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') logger.error(`端口 ${port} 已被占用`);
    else logger.error('server error:', err);
    process.exit(1);
  });

  const cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  const shutdown = (signal) => {
    logger.info(`received ${signal}, shutting down`);
    clearInterval(cleanupTimer);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
