import * as THREE from 'three';
import { CategoryPlanet } from './CategoryPlanet.js';
import { disposeObject } from '../utils/dispose.js';

// CategoryView —— L3「分类层」：进入某维度后，将该维度的所有子分类渲染为行星级球体，
// 绕维度中心（当前维度行星位置）环形排布。点击某颗分类行星下钻到 L4（该分类的名人卫星）。
// 进入 L4 时本视图作为上层淡出背景保留（setFaded）。
export class CategoryView {
  constructor(dataManager, dimId, center) {
    this.dm = dataManager;
    this.dimId = dimId;
    this.meta = dataManager.getDim(dimId);
    this.center = center.clone();
    this.cacheSignature = `cat:${dimId}`;

    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.planets = [];      // [{ name, planet }]
    this.fade = 1.0;
    this.fadeTarget = 1.0;

    this._build();
  }

  _build() {
    const cats = (this.meta.categories || []).filter(c => c.count > 0);
    const n = cats.length || 1;
    const R = 7 + n * 0.9;   // 分类环半径：随分类数适度扩张，避免拥挤

    cats.forEach((cat, i) => {
      const angle = (i / n) * Math.PI * 2;
      const radius = Math.max(0.9, Math.min(1.7, 0.9 + cat.count * 0.05));
      const planet = new CategoryPlanet({
        name: cat.name,
        color: this.meta.color,
        radius,
        categoryName: cat.name,
        dimId: this.dimId,
      }).create();
      planet.group.position.set(R * Math.cos(angle), 0, R * Math.sin(angle));
      this.group.add(planet.group);
      this.planets.push({ name: cat.name, planet, angle, ringR: R });
    });
  }

  getCategoryWorldPos(categoryName) {
    const p = this.planets.find(x => x.name === categoryName);
    if (!p) return this.center.clone();
    return p.planet.getWorldPosition(new THREE.Vector3());
  }

  setFaded(faded) { this.fadeTarget = faded ? 0.12 : 1.0; }

  getClickables() {
    const list = [];
    for (const p of this.planets) list.push(...p.planet.getClickables());
    return list;
  }

  // 分类行星标签内嵌于球体（由 CategoryPlanet.update 按 fade 控制显隐），无需按距离 gating
  forEachMoon() {}

  update(time) {
    this.fade += (this.fadeTarget - this.fade) * 0.12;
    for (const p of this.planets) {
      p.planet.setFade(this.fade);
      p.planet.update(time);
    }
  }

  dispose() {
    for (const p of this.planets) p.planet.dispose();
    disposeObject(this.group);
  }
}
