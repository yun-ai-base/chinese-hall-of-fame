import * as THREE from 'three';

// 中文文字精灵：白色文字 + 维度色发光阴影，无 pill 背景（设计 4.3）。
// 返回 THREE.Sprite，可直接加入场景 / 分组。
export function createTextSprite(text, options = {}) {
  const { color = '#ffffff', sub = null, baseHeight = 1.0, fontWeight = 700, outline = false, outlineColor = 'rgba(0,0,0,0.85)' } = options;
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

  if (outline) {
    ctx.lineWidth = 7 * dpr;
    ctx.strokeStyle = outlineColor;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, w / 2, sub ? h * 0.36 : h / 2);
  }

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

// 行星名内嵌标签：把维度名写在星球「内部」（居中、朝向相机、不浮在外侧）。
// 文字尺寸按星球直径自适应缩放，使其落在星球圆盘内（约 82% 直径宽），
// 高对比：白字 + 深色描边；depthTest:false 避免被星球本体遮挡。
export function createPlanetNameSprite(text, color, radius) {
  const dpr = 2;
  const fontPx = 64 * dpr;
  const family = '"Noto Serif SC", "Songti SC", serif';

  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `700 ${fontPx}px ${family}`;
  const textW = measure.measureText(text).width;

  const pad = 24 * dpr;
  const w = Math.ceil(textW) + pad;
  const h = Math.ceil(fontPx * 1.15);

  // 目标：文字世界宽度 ≈ 星球直径 * 0.82（自适应长名，保证落在圆盘内）
  const targetW = radius * 2 * 0.82;
  const scaleFactor = targetW / w;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = `700 ${fontPx}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 深色描边（强对比，星球表面为彩色也能看清）
  ctx.lineWidth = 9 * dpr;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, w / 2, h / 2);

  // 白色主字 + 维度色发光
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 * dpr;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(w * scaleFactor, h * scaleFactor, 1);
  sprite.renderOrder = 999; // 始终绘制在星球之上
  sprite.userData.isLabel = true;
  return sprite;
}

