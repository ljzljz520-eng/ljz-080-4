// 同源请求；开发环境经 Vite proxy 转发到 :4000
export async function api(path, { method = 'GET', body, reqId } = {}) {
  const headers = {};
  if (body && method !== 'GET') headers['Content-Type'] = 'application/json';
  if (reqId) headers['x-client-req-id'] = reqId;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `请求失败（${res.status}）`), { status: res.status, offline: data.offline });
  return data;
}

export const get = (p) => api(p);
export const post = (p, body, reqId) => api(p, { method: 'POST', body, reqId });

export function uuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
