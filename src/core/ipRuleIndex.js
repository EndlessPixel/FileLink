import { matchCidr, parseCidr } from './cidr.js';

/**
 * IP 规则索引：把「精确地址」与「CIDR 段」分开缓存。
 * 热路径（每次下载请求）只需一次 Set 查找，加上少量前缀位比较，
 * 因此规则数量增长也不会带来明显开销。
 */
export function createIpRuleIndex() {
  let exact = new Set();
  let rules = [];

  return {
    /** 用规则字符串数组重建索引（非字符串与非法项自动忽略） */
    rebuild(entries = []) {
      exact = new Set();
      rules = [];

      for (const entry of entries) {
        if (typeof entry !== 'string' || entry === '') continue;
        if (entry.includes('/')) {
          const parsed = parseCidr(entry);
          if (parsed) rules.push(parsed);
        } else {
          exact.add(entry);
        }
      }
    },

    has(ip) {
      if (exact.has(ip)) return true;
      if (rules.length === 0) return false;
      return rules.some((rule) => matchCidr(ip, rule));
    },

    size() {
      return exact.size + rules.length;
    },

    reset() {
      exact = new Set();
      rules = [];
    },
  };
}
