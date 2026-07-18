import * as THREE from 'three';

// 配色工具：解决「同一维度内分类星球 / 名人卫星颜色太相近、且与上一层颜色无区分度」的问题。
// 思路：
//   · 每个子分类在「维度主色」锚定的色环上均匀铺开（Even 分布），彼此区分度最大，
//     同时首个分类≈维度主色，保留与维度家族的视觉联系。
//   · 某分类下的名人卫星，在其「分类主色」锚定的色环上均匀铺开，彼此区分，
//     并与中央分类恒星（=该分类主色）明显不同。

function dimHsl(hex) {
  const c = new THREE.Color(hex);
  const h = {};
  c.getHSL(h);
  return h; // h,s,l ∈ [0,1]
}

function hexFromHsl(hDeg, s, l) {
  const c = new THREE.Color().setHSL((((hDeg % 360) + 360) % 360) / 360, s, l);
  return '#' + c.getHexString();
}

// 返回某维度下每个子分类的配色数组：[{ hex, hueDeg }]
export function categoryPalette(baseHex, total) {
  const n = Math.max(1, total);
  const { h } = dimHsl(baseHex);
  const baseHueDeg = h * 360;
  const arr = [];
  for (let i = 0; i < n; i++) {
    const hueDeg = (baseHueDeg + i * (360 / n)) % 360;
    arr.push({ hex: hexFromHsl(hueDeg, 0.62, 0.55), hueDeg });
  }
  return arr;
}

// 某分类下第 index 个（共 total 个）名人卫星的配色：在分类主色附近均匀铺开，彼此区分
export function figureColor(categoryHueDeg, index, total) {
  const n = Math.max(1, total);
  const hueDeg = (categoryHueDeg + (index + 0.5) * (360 / n)) % 360;
  const sat = 0.58 + (index % 3) * 0.05;
  const light = 0.5 + ((index % 4) - 1.5) * 0.04;
  return hexFromHsl(hueDeg, sat, light);
}
