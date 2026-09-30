// 工擎云护 Service Worker：外勤离线外壳
// 策略：导航请求网络优先回退缓存页；构建产物缓存优先；上传图片 SWR；API 直连（由页面快照层兜底）
const CACHE = 'fleetcare-shell-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return // POST/PATCH 直发，离线由发件箱处理
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return // API 交给页面 IndexedDB 快照层

  // 导航：网络优先，离线回退缓存的 index.html
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone()
      caches.open(CACHE).then(c => c.put('/index.html', copy))
      return res
    }).catch(() => caches.match('/index.html').then(r => r || caches.match('/'))))
    return
  }

  // 构建静态资源：缓存优先
  if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.svg')) {
    e.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone()
      caches.open(CACHE).then(c => c.put(req, copy))
      return res
    })))
    return
  }

  // 已上传照片：stale-while-revalidate
  if (url.pathname.startsWith('/uploads/')) {
    e.respondWith(caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(req, copy))
        return res
      }).catch(() => cached)
      return cached || network
    }))
  }
})
