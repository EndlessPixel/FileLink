import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { Router } from 'express';
import { SESSION_COOKIE } from '../config/constants.js';
import * as configStore from '../config/store.js';
import * as blacklistRepo from '../db/repos/blacklist.repo.js';
import { requireAuth } from '../middleware/adminAuth.js';
import * as accessLogService from '../services/accessLogService.js';
import { attemptLogin, destroySession, issueCaptcha, readSession } from '../services/authService.js';
import { invalidateCache, listDirectory } from '../services/directoryService.js';
import { addFileByPath, removeFile } from '../services/fileService.js';
import * as networkMonitor from '../services/networkMonitor.js';
import * as securityService from '../services/securityService.js';
import * as siteFilesService from '../services/siteFilesService.js';
import { getStats, listFilesWithLinks, refreshLink } from '../services/linkService.js';
import { isIpAddress, isSha256, normalizeSha256, toNonNegativeInt } from '../utils/validate.js';

const SPEED_MAX_BPS = 10_000_000_000;
const CONCURRENCY_MAX = 512;

function updateLimits(body) {
  const updates = {};

  if (body.max_speed_bps !== undefined) {
    const bps = toNonNegativeInt(body.max_speed_bps, -1);
    if (bps < 0 || bps > SPEED_MAX_BPS) {
      return { error: '单 IP 速度上限必须是 0 到 10000 Mbps 之间的数值' };
    }
    updates.max_speed_bps = String(bps);
  }

  if (body.max_concurrent_downloads !== undefined) {
    const conns = toNonNegativeInt(body.max_concurrent_downloads, -1);
    if (conns < 1 || conns > CONCURRENCY_MAX) {
      return { error: `单 IP 并发上限必须是 1 到 ${CONCURRENCY_MAX} 之间的整数` };
    }
    updates.max_concurrent_downloads = String(conns);
  }

  if (Object.keys(updates).length === 0) return { error: '没有需要更新的配置项' };

  for (const [key, value] of Object.entries(updates)) configStore.setValue(key, value);
  return { updated: Object.keys(updates) };
}

