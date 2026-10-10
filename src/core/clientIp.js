import { isIP } from 'node:net';

const V4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** 归一化 IP：剥离 IPv4 映射前缀与 IPv6 zone id */
export function normalizeIp(raw) {
  if (typeof raw !== 'string') return '';
  let ip = raw.trim();
  if (ip === '') return '';
  const mapped = V4_MAPPED.exec(ip);
  if (mapped) return mapped[1];
  const zone = ip.indexOf('%');
  if (zone !== -1) ip = ip.slice(0, zone);
  return ip;
}

/** 判断是否内网/保留地址（回环、私有、链路本地、CGNAT） */
export function isPrivateIp(ip) {
  const version = isIP(ip);
  if (version === 4) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets;
    if (a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    return false;
  }
  return false;
}

function firstPublicFromHeader(value) {
  if (typeof value !== 'string' || value === '') return '';
  for (const part of value.split(',')) {
    const ip = normalizeIp(part);
    if (isIP(ip) !== 0 && !isPrivateIp(ip)) return ip;
  }
  return '';
}

/**
 * 真实客户端 IP 自动识别：
 * remoteAddress 为公网 IP 时直接采用；为内网/回环时依次读取
 * X-Forwarded-For（最左有效公网项）、X-Real-IP，都拿不到则回退 remoteAddress。
 */
export function getClientIp(req) {
  const remote = normalizeIp(req.socket?.remoteAddress ?? req.connection?.remoteAddress ?? '');
  if (remote !== '' && isIP(remote) !== 0 && !isPrivateIp(remote)) return remote;

  const fromXff = firstPublicFromHeader(req.headers?.['x-forwarded-for']);
  if (fromXff) return fromXff;

  const fromReal = normalizeIp(req.headers?.['x-real-ip'] ?? '');
  if (fromReal && isIP(fromReal) !== 0 && !isPrivateIp(fromReal)) return fromReal;

  return remote;
}
