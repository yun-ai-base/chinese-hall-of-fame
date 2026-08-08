import * as THREE from 'three';

// 确定性伪随机（同样 seed 生成同样表面，刷新不突变）
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// ---- 环绕值噪声（u 经度环绕，消除球面纹理接缝）----
function makeWrapNoise(rand, size) {
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return function (u, v) {
    const x = u * size, y = v * size;
    const x0 = Math.floor(x) % size, y0 = Math.floor(y) % size;
    const x1 = (x0 + 1) % size, y1 = (y0 + 1) % size;
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v00 = grid[y0 * size + x0], v01 = grid[y0 * size + x1];
    const v10 = grid[y1 * size + x0], v11 = grid[y1 * size + x1];
    return v00 + (v01 - v00) * sx + (v10 - v00) * sy
         + (v00 - v01 - v10 + v11) * sx * sy;
  };
}

// fbm：分形噪声（oct 层叠加），noise 由各 surface 闭包持有（创建一次，禁止每像素重建！）
function fbm(noise, u, v, oct) {
  let sum = 0, amp = 0, a = 0.55, x = u, y = v;
  for (let i = 0; i < oct; i++) {
    sum += a * noise(x, y);
    amp += a;
    x = x * 2.01 + 3.71;
    y = y * 2.03 + 1.47;
    a *= 0.5;
  }
  return sum / amp;
}

const writePx = (data, i, c) => {
  data[i] = clamp01(c[0]) * 255;
  data[i + 1] = clamp01(c[1]) * 255;
  data[i + 2] = clamp01(c[2]) * 255;
  data[i + 3] = 255;
};

// ---- 像素级渲染器：u∈[0,1] 经度（环绕），v∈[0,1] 纬度（0 北 → 1 南）----
function render(w, h, fn) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      writePx(data, (y * w + x) * 4, fn(u, v));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---- 各行星类型的写实表面（工厂：先建噪声/调色板，返回逐像素函数）----

// 气态巨星：高斯权重横向带 + 湍流边界扰动 + 极点暗化
function gasBandsSurface(rand, bands, turbAmp) {
  const noise = makeWrapNoise(rand, 128);   // 只建一次！
  const k = 26;
  return (u, v) => {
    const vt = v + fbm(noise, u * 3.0, v * 4.0, 4) * turbAmp;
    let r = 0, g = 0, b = 0, wsum = 0;
    for (const bd of bands) {
      const d = (vt - bd.t) / bd.h;
      const wgt = Math.exp(-d * d * k);
      r += bd.c[0] * wgt; g += bd.c[1] * wgt; b += bd.c[2] * wgt;
      wsum += wgt;
    }
    let c = [r / wsum, g / wsum, b / wsum];
    const pole = Math.max(0, (v - 0.5) * 2);
    c = lerp3(c, [c[0] * 0.86, c[1] * 0.82, c[2] * 0.8], Math.pow(pole, 3));
    const d2 = (fbm(noise, u * 9.0, v * 11.0, 3) - 0.5) * 0.06;
    return [c[0] + d2, c[1] + d2, c[2] + d2];
  };
}

// 木星：橙/棕/奶油多带 + 大红斑
function jupiterSurface(rand) {
  const base = gasBandsSurface(rand, [
    { t: 0.06, h: 0.05, c: [0.93, 0.82, 0.62] },
    { t: 0.15, h: 0.06, c: [0.78, 0.52, 0.32] },
    { t: 0.26, h: 0.06, c: [0.96, 0.90, 0.78] },
    { t: 0.38, h: 0.07, c: [0.70, 0.46, 0.28] },
    { t: 0.50, h: 0.06, c: [0.99, 0.95, 0.86] },
    { t: 0.62, h: 0.06, c: [0.78, 0.52, 0.32] },
    { t: 0.73, h: 0.06, c: [0.93, 0.84, 0.68] },
    { t: 0.84, h: 0.06, c: [0.66, 0.42, 0.26] },
    { t: 0.93, h: 0.06, c: [0.88, 0.76, 0.58] },
  ], 0.022);
  const noise = makeWrapNoise(rand, 64);
  return (u, v) => {
    const c = base(u, v);
    const du = (u - 0.58) / 0.10, dv = (v - 0.62) / 0.045;
    const d = Math.sqrt(du * du + dv * dv);
    const edge = fbm(noise, u * 6.0, v * 6.0, 2);
    const spot = clamp01((d - 0.85) * 3 + (edge - 0.5) * 0.4);
    let out = lerp3(c, [0.71, 0.36, 0.22], (1 - spot) * 0.9);   // 大红斑
    out = lerp3(out, [0.96, 0.72, 0.48], clamp01((spot - 0.5) * 2) * 0.25);
    return out;
  };
}

