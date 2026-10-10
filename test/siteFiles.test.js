import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, initDb } from '../src/db/index.js';
import * as configRepo from '../src/db/repos/config.repo.js';
import {
  getRobotsConfig,
  getSecurityTxtConfig,
  loadSiteFiles,
  renderRobotsTxt,
  renderSecurityTxt,
  resetSiteFiles,
  ROBOTS_KEY,
  SECURITY_TXT_KEY,
  setRobotsConfig,
  setSecurityTxtConfig,
  validateRobotsConfig,
  validateSecurityTxtConfig,
} from '../src/services/siteFilesService.js';

let tempDir;

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'filelink-sitefiles-'));
  initDb(join(tempDir, 'test.db'));
});

beforeEach(() => {
  configRepo.setConfig(ROBOTS_KEY, '');
  configRepo.setConfig(SECURITY_TXT_KEY, '');
  resetSiteFiles();
});

after(() => {
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

test('robots.txt 默认启用并禁止全站抓取', () => {
  assert.deepEqual(getRobotsConfig(), { enabled: true, mode: 'disallow-all', custom: '' });
  assert.equal(renderRobotsTxt(), 'User-agent: *\nDisallow: /\n');
});

test('robots.txt 三个预设与自定义模式', () => {
  setRobotsConfig({ enabled: true, mode: 'allow-all' });
  assert.equal(renderRobotsTxt(), 'User-agent: *\nAllow: /\n');

  setRobotsConfig({ enabled: true, mode: 'disallow-download' });
  assert.equal(renderRobotsTxt(), 'User-agent: *\nDisallow: /d/\n');

  setRobotsConfig({ enabled: true, mode: 'custom', custom: 'User-agent: Googlebot\nDisallow: /private/' });
  assert.equal(renderRobotsTxt(), 'User-agent: Googlebot\nDisallow: /private/\n');
});

test('robots.txt 关闭后不再提供该文件', () => {
  setRobotsConfig({ enabled: false, mode: 'disallow-all' });
  assert.equal(renderRobotsTxt(), null);
});

test('robots.txt 自定义模式必须填写内容，非法模式回退默认', () => {
  assert.equal(validateRobotsConfig({ mode: 'custom', custom: '   ' }), '选择「自定义」时必须填写规则内容');
  assert.equal(validateRobotsConfig({ mode: 'custom', custom: 'Disallow: /' }), '');
  assert.equal(setRobotsConfig({ mode: 'custom' }).error, '选择「自定义」时必须填写规则内容');

  setRobotsConfig({ enabled: true, mode: 'not-a-mode' });
  assert.equal(getRobotsConfig().mode, 'disallow-all');
});

test('security.txt 默认关闭，配置齐全后按 RFC 9116 渲染', () => {
  assert.equal(renderSecurityTxt(), null);

  const result = setSecurityTxtConfig({
    enabled: true,
    contact: 'mailto:security@example.com',
    expires: '2027-10-11T00:00:00Z',
    encryption: 'https://example.com/pgp-key.txt',
    policy: 'https://example.com/security-policy',
    languages: 'zh-CN, en',
  });
  assert.equal(result.ok, true);

  const text = renderSecurityTxt();
  assert.ok(text.includes('Contact: mailto:security@example.com'));
  assert.ok(text.includes('Expires: 2027-10-11T00:00:00Z'));
  assert.ok(text.includes('Encryption: https://example.com/pgp-key.txt'));
  assert.ok(text.includes('Preferred-Languages: zh-CN, en'));
  assert.ok(text.endsWith('\n'));
});

test('security.txt 启用时 Contact 与 Expires 必填且格式受限', () => {
  assert.equal(validateSecurityTxtConfig({ enabled: true }), '启用时必须填写 Contact');
  assert.equal(
    validateSecurityTxtConfig({ enabled: true, contact: 'not-an-email' }),
    'Contact 需为 mailto:邮箱 或 http(s) 链接'
  );
  assert.equal(
    validateSecurityTxtConfig({ enabled: true, contact: 'mailto:a@b.com' }),
    '启用时必须填写 Expires（RFC 9116 要求）'
  );
  assert.equal(
    validateSecurityTxtConfig({ enabled: true, contact: 'mailto:a@b.com', expires: '随便写的' }),
    'Expires 需为可解析的日期，如 2027-10-11T00:00:00Z'
  );
  assert.equal(
    validateSecurityTxtConfig({ enabled: true, contact: 'mailto:a@b.com', expires: '2027-10-11' }),
    ''
  );
});

test('security.txt 链接类字段必须是 http(s)', () => {
  assert.equal(
    validateSecurityTxtConfig({ enabled: false, policy: 'ftp://x' }),
    'Policy 需为 http(s) 链接'
  );
  assert.equal(validateSecurityTxtConfig({ enabled: false, encryption: 'ABC123' }), 'Encryption 需为 http(s) 链接');
  assert.equal(validateSecurityTxtConfig({ enabled: false }), '');
});

test('配置持久化到数据库，重新装载后仍生效', () => {
  setRobotsConfig({ enabled: true, mode: 'allow-all' });
  setSecurityTxtConfig({
    enabled: true,
    contact: 'https://example.com/report',
    expires: '2028-01-01T00:00:00Z',
  });

  // 模拟进程重启：先回到内存默认值，再从数据库装载
  resetSiteFiles();
  assert.equal(renderRobotsTxt(), 'User-agent: *\nDisallow: /\n', '重置后应回到默认（禁止全站）');

  loadSiteFiles();
  assert.equal(renderRobotsTxt(), 'User-agent: *\nAllow: /\n');
  assert.equal(getSecurityTxtConfig().contact, 'https://example.com/report');
  assert.ok(renderSecurityTxt().includes('Contact: https://example.com/report'));
});

test('数据库中损坏的 JSON 会被忽略并回退默认值', () => {
  configRepo.setConfig(ROBOTS_KEY, '{ not valid json');
  loadSiteFiles();
  assert.deepEqual(getRobotsConfig(), { enabled: true, mode: 'disallow-all', custom: '' });
});
