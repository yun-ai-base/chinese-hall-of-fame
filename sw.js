// 太阳系中华名人堂 · Service Worker
// 策略：安装时预缓存 app shell；运行时对同源资源 stale-while-revalidate；导航请求 network-first 回退缓存。
// 注意：跨域资源（unpkg 的 three/addons、Google Fonts）不缓存，离线时不可用。
//       后续「性能与资源优化」将 addons 本地化后可由本 SW 一并离线缓存。
const CACHE = 'chof-v1';
const SHELL = [
  './',
  './index.html',
  './styles/main.css',
  './manifest.webmanifest',
  './favicon.svg',
  './src/main.js',
  './vendor/three/three.module.js',
  './vendor/three/OrbitControls.js',
  './data/index.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域不缓存

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          caches.open(CACHE).then((c) => c.put(req, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
