// Outbox 同步引擎：
// 1) 离线时所有写操作进入 IndexedDB 队列
// 2) 恢复联网/回到页面时自动 FIFO 重放
// 3) 照片先上传拿到 URL，再提交工单正文；每条记录带幂等键防重复
import { post, uuid } from './api';
import { kvSet, kvGet, outboxAdd, outboxAll, outboxPut, outboxDel } from './idb';
import { toast } from './toast';

export const snapKey = (techId) => `techWorkOrders:${techId || 'anon'}`;

export async function saveSnapshot(key, list) {
  await kvSet(key, { list, savedAt: new Date().toISOString() });
}
export async function loadSnapshot(key) {
  return (await kvGet(key)) || { list: [], savedAt: null };
}

export function queueablePath(path) {
  return /^\/api\/(work-orders\/[^/]+\/(report|transition)|photos)$/.test(path);
}

// 统一写入口：在线直连；离线（或请求因网络失败）入队
export async function enqueueOrSend({ path, body, label }, { online = navigator.onLine } = {}) {
  const item = {
    id: uuid(),
    path,
    body,
    label: label || '上报',
    reqId: uuid(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    state: 'pending'
  };
  if (!online) {
    await outboxAdd(item);
    emitCurrent();
    return { queued: true, item };
  }
  try {
    const data = await post(path, body, item.reqId);
    return { queued: false, data };
  } catch (e) {
    if (e.status && !e.offline) throw e; // 服务端业务错误，不排队
    await outboxAdd(item);
    emitCurrent();
    return { queued: true, item, networkError: true };
  }
}

// 重放单条队列：照片先传，替换报告中的本地 blob 引用
async function replay(item) {
  let body = structuredClone(item.body);
  if (item.path.endsWith('/report') && Array.isArray(body.photos)) {
    const uploaded = [];
    for (const ph of body.photos) {
      if (ph.url && ph.url.startsWith('/uploads/')) {
        uploaded.push(ph); // 之前已传过
        continue;
      }
      const res = await post('/api/photos', { dataUrl: ph.dataUrl, filename: ph.filename }, `photo-${item.id}-${ph.fid}`);
      uploaded.push({ url: res.url, filename: res.filename });
    }
    body.photos = uploaded;
  }
  await post(item.path, body, item.reqId);
}

let flushing = false;
const listeners = new Set();
const emit = (state) => listeners.forEach((fn) => fn(state));
async function emitCurrent(flushingState = false) {
  emit({ items: await outboxAll(), flushing: flushingState });
}

export function onOutboxChange(fn) {
  listeners.add(fn);
  outboxAll().then((items) => fn({ items, flushing: false }));
  return () => listeners.delete(fn);
}

export async function flushOutbox() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  let items = await outboxAll();
  const pending = items.filter((i) => i.state !== 'done').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!pending.length) {
    flushing = false;
    emit({ items: [], flushing: false });
    return;
  }
  emit({ items: pending, flushing: true });

  let success = 0;
  let failed = 0;
  for (const item of pending) {
    try {
      item.attempts += 1;
      await replay(item);
      await outboxDel(item.id);
      success++;
    } catch (e) {
      failed++;
      if (e.status === 409) {
        // 状态已推进（如重复点击/重放），视为达成
        await outboxDel(item.id);
        continue;
      }
      item.state = 'error';
      item.lastError = e.message;
      await outboxPut(item); // 保留供下次重试或人工处理
    }
  }
  flushing = false;
  items = await outboxAll();
  emit({ items, flushing: false });
  if (success && !failed) toast(`离线队列已同步：${success} 条上报成功`, 'ok');
  else if (success) toast(`已同步 ${success} 条，${failed} 条待重试`, 'info');
  else if (failed) toast('部分上报失败，将在联网后自动重试', 'err');
}

export async function retryOutbox() {
  return flushOutbox();
}

// 自动触发：恢复联网、回到标签页、定时
export function startOutboxWatcher() {
  const go = () => flushOutbox().catch(() => {});
  window.addEventListener('online', go);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && navigator.onLine && go());
  setInterval(go, 20000);
}
