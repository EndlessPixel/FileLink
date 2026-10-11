import { resolve } from 'node:path';
import { createApp } from './app.js';
import { isValidPort, parseHost, parsePort } from './config/cli.js';
import { ADMIN_PATH_PREFIX, CLEANUP_INTERVAL_MS, DEFAULT_DB_PATH } from './config/constants.js';
import { getNumber, loadConfig } from './config/store.js';
import { generateAdminPassword, generateAdminPathSuffix, generateSecret } from './core/code.js';
import { sweepApiWindows } from './core/apiRateLimit.js';
import { closeDb, initDb } from './db/index.js';
import { deleteLogsBefore } from './db/repos/accessLogs.repo.js';
import { loadBlacklistCache } from './db/repos/blacklist.repo.js';
import { deleteExpiredBans } from './db/repos/loginFailures.repo.js';
import { deleteExpiredSessions } from './db/repos/sessions.repo.js';
import { loadWhitelistCache } from './db/repos/whitelist.repo.js';
import { startAccessLogWriter, stopAccessLogWriter } from './services/accessLogService.js';
import { startNetworkMonitor, stopNetworkMonitor } from './services/networkMonitor.js';
import { startSystemMonitor, stopSystemMonitor } from './services/systemMonitor.js';
import {
  getAdminPath,
  hasCustomAdminPath,
  hasCustomPassword,
  loadSecuritySettings,
  setRuntimeCredentials,
} from './services/securityService.js';
import { loadSiteFiles } from './services/siteFilesService.js';
import logger from './utils/logger.js';

/** 6.3 清理过期会话、已结束的封禁记录与超期访问日志 */
function runCleanup() {
  const now = Date.now();
  try {
    const sessions = deleteExpiredSessions(now);
    const bans = deleteExpiredBans(now);
    sweepApiWindows(now);

    const retentionDays = getNumber('log_retention_days');
    const logs =
      retentionDays > 0
        ? deleteLogsBefore(now - retentionDays * 24 * 60 * 60 * 1000)
        : 0;

    if (sessions > 0 || bans > 0 || logs > 0) {
      logger.info(
        `cleanup done: ${sessions} session(s), ${bans} ban record(s), ${logs} access log(s) removed`
      );
    }
  } catch (err) {
    logger.error('cleanup failed:', err);
  }
}

/** 6.1 启动凭据打印区块（仅 stdout 明文，不进入常规日志） */
function printBanner({
  listen,
  dbPath,
  adminPath,
  adminPathIsCustom,
  adminPassword,
  passwordIsCustom,
  passwordFromEnv,
}) {
  const line = '─'.repeat(58);
  let passwordLine;
  if (passwordIsCustom) passwordLine = '(已自定义，不再随机生成)';
  else if (passwordFromEnv) passwordLine = `${adminPassword}  (来自环境变量 ADMIN_PASSWORD)`;
  else passwordLine = adminPassword;

  process.stdout.write(
    [
      '',
      line,
      '  FileLink 已启动',
      line,
      `  监听地址     : ${listen}`,
      `  数据库       : ${dbPath}`,
      `  管理后台路径 : ${adminPath}${adminPathIsCustom ? '  (自定义)' : ''}`,
      `  管理员密码   : ${passwordLine}`,
      line,
      adminPathIsCustom || passwordIsCustom
        ? '  已启用后台保存的自定义安全设置，未配置的项才会随机生成。'
        : '  以上凭据仅在本次运行期间有效，重启后会重新生成。',
      line,
      '',
      '',
    ].join('\n')
  );
}

function main() {
  const argv = process.argv.slice(2);
  const port = parsePort(argv, process.env);
  if (!isValidPort(port)) {
    logger.error(`无效的端口号: ${process.env.PORT ?? argv.join(' ')}`);
    process.exit(1);
  }

  const host = parseHost(argv, process.env);
  const dbPath = process.env.DB_PATH ? resolve(process.env.DB_PATH) : resolve(process.cwd(), DEFAULT_DB_PATH);

  // 6.2 建表 + 配置装载 + 安全设置装载
  initDb(dbPath);
  loadConfig();
  loadSecuritySettings();
  loadSiteFiles();

  // IP 规则索引：黑名单的 CIDR 段与整张白名单表都缓存在内存中
  loadBlacklistCache();
  loadWhitelistCache();

  // 先注入本次运行的随机凭据，再用它们作为「未自定义」时的兜底
  const generatedPath = `/${ADMIN_PATH_PREFIX}${generateAdminPathSuffix()}`;
  const generatedPassword = process.env.ADMIN_PASSWORD || generateAdminPassword();
  setRuntimeCredentials({ adminPath: generatedPath, password: generatedPassword });

  const adminPathIsCustom = hasCustomAdminPath();
  const passwordIsCustom = hasCustomPassword();
  const adminPath = getAdminPath();
  const passwordFromEnv = !passwordIsCustom && Boolean(process.env.ADMIN_PASSWORD);

  const sessionSecret = generateSecret();

  runCleanup();

  // 网卡流量采样（仅 Linux 可用，失败不影响主流程）
  startNetworkMonitor().catch((err) => logger.warn(`network monitor unavailable: ${err.message}`));

  // 磁盘容量与 IO、内存、CPU 负载采样
  startSystemMonitor().catch((err) => logger.warn(`system monitor unavailable: ${err.message}`));

  // 访问日志批量写入器（内存队列 + 定时刷盘）
  startAccessLogWriter();

  const app = createApp({ sessionSecret });
  const server = app.listen(port, host, () => {
    const listen = `${host}:${port}`;
    printBanner({
      listen,
      dbPath,
      adminPath,
      adminPathIsCustom,
      adminPassword: generatedPassword,
      passwordIsCustom,
      passwordFromEnv,
    });
    logger.info(`server listening on http://${listen}`);
    logger.info(`admin console available at ${adminPath}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') logger.error(`端口 ${port} 已被占用`);
    else if (err.code === 'EACCES') logger.error(`没有权限监听 ${host}:${port}`);
    else if (err.code === 'EADDRNOTAVAIL') logger.error(`监听地址 ${host} 在本机不可用`);
    else logger.error('server error:', err);
    process.exit(1);
  });

  const cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  const shutdown = (signal) => {
    logger.info(`received ${signal}, shutting down`);
    clearInterval(cleanupTimer);
    stopNetworkMonitor();
    stopSystemMonitor();
    stopAccessLogWriter();
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
