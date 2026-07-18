import * as THREE from 'three';
import { Moon } from './Moon.js';
import { OrbitRing } from './OrbitRing.js';
import { CentralStar } from './CentralStar.js';
import { disposeObject } from '../utils/dispose.js';

// CategoryFigureView —— L4「分类名人层」：进入某分类后，将该分类下的名人渲染为卫星，
// 绕分类中心（中央分类恒星）按年代分圈公转，各自拥有独立轨道环轨迹与公转速度。
// 中心有一颗以分类命名的「分类恒星」并持续自转 —— 解决「点击分类星球后中心不可见」。
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
    this.star = null;
    this.fade = 1.0;
    this.fadeTarget = 1.0;

    this._build();
  }

  _build() {
    const figures = this.dm.getDimFigures(this.dimId)
      .filter(f => f.category === this.categoryName)
      .sort((a, b) => a.sortYear - b.sortYear);
    const perRing = 12;
    const innerR = 4.2;   // 让出中央恒星空间
    const ringGap = 1.8;
    const SPEED_K = 3.0;
    const colorHex = new THREE.Color(this.meta.color).getHex();

    // 中央分类恒星：固定位于视图中心，持续自转，代表当前分类
    this.star = new CentralStar({
      name: this.categoryName, color: this.meta.color, radius: 1.8,
      categoryName: this.categoryName, dimId: this.dimId, kind: 'catStar',
    }).create();
    this.group.add(this.star.group);

    figures.forEach((fe, i) => {
      const ringIndex = Math.floor(i / perRing);
      const idxInRing = i % perRing;
      const R = innerR + ringIndex * ringGap;
      const angle = (idxInRing / perRing) * Math.PI * 2 + ringIndex * 0.4;
      const speed = SPEED_K / Math.pow(R, 1.5);

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
      moon._angle = angle;
      moon._speed = speed;
      moon._orbitR = R;
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

  setCenter(center) {
    this.center.copy(center);
    this.group.position.copy(center);
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
    const list = [...this.star.getClickables()];
    for (const m of this.moons) list.push(...m.getClickables());
    return list;
  }

  forEachMoon(cb) { for (const m of this.moons) cb(m); }

  update(time) {
    this.fade += (this.fadeTarget - this.fade) * 0.12;
    if (this.star) { this.star.setFade(this.fade); this.star.update(time); }
    for (const m of this.moons) {
      // 各自沿独立轨道公转（错位轨道 + 不同速度）
      m._angle += m._speed * 0.016;
      m.group.position.set(
        m._orbitR * Math.cos(m._angle), 0, m._orbitR * Math.sin(m._angle)
      );
      m.setFade(this.fade);
      m.update(time);
    }
  }

  dispose() {
    if (this.star) this.star.dispose();
    for (const m of this.moons) m.dispose();
    for (const r of this.rings) if (r.mesh) disposeObject(r.mesh);
    disposeObject(this.group);
  }
}
