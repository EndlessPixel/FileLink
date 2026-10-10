import * as configRepo from '../db/repos/config.repo.js';
import logger from '../utils/logger.js';

export const ROBOTS_KEY = 'robots_config';
export const SECURITY_TXT_KEY = 'security_txt_config';

/** 预设的 robots.txt 内容 */
const ROBOTS_PRESETS = {
  'allow-all': 'User-agent: *\nAllow: /\n',
  'disallow-all': 'User-agent: *\nDisallow: /\n',
  'disallow-download': 'User-agent: *\nDisallow: /d/\n',
};

const ROBOTS_MODES = ['allow-all', 'disallow-all', 'disallow-download', 'custom'];

const MAX_CUSTOM_LENGTH = 4000;
const MAX_FIELD_LENGTH = 512;

const DEFAULT_ROBOTS = { enabled: true, mode: 'disallow-all', custom: '' };
const DEFAULT_SECURITY_TXT = {
  enabled: false,
  contact: '',
  expires: '',
  encryption: '',
  policy: '',
  canonical: '',
  languages: '',
  acknowledgments: '',
};

let robotsConfig = { ...DEFAULT_ROBOTS };
let securityTxtConfig = { ...DEFAULT_SECURITY_TXT };

function parseJson(raw, fallback) {
  if (typeof raw !== 'string' || raw.trim() === '') return { ...fallback };
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : { ...fallback };
  } catch {
    logger.warn('ignoring malformed site file config in database');
    return { ...fallback };
  }
}

/** 启动时从数据库装载 */
export function loadSiteFiles() {
  robotsConfig = parseJson(readSetting(ROBOTS_KEY), DEFAULT_ROBOTS);
  securityTxtConfig = parseJson(readSetting(SECURITY_TXT_KEY), DEFAULT_SECURITY_TXT);
  if (!ROBOTS_MODES.includes(robotsConfig.mode)) robotsConfig.mode = DEFAULT_ROBOTS.mode;
}

function readSetting(key) {
  try {
    return configRepo.getConfigValue(key);
  } catch {
    return '';
  }
}

function trimField(value) {
  return String(value ?? '').trim().slice(0, MAX_FIELD_LENGTH);
}

function bool(value) {
  return value === true || value === 'true' || value === 1;
}

export function getRobotsConfig() {
  return { ...robotsConfig };
}

export function getSecurityTxtConfig() {
  return { ...securityTxtConfig };
}

/** 校验 robots.txt 配置，返回错误信息（空字符串表示通过） */
export function validateRobotsConfig(input = {}) {
  const mode = ROBOTS_MODES.includes(input.mode) ? input.mode : DEFAULT_ROBOTS.mode;
  if (mode === 'custom' && String(input.custom ?? '').trim() === '') {
    return '选择「自定义」时必须填写规则内容';
  }
  if (String(input.custom ?? '').length > MAX_CUSTOM_LENGTH) {
    return `自定义内容不能超过 ${MAX_CUSTOM_LENGTH} 个字符`;
  }
  return '';
}

export function setRobotsConfig(input = {}) {
  const error = validateRobotsConfig(input);
  if (error) return { error };

  robotsConfig = {
    enabled: bool(input.enabled),
    mode: ROBOTS_MODES.includes(input.mode) ? input.mode : DEFAULT_ROBOTS.mode,
    custom: String(input.custom ?? '').slice(0, MAX_CUSTOM_LENGTH),
  };
  configRepo.setConfig(ROBOTS_KEY, JSON.stringify(robotsConfig));
  logger.info(`robots.txt config updated (enabled=${robotsConfig.enabled}, mode=${robotsConfig.mode})`);
  return { ok: true, config: getRobotsConfig() };
}

function isContact(value) {
  return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^https?:\/\/\S+$/.test(value);
}

function isHttpUrl(value) {
  return /^https?:\/\/\S+$/.test(value);
}

/** 校验 security.txt 配置（启用时 Contact 与 Expires 为 RFC 9116 必填项） */
export function validateSecurityTxtConfig(input = {}) {
  const enabled = bool(input.enabled);
  const contact = trimField(input.contact);
  const expires = trimField(input.expires);

  if (enabled) {
    if (contact === '') return '启用时必须填写 Contact';
    if (!isContact(contact)) return 'Contact 需为 mailto:邮箱 或 http(s) 链接';
    if (expires === '') return '启用时必须填写 Expires（RFC 9116 要求）';
    if (Number.isNaN(Date.parse(expires))) return 'Expires 需为可解析的日期，如 2027-10-11T00:00:00Z';
  } else if (contact !== '' && !isContact(contact)) {
    return 'Contact 需为 mailto:邮箱 或 http(s) 链接';
  }

  const urlFields = [
    ['encryption', 'Encryption'],
    ['policy', 'Policy'],
    ['canonical', 'Canonical'],
    ['acknowledgments', 'Acknowledgments'],
  ];
  for (const [key, label] of urlFields) {
    const value = trimField(input[key]);
    if (value !== '' && !isHttpUrl(value)) return `${label} 需为 http(s) 链接`;
  }
  return '';
}

export function setSecurityTxtConfig(input = {}) {
  const error = validateSecurityTxtConfig(input);
  if (error) return { error };

  securityTxtConfig = {
    enabled: bool(input.enabled),
    contact: trimField(input.contact),
    expires: trimField(input.expires),
    encryption: trimField(input.encryption),
    policy: trimField(input.policy),
    canonical: trimField(input.canonical),
    languages: trimField(input.languages),
    acknowledgments: trimField(input.acknowledgments),
  };
  configRepo.setConfig(SECURITY_TXT_KEY, JSON.stringify(securityTxtConfig));
  logger.info(`security.txt config updated (enabled=${securityTxtConfig.enabled})`);
  return { ok: true, config: getSecurityTxtConfig() };
}

/** 生成 robots.txt 内容；未启用返回 null（此时不提供该文件） */
export function renderRobotsTxt() {
  if (!robotsConfig.enabled) return null;
  if (robotsConfig.mode === 'custom') {
    const text = robotsConfig.custom.trim();
    return text === '' ? null : `${text}\n`;
  }
  return ROBOTS_PRESETS[robotsConfig.mode] ?? ROBOTS_PRESETS['disallow-all'];
}

/** 生成 security.txt 内容（RFC 9116）；未启用返回 null */
export function renderSecurityTxt() {
  if (!securityTxtConfig.enabled) return null;

  const fields = [
    ['Contact', securityTxtConfig.contact],
    ['Expires', securityTxtConfig.expires],
    ['Encryption', securityTxtConfig.encryption],
    ['Acknowledgments', securityTxtConfig.acknowledgments],
    ['Policy', securityTxtConfig.policy],
    ['Canonical', securityTxtConfig.canonical],
    ['Preferred-Languages', securityTxtConfig.languages],
  ];

  const lines = fields.filter(([, value]) => value !== '').map(([key, value]) => `${key}: ${value}`);
  return lines.length > 0 ? `${lines.join('\n')}\n` : null;
}

/** 测试辅助 */
export function resetSiteFiles() {
  robotsConfig = { ...DEFAULT_ROBOTS };
  securityTxtConfig = { ...DEFAULT_SECURITY_TXT };
}
