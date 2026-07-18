import * as THREE from 'three';
import { createPlanetNameSprite } from '../ui/Label.js';
import { makePlanetTexture } from '../utils/planetTexture.js';
import { disposeObject } from '../utils/dispose.js';

// CategoryPlanet —— L3「分类行星」：进入维度后，每个子分类是一颗行星级球体
// （带地形明暗纹理 + 内部名字标签 + 柔光），绕维度中心环形排布。点击下钻到该分类的名人层。
// 与 Moon（卫星级小圆点 + 外部标签）在视觉上明显区分，体现「四层星系」的层级差。
export class CategoryPlanet {
  constructor({ name, color, radius, categoryName, dimId }) {
    this.name = name;
    this.color = color;
    this.radius = radius;
    this.categoryName = categoryName;
    this.dimId = dimId;
    this.mesh = null;
    this.glow = null;
    this.label = null;
    this.group = new THREE.Group();
    this.fade = 1.0;
    this.fadeTarget = 1.0;
  }

  create() {
    const tex = this._createTexture();
    const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      map: tex.map,
      emissiveMap: tex.emissiveMap,
      emissive: new THREE.Color(this.color),
      emissiveIntensity: 0.28,
      roughness: 0.55,
      metalness: 0.08,
      transparent: true,
      opacity: 1.0,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.userData = {
      kind: 'categoryPlanet', categoryName: this.categoryName,
      dimId: this.dimId, name: this.name, planet: this,
    };

    this.glow = this._createGlow();
    this.label = createPlanetNameSprite(this.name, this.color, this.radius);
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
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const c = new THREE.Color(this.color);
    const r = c.r * 255 | 0, g = c.g * 255 | 0, b = c.b * 255 | 0;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.32)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},0.1)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(this.radius * 3, this.radius * 3, 1);
    return sprite;
  }

  getWorldPosition(target) { return this.mesh.getWorldPosition(target); }

  setFade(target) { this.fadeTarget = target; }

  update(time) {
    if (this.mesh) this.mesh.rotation.y += 0.006; // 缓慢自转，强化球体立体感
    this.fade += (this.fadeTarget - this.fade) * 0.12;
    if (this.glow) this.glow.material.opacity = this.fade;
    if (this.mesh) this.mesh.material.opacity = Math.max(this.fade, 0.06);
    if (this.label) this.label.visible = this.fade > 0.6;
  }

  getClickables() { return [this.mesh]; }

  dispose() { disposeObject(this.group); }
}
