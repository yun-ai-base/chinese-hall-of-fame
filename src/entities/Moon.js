import * as THREE from 'three';
import { createPlanetNameSprite } from '../ui/Label.js';
import { disposeObject } from '../utils/dispose.js';

// Moon —— 可点击的卫星实体（名人卫星 / 关联人物卫星 / 分类 hub）。
// 携带 userData，供 Raycaster 命中后由 main 编排导航。
export class Moon {
  constructor(opts) {
    const {
      name, color = '#ffffff', radius = 0.5,
      kind = 'figure', figureId = null, targetId = null,
      isInList = false, dimId = null, sub = null, isHub = false,
    } = opts;

    this.name = name;
    this.color = color;
    this.kind = kind;            // 'figure' | 'relation' | 'category' | 'self'
    this.figureId = figureId;
    this.targetId = targetId;
    this.isInList = isInList;
    this.dimId = dimId;
    this.isHub = isHub;
    this.radius = radius;

    this.group = new THREE.Group();
    this._build();
  }

  _build() {
    const col = new THREE.Color(this.color);

    // 主体球
    const geo = new THREE.SphereGeometry(this.radius, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: this.isHub ? 0.05 : (this.isInList ? 0.3 : 0.12),
      roughness: 0.5,
      metalness: 0.1,
      transparent: !this.isInList,
      opacity: this.isInList ? 1.0 : 0.85,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.group.add(this.mesh);

    // 辉光
    const glow = this._makeGlow(col, this.radius);
    this.group.add(glow);

    // 名字内嵌于球体「内部」（居中、朝相机、depthTest:false 始终绘制于球体之上），不再浮在外侧
    this.label = createPlanetNameSprite(this.name, this.color, this.radius);
    this.label.position.set(0, 0, 0);
    this.group.add(this.label);

    // 不可见放大碰撞体（移动端热区 +50%）
    const hitGeo = new THREE.SphereGeometry(this.radius * 2.6, 10, 10);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hit = new THREE.Mesh(hitGeo, hitMat);
    this.group.add(this.hit);

    // 统一 userData（mesh 与 hit 共享）
    const ud = {
      kind: this.kind, name: this.name, figureId: this.figureId,
      targetId: this.targetId, isInList: this.isInList, dimId: this.dimId,
      isHub: this.isHub, moon: this, sub: this.sub,
    };
    this.mesh.userData = ud;
    this.hit.userData = ud;

    this.fade = 1.0;
    this.fadeTarget = 1.0;
  }

  _makeGlow(color, radius) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = color.clone();
    const grad = ctx.createRadialGradient(size/2, size/2, 1, size/2, size/2, size/2);
    grad.addColorStop(0, `rgba(${c.r*255|0},${c.g*255|0},${c.b*255|0},0.5)`);
    grad.addColorStop(0.4, `rgba(${c.r*255|0},${c.g*255|0},${c.b*255|0},0.18)`);
    grad.addColorStop(1, `rgba(${c.r*255|0},${c.g*255|0},${c.b*255|0},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(radius * 5, radius * 5, 1);
    return sprite;
  }

  getClickables() { return [this.hit]; }
  getWorldPosition(target) { return this.group.getWorldPosition(target); }
  setLabelVisible(v) { if (this.label) this.label.visible = v; }
  setVisible(v) { this.group.visible = v; }

  // 淡出控制（上一层轨道变淡时，卫星一起变暗）
  setFade(target) { this.fadeTarget = target; }

  // 选中高亮：点击名人时放大并增强自发光，其余卫星保持常态（凸显度）
  setSelected(sel) {
    this._selected = sel;
    if (this.mesh && this.mesh.material) {
      this.mesh.material.emissiveIntensity = sel ? 0.95 : (this.isInList ? 0.3 : 0.12);
    }
    this.group.scale.setScalar(sel ? 1.5 : 1.0);
  }

  update(time) {
    this.mesh.rotation.y += 0.012;
    this.fade += (this.fadeTarget - this.fade) * 0.12;
    if (this.mesh.material) this.mesh.material.opacity = Math.max(this.fade, 0.05);
    if (this.glow) this.glow.material.opacity = this.fade;
    if (this.label) this.label.visible = this.fade > 0.6;
  }

  dispose() {
    disposeObject(this.group);
  }
}
