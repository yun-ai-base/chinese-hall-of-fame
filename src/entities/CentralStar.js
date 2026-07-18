import * as THREE from 'three';
import { createPlanetNameSprite } from '../ui/Label.js';
import { makePlanetTexture } from '../utils/planetTexture.js';
import { disposeObject } from '../utils/dispose.js';

// CentralStar —— 每一层级的「中央恒星」：
//   · 宇宙层（L1）= 太阳（见 Sun.js）
//   · 维度层（L2 / CategoryView）= 维度恒星，代表当前维度
//   · 分类层（L3 / CategoryFigureView）= 分类恒星，代表当前分类，且固定位于视图中心
// 自带程序化起伏纹理 + 较强自发光 + 大辉光 + 内部名字标签，并持续自转轴转，
// 解决「中心分类星球不可见」与「各级恒星不会自转」两个问题。
export class CentralStar {
  constructor({ name, color, radius = 2.2, categoryName = null, dimId = null, kind = 'centralStar' }) {
    this.name = name;
    this.color = color;
    this.radius = radius;
    this.categoryName = categoryName;
    this.dimId = dimId;
    this.kind = kind; // 'dimStar' | 'catStar'
    this.mesh = null;
    this.glow = null;
    this.label = null;
    this.group = new THREE.Group();
    this.fade = 1.0;
    this.fadeTarget = 1.0;
  }

  create() {
    const tex = this._createTexture();
    const geometry = new THREE.SphereGeometry(this.radius, 48, 48);
    const material = new THREE.MeshStandardMaterial({
      map: tex.map,
      emissiveMap: tex.emissiveMap,
      emissive: new THREE.Color(this.color),
      emissiveIntensity: 0.6, // 明显高于普通行星，呈现恒星质感
      roughness: 0.5,
      metalness: 0.05,
      transparent: true,
      opacity: 1.0,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.userData = {
      kind: this.kind,
      name: this.name,
      categoryName: this.categoryName,
      dimId: this.dimId,
      star: this,
    };

    this.glow = this._createGlow();
    this.label = createPlanetNameSprite(this.name, this.color, this.radius, { clean: true });
    this.label.position.set(0, 0, 0);

    this.group.add(this.mesh);
    this.group.add(this.glow);
    this.group.add(this.label);
    return this;
  }

  _createTexture() {
    const { map, emissiveMap, repeat } = makePlanetTexture(this.color, { seed: this._texSeed() });
    const m = new THREE.CanvasTexture(map);
    m.wrapS = m.wrapT = THREE.RepeatWrapping;
    m.repeat.set(repeat[0], repeat[1]);
    const e = new THREE.CanvasTexture(emissiveMap);
    e.wrapS = e.wrapT = THREE.RepeatWrapping;
    e.repeat.set(repeat[0], repeat[1]);
    return { map: m, emissiveMap: e };
  }

  _texSeed() {
    let s = 0;
    const k = this.categoryName || this.name;
    for (let i = 0; i < k.length; i++) s = (s * 31 + k.charCodeAt(i)) | 0;
    return (s >>> 0) || 7;
  }

  _createGlow() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = new THREE.Color(this.color);
    const r = c.r * 255 | 0, g = c.g * 255 | 0, b = c.b * 255 | 0;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(0.35, `rgba(${r},${g},${b},0.22)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(this.radius * 5, this.radius * 5, 1);
    return sprite;
  }

  getWorldPosition(target) { return this.mesh.getWorldPosition(target); }
  setFade(target) { this.fadeTarget = target; }

  update(time) {
    if (this.mesh) this.mesh.rotation.y += 0.004; // 恒星持续自转
    this.fade += (this.fadeTarget - this.fade) * 0.12;
    if (this.glow) this.glow.material.opacity = this.fade;
    if (this.mesh) this.mesh.material.opacity = Math.max(this.fade, 0.06);
    if (this.label) this.label.visible = this.fade > 0.6;
  }

  getClickables() { return [this.mesh]; }

  dispose() { disposeObject(this.group); }
}
