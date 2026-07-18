import * as THREE from 'three';

// 中文文字精灵：白色文字 + 维度色发光阴影，无 pill 背景（设计 4.3）。
// 返回 THREE.Sprite，可直接加入场景 / 分组。
export function createTextSprite(text, options = {}) {
  const { color = '#ffffff', sub = null, baseHeight = 1.0, fontWeight = 700 } = options;
  const dpr = 2;
  const fontPx = 40 * dpr;
  const subPx = 22 * dpr;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const family = '"Noto Serif SC", "Songti SC", serif';

  ctx.font = `${fontWeight} ${fontPx}px ${family}`;
  const mainW = ctx.measureText(text).width;
  let w = Math.ceil(mainW) + 24 * dpr;
  let h = Math.ceil(fontPx * 1.4);
  if (sub) {
    ctx.font = `300 ${subPx}px "Noto Sans SC", sans-serif`;
    const subW = ctx.measureText(sub).width;
    w = Math.max(w, Math.ceil(subW) + 16 * dpr);
    h += Math.ceil(subPx * 1.3);
  }
  canvas.width = w;
  canvas.height = h;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 主标题（白色 + 维度色发光）
  ctx.font = `${fontWeight} ${fontPx}px ${family}`;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 * dpr;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, sub ? h * 0.36 : h / 2);

  if (sub) {
    ctx.shadowBlur = 0;
    ctx.font = `300 ${subPx}px "Noto Sans SC", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(sub, w / 2, h * 0.78);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const sprite = new THREE.Sprite(material);
  const scaleFactor = (baseHeight / h) * dpr * 0.5;
  sprite.scale.set(w * scaleFactor, h * scaleFactor, 1);
  sprite.userData.isLabel = true;
  return sprite;
}
