let unauthorizedHandler = () => {};

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

/** 管理页面挂在随机路径下，所有接口用相对 baseURI 解析 */
function toUrl(path) {
  return new URL(`./api/${path}`, document.baseURI).toString();
}

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(toUrl(path), {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (response.status === 401 && path !== 'login' && path !== 'session') {
    unauthorizedHandler();
    throw new Error(data.message || '会话已失效，请重新登录');
  }

  if (!response.ok) {
    const error = new Error(data.message || data.error || `请求失败（${response.status}）`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export const api = {
  session: () => request('session'),
  login: (payload) => request('login', { method: 'POST', body: payload }),
  logout: () => request('logout', { method: 'POST' }),

  stats: () => request('stats'),
  files: () => request('files'),
  addFile: (path) => request('files', { method: 'POST', body: { path } }),
  deleteFile: (sha256) => request(`files/${sha256}`, { method: 'DELETE' }),
  refreshLink: (sha256) => request(`files/${sha256}/refresh`, { method: 'POST' }),

  blacklist: () => request('blacklist'),
  addBlacklist: (ip, reason) => request('blacklist', { method: 'POST', body: { ip, reason } }),
  removeBlacklist: (ip) => request(`blacklist/${encodeURIComponent(ip)}`, { method: 'DELETE' }),

  config: () => request('config'),
  saveConfig: (payload) => request('config', { method: 'PUT', body: payload }),

  captchaUrl: () => `${toUrl('captcha')}?t=${Date.now()}`,
};

/**
 * 3.8 复制链接：仅在点击瞬间请求一次最新链接，不做轮询。
 * 使用规格指定的公开接口 /api/filelink。
 */
export async function fetchDownloadUrl(sha256) {
  const response = await fetch(`/api/filelink?sha256=${encodeURIComponent(sha256)}`, {
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || '获取下载链接失败');
  return data.url;
}

export default api;
