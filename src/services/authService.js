import svgCaptcha from 'svg-captcha';
import { CAPTCHA_COOKIE, SESSION_COOKIE } from '../config/constants.js';
import { getNumber } from '../config/store.js';
import { generateSessionId } from '../core/code.js';
import * as loginFailuresRepo from '../db/repos/loginFailures.repo.js';
import * as sessionsRepo from '../db/repos/sessions.repo.js';

const CAPTCHA_TTL_MS = 5 * 60 * 1000;

function cookieOptions(adminPath) {
  return { signed: true, httpOnly: true, sameSite: 'strict', path: adminPath };
}

/** 生成 SVG 验证码并把答案写入签名 cookie，由服务端校验 */
export function issueCaptcha(res, adminPath) {
  const captcha = svgCaptcha.create({
    size: 4,
    noise: 2,
    ignoreChars: '0oO1iIl',
    color: true,
    background: '#101725',
    width: 150,
    height: 48,
  });
  res.cookie(CAPTCHA_COOKIE, captcha.text.toLowerCase(), {
    ...cookieOptions(adminPath),
    maxAge: CAPTCHA_TTL_MS,
  });
  return captcha.data;
}

/** 当前封禁状态（封禁到期自动清零） */
export function getBanState(ip, now = Date.now()) {
  const record = loginFailuresRepo.getFailure(ip);
  if (!record) return { banned: false, failures: 0, retryAfterSeconds: 0 };
  if (record.bannedUntil > now) {
    return {
      banned: true,
      failures: record.count,
      retryAfterSeconds: Math.max(Math.ceil((record.bannedUntil - now) / 1000), 1),
    };
  }
  if (record.bannedUntil > 0) {
    loginFailuresRepo.clearFailure(ip);
    return { banned: false, failures: 0, retryAfterSeconds: 0 };
  }
  return { banned: false, failures: record.count, retryAfterSeconds: 0 };
}

function registerFailure(ip, previousFailures) {
  const now = Date.now();
  const count = previousFailures + 1;
  const maxFailures = Math.max(getNumber('login_max_failures'), 1);
  const banSeconds = Math.max(getNumber('login_ban_seconds'), 1);
  const bannedUntil = count >= maxFailures ? now + banSeconds * 1000 : 0;
  loginFailuresRepo.saveFailure(ip, count, now, bannedUntil);
  return { count, bannedUntil };
}

/**
 * 登录：密码校验 + （首次失败后强制）验证码校验，
 * 连续失败达到阈值即封禁该 IP 一段时间。
 */
export function attemptLogin(req, res, { ip, adminPassword, adminPath, password, captchaText }) {
  const now = Date.now();
  const ban = getBanState(ip, now);
  if (ban.banned) {
    return {
      status: 403,
      body: {
        error: 'banned',
        message: '登录失败次数过多，该 IP 已被临时封禁',
        retryAfterSeconds: ban.retryAfterSeconds,
      },
    };
  }

  const captchaRequired = ban.failures >= 1;
  let errorCode = '';

  if (captchaRequired) {
    const expected = req.signedCookies?.[CAPTCHA_COOKIE];
    if (!expected) errorCode = 'captcha_expired';
    else if (String(captchaText ?? '').trim().toLowerCase() !== String(expected).toLowerCase()) {
      errorCode = 'invalid_captcha';
    }
  }
  if (!errorCode && String(password ?? '') !== String(adminPassword)) errorCode = 'invalid_credentials';

  if (errorCode) {
    const next = registerFailure(ip, ban.failures);
    if (next.bannedUntil > now) {
      return {
        status: 403,
        body: {
          error: 'banned',
          message: '连续登录失败，该 IP 已被封禁',
          retryAfterSeconds: Math.max(Math.ceil((next.bannedUntil - now) / 1000), 1),
        },
      };
    }
    const messages = {
      invalid_captcha: '验证码错误',
      captcha_expired: '验证码已失效，请刷新后重试',
      invalid_credentials: '管理员密码错误',
    };
    return {
      status: 401,
      body: {
        error: errorCode,
        message: messages[errorCode],
        remainingAttempts: Math.max(getNumber('login_max_failures') - next.count, 0),
        captchaRequired: true,
      },
    };
  }

  loginFailuresRepo.clearFailure(ip);
  res.clearCookie(CAPTCHA_COOKIE, { path: adminPath });

  const ttlMs = Math.max(getNumber('session_ttl_seconds'), 60) * 1000;
  const sessionId = generateSessionId();
  sessionsRepo.createSession(sessionId, now, now + ttlMs);
  res.cookie(SESSION_COOKIE, sessionId, { ...cookieOptions(adminPath), maxAge: ttlMs });

  return { status: 200, body: { ok: true, expiresAt: now + ttlMs } };
}

/** 读取当前请求的会话（未登录或已过期返回 null） */
export function readSession(req, now = Date.now()) {
  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  if (!sessionId) return null;
  return sessionsRepo.getActiveSession(sessionId, now);
}

export function destroySession(req, res, adminPath) {
  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  if (sessionId) sessionsRepo.deleteSession(sessionId);
  res.clearCookie(SESSION_COOKIE, { path: adminPath });
}
