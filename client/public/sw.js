/* Service Worker：离线 App Shell 缓存 + API 只读缓存 + 离线横幅
   上报请求由页面 Outbox(IndexedDB) 负责排队，SW 仅做静态与 GET 缓存。 */
const VERSION = 'fleetcare-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求：网络优先，离线回退缓存壳
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put('/index.html', copy));
      return res;
    }).catch(() => caches.match('/index.html')));
    return;
  }

  // 带 hash 的构建资源：缓存优先
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }

  // API GET：网络优先并缓存最新响应（stale 时离线可读）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        return new Response(JSON.stringify({ offline: true, error: '当前离线且无本地缓存' }), {
          status: 503, headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // uploads 等其他同源 GET：缓存优先
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