export function createAdminRouter() {
  const router = Router();
  const webDist = resolve(process.cwd(), 'dist', 'admin');
  const indexPath = join(webDist, 'index.html');
  const auth = requireAuth();

  router.use(express.json({ limit: '32kb' }));

  // ---- 无需登录 ----
  router.post('/api/login', (req, res) => {
    const result = attemptLogin(req, res, {
      ip: req.clientIp,
      adminPath: req.adminBasePath,
      password: req.body?.password,
      captchaText: req.body?.captcha,
    });
    res.status(result.status).json(result.body);
  });

  router.get('/api/captcha', (req, res) => {
    const svg = issueCaptcha(res, req.adminBasePath);
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  });

  router.post('/api/logout', (req, res) => {
    destroySession(req, res, req.adminBasePath);
    res.json({ ok: true });
  });

  router.get('/api/session', (req, res) => {
    const session = readSession(req);
    res.json(session ? { authenticated: true, expiresAt: session.expiresAt } : { authenticated: false });
  });

  // ---- 需要登录 ----
  router.use('/api', auth);

  router.get('/api/stats', (_req, res) => {
    res.json(getStats());
  });

  // 系统监控：网卡上下行速率采样
  router.get('/api/monitor/network', (_req, res) => {
    res.json(networkMonitor.getNetworkSnapshot());
  });

  // 站点声明文件：robots.txt 与 /.well-known/security.txt 的图形化配置
  router.get('/api/site-files', (_req, res) => {
    res.json({
      robots: siteFilesService.getRobotsConfig(),
      securityTxt: siteFilesService.getSecurityTxtConfig(),
      previews: {
        robots: siteFilesService.renderRobotsTxt(),
        securityTxt: siteFilesService.renderSecurityTxt(),
      },
    });
  });

  router.put('/api/site-files/robots', (req, res) => {
    const result = siteFilesService.setRobotsConfig(req.body ?? {});
    if (result.error) {
      res.status(400).json({ error: 'invalid_robots', message: result.error });
      return;
    }
    res.json({ ok: true, config: result.config, preview: siteFilesService.renderRobotsTxt() });
  });

  router.put('/api/site-files/security-txt', (req, res) => {
    const result = siteFilesService.setSecurityTxtConfig(req.body ?? {});
    if (result.error) {
      res.status(400).json({ error: 'invalid_security_txt', message: result.error });
      return;
    }
    res.json({ ok: true, config: result.config, preview: siteFilesService.renderSecurityTxt() });
  });

  // 下载请求日志：分页 + 搜索 + 时间范围 + 状态码筛选 + 排序
  router.get('/api/logs', (req, res) => {
    res.json(accessLogService.queryAccessLogs(req.query));
  });

  router.get('/api/logs/export', (req, res) => {
    const { csv, count } = accessLogService.exportAccessLogsCsv(req.query);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="filelink-logs-${stamp}.csv"`)
      .set('X-Exported-Rows', String(count))
      .send(csv);
  });

  router.get('/api/files', (_req, res) => {
    res.json({ files: listFilesWithLinks() });
  });

  router.post('/api/files', async (req, res) => {
    const result = await addFileByPath(req.body?.path);
    res.json(result);
  });

  router.delete('/api/files/:sha256', (req, res) => {
    const sha256 = normalizeSha256(req.params.sha256);
    if (!isSha256(sha256)) {
      res.status(400).json({ error: 'invalid_sha256' });
      return;
    }
    removeFile(sha256);
    res.json({ ok: true });
  });

  // 重新生成下载链接（旧短码立即失效）
  router.post('/api/files/:sha256/refresh', (req, res) => {
    const sha256 = normalizeSha256(req.params.sha256);
    if (!isSha256(sha256)) {
      res.status(400).json({ error: 'invalid_sha256' });
      return;
    }
    const link = refreshLink(sha256);
    res.json({ sha256, code: link.code, downloadCount: link.downloadCount });
  });

  router.get('/api/blacklist', (_req, res) => {
    res.json({ entries: blacklistRepo.listBlacklist() });
  });

  router.post('/api/blacklist', (req, res) => {
    const ip = String(req.body?.ip ?? '').trim();
    if (!isIpAddress(ip)) {
      res.status(400).json({ error: 'invalid_ip', message: '请输入合法的 IPv4 或 IPv6 地址' });
      return;
    }
    blacklistRepo.addToBlacklist(ip, String(req.body?.reason ?? '').slice(0, 200), Date.now());
    res.json({ ok: true, ip });
  });

  router.delete('/api/blacklist/:ip', (req, res) => {
    const ip = String(req.params.ip ?? '').trim();
    if (!isIpAddress(ip)) {
      res.status(400).json({ error: 'invalid_ip' });
      return;
    }
    blacklistRepo.removeFromBlacklist(ip);
    res.json({ ok: true });
  });

  // 目录浏览（文件选择器），带内存缓存
  router.get('/api/directories', async (req, res) => {
    const result = await listDirectory(req.query.path);
    res.json(result);
  });

  router.delete('/api/directories/cache', (req, res) => {
    const result = invalidateCache(req.query.path);
    res.json({ ok: true, ...result });
  });

  router.get('/api/config', (_req, res) => {
    res.json(configStore.snapshot());
  });

  router.put('/api/config', (req, res) => {
    const result = updateLimits(req.body ?? {});
    if (result.error) {
      res.status(400).json({ error: 'invalid_config', message: result.error });
      return;
    }
    res.json({ ok: true, config: configStore.snapshot() });
  });

  // ---- 安全设置：自定义安全入口与登录密码 ----
  router.get('/api/security', (req, res) => {
    res.json({
      adminPath: securityService.getAdminPath(),
      currentPath: req.adminBasePath,
      customAdminPath: securityService.hasCustomAdminPath(),
      customPassword: securityService.hasCustomPassword(),
    });
  });

  router.put('/api/security/path', (req, res) => {
    const previousPath = req.adminBasePath ?? '';
    const result = securityService.setAdminPath(req.body?.path);
    if (result.error) {
      res.status(400).json({ error: 'invalid_path', message: result.error });
      return;
    }

    // 让当前会话 cookie 跟随新入口，改完不会被登出
    const sessionId = req.signedCookies?.[SESSION_COOKIE];
    const expiresAt = req.adminSession?.expiresAt;
    if (sessionId && expiresAt) {
      res.clearCookie(SESSION_COOKIE, { path: previousPath });
      res.cookie(SESSION_COOKIE, sessionId, {
        signed: true,
        httpOnly: true,
        sameSite: 'strict',
        path: result.path,
        maxAge: Math.max(expiresAt - Date.now(), 1000),
      });
    }
    res.json({ ok: true, adminPath: result.path });
  });

  router.put('/api/security/password', (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
    if (!securityService.verifyAdminPassword(currentPassword)) {
      res.status(400).json({ error: 'invalid_current_password', message: '当前密码不正确' });
      return;
    }
    if (String(newPassword ?? '') !== String(confirmPassword ?? '')) {
      res.status(400).json({ error: 'password_mismatch', message: '两次输入的新密码不一致' });
      return;
    }
    const result = securityService.setPassword(newPassword);
    if (result.error) {
      res.status(400).json({ error: 'weak_password', message: result.error });
      return;
    }
    res.json({ ok: true });
  });

  // ---- 静态资源与 SPA 入口 ----
  if (existsSync(indexPath)) {
    router.use(express.static(webDist, { index: false, dotfiles: 'deny', fallthrough: true }));
    router.get('/', (_req, res) => {
      res.set('Cache-Control', 'no-store');
      res.sendFile(indexPath);
    });
  } else {
    router.get('/', (_req, res) => {
      res
        .status(503)
        .type('text/plain; charset=utf-8')
        .send('管理界面尚未构建，请先执行：npm run build:web');
    });
  }

  return router;
}

export default createAdminRouter;
