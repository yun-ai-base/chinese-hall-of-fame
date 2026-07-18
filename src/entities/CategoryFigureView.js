import * as THREE from 'three';
import { Moon } from './Moon.js';
import { OrbitRing } from './OrbitRing.js';
import { disposeObject } from '../utils/dispose.js';

// CategoryFigureView —— L4「分类名人层」：进入某分类后，将该分类下的名人渲染为卫星，
// 绕分类中心（该分类行星位置）按年代圆周排布。点击名人→弹详情面板（严格四层，不进关系网 3D 层）。
// 进入本层时，上层 L3 分类视图（CategoryView）作为淡出背景保留。
export class CategoryFigureView {
  constructor(dataManager, dimId, categoryName, center) {
    this.dm = dataManager;
    this.dimId = dimId;
    this.categoryName = categoryName;
    this.meta = dataManager.getDim(dimId);
    this.center = center.clone();
    this.cacheSignature = `catfig:${dimId}:${categoryName}`;

    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.moons = [];
    this.rings = [];
    this.fade = 1.0;
    this.fadeTarget = 1.0;

    this._build();
  }

  _build() {
    const figures = this.dm.getDimFigures(this.dimId)
      .filter(f => f.category === this.categoryName)
      .sort((a, b) => a.sortYear - b.sortYear);
    const perRing = 12;
    const innerR = 3.6;
    const ringGap = 1.8;
    const colorHex = new THREE.Color(this.meta.color).getHex();

    figures.forEach((fe, i) => {
      const ringIndex = Math.floor(i / perRing);
      const idxInRing = i % perRing;
      const R = innerR + ringIndex * ringGap;
      const angle = (idxInRing / perRing) * Math.PI * 2 + ringIndex * 0.4;
      const moon = new Moon({
        name: fe.basic.name,
        color: this.meta.color,
        radius: 0.42,
        kind: 'figure',
        figureId: fe.id,
        dimId: this.dimId,
        sub: fe.basic.dynasty,
        isInList: true,
      });
      moon.group.position.set(R * Math.cos(angle), 0, R * Math.sin(angle));
      this.group.add(moon.group);
      this.moons.push(moon);

      if (idxInRing === 0) {
        const ring = new OrbitRing(R, colorHex);
        ring.create(this.group);
        this.rings.push(ring);
      }
    });
  }

  setFaded(faded) {
    this.fadeTarget = faded ? 0.04 : 1.0;
    const target = faded ? 0.04 : 0.42;
    for (const r of this.rings) {
      const m = r.mesh.material;
      m.opacity += (target - m.opacity) * 0.1;
    }
  }

  getClickables() {
    const list = [];
    for (const m of this.moons) list.push(...m.getClickables());
    return list;
  }

  forEachMoon(cb) { for (const m of this.moons) cb(m); }

  update(time) {
    this.group.rotation.y += 0.0012; // 卫星缓慢绕分类中心公转
    this.fade += (this.fadeTarget - this.fade) * 0.12;
    for (const m of this.moons) {
      m.setFade(this.fade);
      m.update(time);
    }
  }

  dispose() {
    for (const m of this.moons) m.dispose();
    for (const r of this.rings) if (r.mesh) disposeObject(r.mesh);
    disposeObject(this.group);
  }
}
