export function formatSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const text = index === 0 || size >= 100 ? Math.round(size).toString() : size.toFixed(1);
  return `${text} ${units[index]}`;
}

export function formatTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '-';
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

/** 精确到秒的时间，用于日志等需要秒级精度的场景 */
export function formatDateTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '-';
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}

/**
 * 长地址摘要：IPv6 完整写法有 39 个字符，放进卡片会撑破布局。
 * 这里保留首两组与最后一组，中间省略；IPv4 等短地址原样返回。
 */
export function shortIp(ip) {
  const value = String(ip ?? '');
  if (value === '') return '-';
  if (value.length <= 20) return value;

  if (value.includes(':')) {
    const parts = value.split(':');
    if (parts.length >= 3) return `${parts[0]}:${parts[1]}:…:${parts[parts.length - 1]}`;
  }
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export function shortHash(hash, length = 12) {
  if (typeof hash !== 'string' || hash.length === 0) return '-';
  return hash.length <= length ? hash : `${hash.slice(0, length)}…`;
}

export function bpsToMbps(bps) {
  const value = Number(bps);
  return Number.isFinite(value) ? Number((value / 1_000_000).toFixed(2)) : 0;
}

export function mbpsToBps(mbps) {
  const value = Number(mbps);
  return Number.isFinite(value) ? Math.round(value * 1_000_000) : 0;
}

export function formatDuration(seconds) {
  const total = Math.max(Math.floor(Number(seconds) || 0), 0);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${rest} 秒`;
  return `${minutes} 分 ${rest} 秒`;
}

export function fileBaseName(filePath) {
  if (typeof filePath !== 'string') return '-';
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : filePath;
}
