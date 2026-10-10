const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const currentLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function timestamp() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function write(level, stream, args) {
  if (LEVELS[level] > currentLevel) return;
  stream.write(`${timestamp()} [${level.toUpperCase().padEnd(5)}] ${args.map(format).join(' ')}\n`);
}

function format(value) {
  if (value instanceof Error) return `${value.message}\n${value.stack}`;
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export const logger = {
  error: (...args) => write('error', process.stderr, args),
  warn: (...args) => write('warn', process.stderr, args),
  info: (...args) => write('info', process.stdout, args),
  debug: (...args) => write('debug', process.stdout, args),
};

export default logger;
