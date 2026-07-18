// 太阳系中华名人堂 · Service Worker
// 策略：安装时预缓存 app shell；运行时对同源静态资源 stale-while-revalidate；
//       对数据 JSON（index.json / 维度数组 / 人物详情）network-first，永远展示最新数据，离线再回退缓存；
//       导航请求 network-first 回退缓存；跨域资源（Google Fonts）不缓存。
// 缓存版本号变更（chof-vN）即视为一次破坏性更新：activate 会清掉旧缓存，强制拉取新 app shell。
const CACHE = 'chof-v2';
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

  // 数据 JSON：network-first，永远展示最新数据；离线/失败再回退缓存
  if (url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            caches.open(CACHE).then((c) => c.put(req, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 其余同源静态资源 stale-while-revalidate
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
