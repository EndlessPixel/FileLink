/**
 * 解析单区间 Range 头。
 * @returns {null|{invalid:true}|{start:number,end:number}}
 *   null 表示无 Range（全量 200）；invalid 表示需返回 416。
 */
export function parseRange(header, size) {
  if (typeof header !== 'string' || header.trim() === '') return null;
  const match = /^bytes=(.+)$/i.exec(header.trim());
  if (!match) return { invalid: true };

  const specs = match[1].split(',').map((s) => s.trim()).filter(Boolean);
  if (specs.length !== 1) return { invalid: true };

  const spec = specs[0];
  const dash = spec.indexOf('-');
  if (dash === -1) return { invalid: true };

  const startRaw = spec.slice(0, dash).trim();
  const endRaw = spec.slice(dash + 1).trim();
  if (startRaw === '' && endRaw === '') return { invalid: true };

  let start;
  let end;

  if (startRaw === '') {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startRaw);
    if (!Number.isInteger(start) || start < 0) return { invalid: true };
    if (endRaw === '') {
      end = size - 1;
    } else {
      end = Number(endRaw);
      if (!Number.isInteger(end) || end < start) return { invalid: true };
      end = Math.min(end, size - 1);
    }
  }

  if (size <= 0 || start >= size || end < start) return { invalid: true };
  return { start, end };
}

/** 生成兼容非 ASCII 文件名的 Content-Disposition */
export function contentDisposition(filename, { inline = false } = {}) {
  const type = inline ? 'inline' : 'attachment';
  const safeName = String(filename || 'download')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\"]/g, '_');
  const asciiFallback = safeName.replace(/[^\x20-\x7e]/g, '_') || 'download';
  const encoded = encodeURIComponent(safeName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/** 由文件路径取文件名 */
export function basename(filePath) {
  const normalizedPath = String(filePath || '').replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : 'download';
}