// 土星：柔和淡金条纹（带少而宽，对比度低）
function saturnSurface(rand) {
  return gasBandsSurface(rand, [
    { t: 0.10, h: 0.08, c: [0.86, 0.78, 0.62] },
    { t: 0.25, h: 0.09, c: [0.93, 0.87, 0.73] },
    { t: 0.42, h: 0.08, c: [0.78, 0.68, 0.52] },
    { t: 0.58, h: 0.09, c: [0.94, 0.88, 0.76] },
    { t: 0.74, h: 0.08, c: [0.82, 0.73, 0.58] },
    { t: 0.89, h: 0.08, c: [0.90, 0.83, 0.68] },
  ], 0.016);
}

// 天王星：几乎均匀的淡青蓝
function uranusSurface(rand) {
  const noise = makeWrapNoise(rand, 64);
  const base = [0.62, 0.84, 0.90];
  return (u, v) => {
    const lat = Math.abs(v - 0.5) * 2;
    let c = lerp3(base, [base[0] * 1.02, base[1] * 1.0, base[2] * 0.97], Math.pow(lat, 2));
    const n = (fbm(noise, u * 4.0, v * 5.0, 3) - 0.5) * 0.025;
    return [c[0] + n, c[1] + n, c[2] + n];
  };
}

// 海王星：深蓝 + 细亮纱带 + 大暗斑
function neptuneSurface(rand) {
  const noise = makeWrapNoise(rand, 64);
  const base = [0.23, 0.34, 0.82];
  return (u, v) => {
    let c = base.slice();
    for (const t of [0.22, 0.38, 0.55, 0.7]) {
      const d = (v - t) / 0.045;
      c = lerp3(c, [0.80, 0.86, 0.98], Math.exp(-d * d * 8) * 0.22);
    }
    const du = (u - 0.42) / 0.08, dv = (v - 0.62) / 0.05;
    const d = Math.sqrt(du * du + dv * dv);
    const spot = clamp01((d - 0.9) * 3.2);
    c = lerp3(c, [0.10, 0.16, 0.48], (1 - spot) * 0.85);
    const n = (fbm(noise, u * 7.0, v * 8.0, 3) - 0.5) * 0.045;
    return [c[0] + n, c[1] + n, c[2] + n];
  };
}

// 金星：平滑奶黄（浓硫云完全覆盖）
function venusSurface(rand) {
  const noise = makeWrapNoise(rand, 48);
  const base = [0.96, 0.88, 0.70];
  return (u, v) => {
    const sw = (fbm(noise, u * 3.0, v * 3.0, 3) - 0.5) * 0.07;
    return [base[0] + sw, base[1] + sw, base[2] + sw * 0.6];
  };
}

// 水星：灰色陨石坑表面（坑数分层控制，避免每像素遍历过多）
function mercurySurface(rand) {
  const noise = makeWrapNoise(rand, 96);
  const base = [0.66, 0.64, 0.60];
  const craters = [];
  for (const [n, rmin, rmax, depth] of [[16, 0.05, 0.12, 0.42], [40, 0.02, 0.05, 0.3], [90, 0.006, 0.02, 0.2]]) {
    for (let i = 0; i < n; i++) {
      craters.push([rand(), rand(), rmin + rand() * (rmax - rmin), depth]);
    }
  }
  return (u, v) => {
    let c = base.slice();
    for (const [cx, cy, r, depth] of craters) {
      const dx = (u - cx), dy = (v - cy);
      let dd = Math.sqrt(dx * dx + dy * dy);
      const dxw = 1 - dx;   // 经度环绕短边
      dd = Math.min(dd, Math.sqrt(dxw * dxw + dy * dy));
      const inner = clamp01((dd - r * 0.55) / (r * 0.45));
      const ring = clamp01((r * 1.14 - dd) / (r * 0.2));
      c = lerp3(c, [c[0] * (1 - depth * 0.7), c[1] * (1 - depth * 0.7), c[2] * (1 - depth * 0.7)], (1 - inner) * 0.9);
      c = lerp3(c, [c[0] * 1.3, c[1] * 1.28, c[2] * 1.22], ring * 0.3 * depth);
    }
    const n = (fbm(noise, u * 8.0, v * 8.0, 3) - 0.5) * 0.06;
    return [c[0] + n, c[1] + n, c[2] + n];
  };
}

