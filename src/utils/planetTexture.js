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

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

// 生成带明暗起伏的球面纹理（模拟地形/体积感），供 Planet 与分类行星共用。
// 返回 { map, emissiveMap } 两个 canvas（调用方包成 CanvasTexture）。
export function makePlanetTexture(hexColor, opts = {}) {
  const w = 256, h = 128;
  const base = new THREE.Color(hexColor);
  const r0 = base.r * 255, g0 = base.g * 255, b0 = base.b * 255;
  const seed = opts.seed ?? 1337;
  const contrast = opts.contrast ?? 0.55;
  const rand = mulberry32(seed);

  const surface = document.createElement('canvas');
  surface.width = w; surface.height = h;
  const ctx = surface.getContext('2d');
  ctx.fillStyle = `rgb(${r0 | 0},${g0 | 0},${b0 | 0})`;
  ctx.fillRect(0, 0, w, h);

  // 多层明暗斑块：低频大块（大陆/明暗区）+ 中频 + 高频细节，叠加出起伏表面
  const layers = [
    { count: 14, rmin: 34, rmax: 78, amp: 0.62 },
    { count: 38, rmin: 12, rmax: 36, amp: 0.40 },
    { count: 96, rmin: 4, rmax: 15, amp: 0.24 },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.count; i++) {
      const x = rand() * w, y = rand() * h;
      const rad = L.rmin + rand() * (L.rmax - L.rmin);
      const bright = (rand() - 0.5) * 2 * L.amp * contrast; // [-amp*contrast, +amp*contrast]
      const rr = clamp(r0 + bright * 255);
      const gg = clamp(g0 + bright * 255);
      const bb = clamp(b0 + bright * 255);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(${rr},${gg},${bb},0.92)`);
      grad.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  // 极区（上下）略提亮，增强球体明暗层次
  const pole = ctx.createLinearGradient(0, 0, 0, h);
  pole.addColorStop(0, 'rgba(255,255,255,0.10)');
  pole.addColorStop(0.12, 'rgba(255,255,255,0)');
  pole.addColorStop(0.88, 'rgba(255,255,255,0)');
  pole.addColorStop(1, 'rgba(255,255,255,0.10)');
  ctx.fillStyle = pole;
  ctx.fillRect(0, 0, w, h);

  // emissiveMap：表面纹理的暗化版，让背光面也保留地形暗纹但不发亮
  const emis = document.createElement('canvas');
  emis.width = w; emis.height = h;
  const ectx = emis.getContext('2d');
  ectx.drawImage(surface, 0, 0);
  ectx.fillStyle = 'rgba(0,0,0,0.62)';
  ectx.fillRect(0, 0, w, h);

  return { map: surface, emissiveMap: emis, repeat: [2, 1] };
}
