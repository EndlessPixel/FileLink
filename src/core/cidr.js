import { isIP } from 'node:net';

/**
 * CIDR 匹配工具。
 * IPv4 与 IPv6 统一转换为 BigInt 后按位比较，避免逐字节拆分的分支判断。
 */

/** 解析点分十进制 IPv4 为 32 位整数；非法返回 null */
export function ipv4ToBigInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;

  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

/** 展开并解析 IPv6 为 128 位整数；非法返回 null */
export function ipv6ToBigInt(ip) {
  let text = String(ip).toLowerCase();

  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);

  // 内嵌 IPv4 写法（::ffff:192.168.0.1）先转成两个十六进制分组
  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':');
    if (lastColon === -1) return null;
    const mapped = ipv4ToBigInt(text.slice(lastColon + 1));
    if (mapped === null) return null;
    const high = ((mapped >> 16n) & 0xffffn).toString(16);
    const low = (mapped & 0xffffn).toString(16);
    text = `${text.slice(0, lastColon)}:${high}:${low}`;
  }

  let groups;
  const doubleColon = text.indexOf('::');
  if (doubleColon !== -1) {
    const head = text.slice(0, doubleColon);
    const tail = text.slice(doubleColon + 2);
    const headParts = head === '' ? [] : head.split(':');
    const tailParts = tail === '' ? [] : tail.split(':');
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;
    groups = [...headParts, ...new Array(missing).fill('0'), ...tailParts];
  } else {
    groups = text.split(':');
  }

  if (groups.length !== 8) return null;

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

/**
 * 解析规则为 { version, base, mask, prefix }。
 * 不带 '/' 时视为单地址（前缀长度取满）。
 */
export function parseCidr(rule) {
  if (typeof rule !== 'string') return null;
  const text = rule.trim();
  if (text === '') return null;

  const slash = text.indexOf('/');
  let address = text;
  let prefix = null;

  if (slash !== -1) {
    address = text.slice(0, slash);
    const raw = text.slice(slash + 1);
    if (!/^\d{1,3}$/.test(raw)) return null;
    prefix = Number(raw);
  }

  const version = isIP(address);
  if (version !== 4 && version !== 6) return null;

  const bits = version === 4 ? 32 : 128;
  const raw = version === 4 ? ipv4ToBigInt(address) : ipv6ToBigInt(address);
  if (raw === null) return null;

  const effectivePrefix = prefix === null ? bits : prefix;
  if (effectivePrefix < 0 || effectivePrefix > bits) return null;

  const maskBits = BigInt(bits - effectivePrefix);
  const mask = ((1n << BigInt(bits)) - 1n) ^ ((1n << maskBits) - 1n);

  return { version, base: raw & mask, mask, prefix: effectivePrefix };
}

/** 判断 ip 是否落在规则范围内（规则可为单地址或 CIDR 段） */
export function matchCidr(ip, rule) {
  if (typeof ip !== 'string' || ip === '') return false;

  const version = isIP(ip);
  if (version === 0) return false;

  const parsed = typeof rule === 'string' ? parseCidr(rule) : rule;
  if (!parsed || parsed.version !== version) return false;

  const value = version === 4 ? ipv4ToBigInt(ip) : ipv6ToBigInt(ip);
  if (value === null) return false;

  return (value & parsed.mask) === parsed.base;
}

/** 是否为合法的 CIDR 网段写法 */
export function isCidr(value) {
  if (typeof value !== 'string' || !value.includes('/')) return false;
  return parseCidr(value) !== null;
}