// 火星：红褐 + 暗色玄武岩区 + 白色极冠
function marsSurface(rand) {
  const noise = makeWrapNoise(rand, 96);
  return (u, v) => {
    let c = [0.80, 0.42, 0.24];
    const big = fbm(noise, u * 2.5, v * 2.5, 4);
    c = lerp3(c, [0.45, 0.22, 0.16], clamp01((big - 0.58) * 4) * 0.75);
    c = lerp3(c, [0.92, 0.62, 0.40], clamp01((0.42 - big) * 4) * 0.5);
    const lat = Math.abs(v - 0.5) * 2;
    c = lerp3(c, [0.98, 0.96, 0.92], clamp01((lat - 0.86) * 14));
    const n = (fbm(noise, u * 7.0, v * 7.0, 3) - 0.5) * 0.05;
    return [c[0] + n, c[1] + n, c[2] + n];
  };
}

// 地球：海洋 + 大陆 + 云层 + 极冠
function earthSurface(rand) {
  const noise = makeWrapNoise(rand, 128);
  const ocean = [0.08, 0.30, 0.62];
  return (u, v) => {
    const cont = fbm(noise, u * 2.2, v * 2.2, 5);
    const landMask = clamp01((cont - 0.545) * 9);
    const lat = Math.abs(v - 0.5) * 2;
    const landCol = lat < 0.35
      ? [0.28, 0.52, 0.28]
      : lat < 0.72
        ? [0.60, 0.47, 0.30]
        : [0.86, 0.84, 0.78];
    let c = lerp3(ocean, landCol, landMask);
    c = lerp3(c, [0.03, 0.12, 0.30], clamp01((0.40 - cont) * 4) * (1 - landMask));
    const cap = clamp01((lat - 0.84) * 16);
    c = lerp3(c, [0.95, 0.97, 1.0], cap * 0.95);
    const cloud = fbm(noise, u * 5.5, v * 5.5, 4);
    c = lerp3(c, [0.96, 0.97, 1.0], clamp01((cloud - 0.60) * 6) * 0.85 * (1 - cap * 0.8));
    return c;
  };
}

// 通用（分类星球 / 中央恒星）：保留原有维度色斑块风格
function genericSurface(rand, hexColor) {
  const base = new THREE.Color(hexColor);
  const r0 = base.r, g0 = base.g, b0 = base.b;
  const noise = makeWrapNoise(rand, 96);
  return (u, v) => {
    const n = fbm(noise, u * 4.0, v * 4.0, 4);
    const bright = (n - 0.5) * 0.55;
    const c = [r0 + bright, g0 + bright, b0 + bright];
    const lat = Math.abs(v - 0.5) * 2;
    return lerp3(c, [c[0] * 1.08, c[1] * 1.08, c[2] * 1.08], Math.pow(lat, 2.5) * 0.4);
  };
}

// 各类型纹理尺寸（木/土气态巨星更高分辨率）
const TYPE_SIZE = {
  jupiter: [1024, 512],
  saturn: [1024, 512],
  earth: [768, 384],
  generic: [256, 128],
};
const DEF_SIZE = [512, 256];

const SURFACES = {
  jupiter: jupiterSurface,
  saturn: saturnSurface,
  uranus: uranusSurface,
  neptune: neptuneSurface,
  venus: venusSurface,
  mercury: mercurySurface,
  mars: marsSurface,
  earth: earthSurface,
};

// 生成带明暗起伏的球面纹理（模拟真实行星外观），供 Planet 使用。
// type: mercury | venus | earth | mars | jupiter | saturn | uranus | neptune | generic
// 返回 { map, emissiveMap, repeat }（调用方包成 CanvasTexture）。
export function makePlanetTexture(hexColor, opts = {}) {
  const seed = opts.seed ?? 1337;
  const rand = mulberry32(seed);
  const type = opts.type || 'generic';
  const [w, h] = TYPE_SIZE[type] || DEF_SIZE;

  const factory = SURFACES[type];
  const surface = factory
    ? render(w, h, factory(rand))
    : render(w, h, genericSurface(rand, hexColor));

  // emissiveMap：表面纹理的暗化版，让背光面也保留地形暗纹但不发亮
  const emis = document.createElement('canvas');
  emis.width = w; emis.height = h;
  const ectx = emis.getContext('2d');
  ectx.drawImage(surface, 0, 0);
  ectx.fillStyle = 'rgba(0,0,0,0.62)';
  ectx.fillRect(0, 0, w, h);

  // 写实行星横向不重复（避免条纹/大陆细节出现两份）；generic 保留重复
  const realistic = !!factory;
  const repeat = realistic ? [1, 1] : [2, 1];

  return { map: surface, emissiveMap: emis, repeat };
}
