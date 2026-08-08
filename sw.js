// 太阳系中华名人堂 · Service Worker
// 策略：安装时预缓存 app shell（+ 全部 src 模块，确保离线启动可用）；
//       运行时对同源静态资源 stale-while-revalidate；
//       对数据 JSON（index.json / 维度数组 / 人物详情）network-first，永远展示最新数据，离线再回退缓存；
//       导航请求 network-first 回退缓存；跨域资源不缓存（防御性）。
// 缓存版本：优先读取 manifest.webmanifest 的 version 字段（部署时只需 bump 一处），
// 读取失败回退硬编码 CACHE_FALLBACK。浏览器每次部署后因源码变化触发 reinstall →
// activate 自动清掉旧版本缓存，强制拉取新 app shell。
const CACHE_FALLBACK = 'chof-v5';
let CURRENT_CACHE = CACHE_FALLBACK;

async function resolveCacheName() {
  try {
    const res = await fetch('./manifest.webmanifest');
    const m = await res.json();
    if (m && m.version) {
      return 'chof-' + String(m.version).replace(/[^a-zA-Z0-9._-]/g, '_');
    }
  } catch (e) {
    console.warn('[SW] manifest version unavailable, fallback:', e && e.message);
  }
  return CACHE_FALLBACK;
}


// app shell：HTML + CSS + 入口 JS + Three 本地 vendor + 全部 src 模块
//   完整预缓存保证：首次访问后即使离线，也能完整加载整个应用（不依赖运行时网络）
const SRC_FILES = [
  './src/main.js',
  './src/core/SceneManager.js',
  './src/core/CameraController.js',
  './src/core/OrbitSystem.js',
  './src/core/Raycaster.js',
  './src/data/DataManager.js',
  './src/data/DataLoader.js',
  './src/data/StateMachine.js',
  './src/entities/Sun.js',
  './src/entities/Planet.js',
  './src/entities/Moon.js',
  './src/entities/CentralStar.js',
  './src/entities/CategoryPlanet.js',
  './src/entities/CategoryView.js',
  './src/entities/CategoryFigureView.js',
  './src/entities/FigureView.js',
  './src/entities/OrbitRing.js',
  './src/ui/InfoPanel.js',
  './src/ui/Search.js',
  './src/ui/Breadcrumb.js',
  './src/ui/RelationMap.js',
  './src/ui/ChineseStarMap.js',
  './src/ui/Label.js',
  './src/ui/dom.js',
  './src/utils/dispose.js',
  './src/utils/easing.js',
  './src/utils/shaders.js',
  './src/utils/planetTexture.js',
  './src/utils/colorScale.js',
];
const SHELL = [
  './',
  './index.html',
  './styles/main.css',
  './manifest.webmanifest',
  './favicon.svg',
  './vendor/three/three.module.js',
  './vendor/three/OrbitControls.js',
  './data/index.json',
  ...SRC_FILES,
];

// 安装：先解析缓存名（manifest version），再单条预缓存（单条失败不阻断整体）
self.addEventListener('install', (e) => {
  e.waitUntil(
    resolveCacheName().then((name) => {
      CURRENT_CACHE = name;
      return caches.open(CURRENT_CACHE)
        .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch((err) => {
          // 单条缺失不应阻断整个 install（开发期模块变动频繁）
          console.warn('[SW] skip precache:', u, err && err.message);
        }))))
        .then(() => self.skipWaiting());
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CURRENT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 始终以合成 Response 兜底（即使缓存与网络都失败，也回 200 空响应，避免 respondWith(undefined) 报错）
const FALLBACK_204 = () => new Response(null, { status: 204, statusText: 'No Content' });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域不缓存

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(async () => (await caches.match('./index.html')) || FALLBACK_204())
    );
    return;
  }

  // 数据 JSON：network-first，永远展示最新数据；离线/失败再回退缓存
  if (url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            caches.open(CURRENT_CACHE).then((c) => c.put(req, res.clone()));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || FALLBACK_204())
    );
    return;
  }

  // 其余同源静态资源 stale-while-revalidate（缓存优先，否则等网络）
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            caches.open(CURRENT_CACHE).then((c) => c.put(req, res.clone()));
          }
          return res;
        })
        .catch(() => null);
      return cached || net || FALLBACK_204();
    })
  );
});
