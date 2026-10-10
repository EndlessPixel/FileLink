import { DEFAULT_HOST, DEFAULT_PORT } from './constants.js';

function readFlag(argv, name) {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  if (index !== -1 && argv[index + 1] && !argv[index + 1].startsWith('--')) return argv[index + 1];
  return undefined;
}

/** 端口优先级：--port= > --port > 环境变量 PORT > 默认 3000 */
export function parsePort(argv = [], env = {}) {
  const raw = readFlag(argv, 'port') ?? env.PORT;
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  return Number.isInteger(port) ? port : Number.NaN;
}

/**
 * 监听地址优先级：--host= > --host > 环境变量 HOST > 默认 0.0.0.0。
 * 部署在反向代理后面时可用 HOST=127.0.0.1 只监听本机。
 */
export function parseHost(argv = [], env = {}) {
  return readFlag(argv, 'host') ?? env.HOST ?? DEFAULT_HOST;
}

export function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}
