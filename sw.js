// 太阳系中华名人堂 · Service Worker
// 策略（2026-08-09 重构）：**全量 network-first** —— 导航/数据/静态资源一律「有网即最新」，
//   缓存仅作离线兜底。历史教训：旧版静态资源 stale-while-revalidate（缓存优先）导致
//   每次访问先返回旧版、必须强刷才见新内容；现改为网络优先后，普通刷新/重开即最新。
// 缓存版本：优先读取 manifest.webmanifest 的 version 字段（部署时只需 bump 一处），
// 读取失败回退硬编码 CACHE_FALLBACK。浏览器每次部署后因源码变化触发 reinstall →
// activate 自动清掉旧版本缓存并刷新已打开的页面（用户无感升级）。
const CACHE_FALLBACK = 'chof-v5';
let CURRENT_CACHE = CACHE_FALLBACK;
let IS_UPGRADE = false;   // install 时检测：存在旧缓存 → 升级（激活后刷新页面）

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
      // 升级检测：若已有非当前版本的旧缓存 → 本次是「升级」（需激活后刷新页面）；
      // 首次安装（无旧缓存）不刷新，避免用户首访无谓多刷一次。
      return caches.keys().then((keys) => {
        IS_UPGRADE = keys.some((k) => k !== CURRENT_CACHE);
        return caches.open(CURRENT_CACHE)
          .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch((err) => {
            // 单条缺失不应阻断整个 install（开发期模块变动频繁）
            console.warn('[SW] skip precache:', u, err && err.message);
          }))))
          .then(() => self.skipWaiting());
      });
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CURRENT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      // 仅「升级」时刷新所有已打开页面：用户无需手动强刷即可看到新版本
      // （配合 network-first，此后普通刷新/重开永远是最新）。首次安装不刷新。
      .then(() => {
        if (!IS_UPGRADE) return;
        return self.clients.matchAll({ type: 'window' }).then((cs) =>
          cs.forEach((c) => { try { c.navigate(c.url); } catch (err) { /* 忽略不可控页 */ } })
        );
      })
  );
});

// 始终以合成 Response 兜底（即使缓存与网络都失败，也回 200 空响应，避免 respondWith(undefined) 报错）
const FALLBACK_204 = () => new Response(null, { status: 204, statusText: 'No Content' });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域不缓存

  // 统一 network-first：导航/数据/静态资源全部「有网即最新」，缓存仅作离线兜底。
  // 历史教训：旧版静态资源用 stale-while-revalidate（缓存优先）→ 每次访问先返回旧版，
  // 用户必须强刷（绕过 SW）才看到新内容。改为网络优先后，普通刷新/重开即最新。
  e.respondWith(
    fetch(req)
      .then((res) => {
        // 成功响应（basic 同源）写回缓存供离线使用
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CURRENT_CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || FALLBACK_204())
  );
});
