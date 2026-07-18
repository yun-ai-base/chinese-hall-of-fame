import * as THREE from 'three';
import { CategoryPlanet } from './CategoryPlanet.js';
import { OrbitRing } from './OrbitRing.js';
import { CentralStar } from './CentralStar.js';
import { categoryPalette } from '../utils/colorScale.js';
import { disposeObject } from '../utils/dispose.js';

// CategoryView —— L3「分类层」：进入某维度后，将该维度的所有子分类渲染为行星级球体，
// 绕维度中心（中央恒星）公转，各自拥有独立的轨道环轨迹、错位轨道半径与公转速度。
// 中心有一颗以维度命名的「维度恒星」，持续自转。
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
    this.planets = [];      // [{ name, planet, angle, speed, orbitRadius }]
    this.rings = [];
    this.star = null;
    this.fade = 1.0;
    this.fadeTarget = 1.0;

    this._build();
  }

  // 静态方法：给定维度中心，计算某分类星球在 L2 分类层中的世界位置（与 _build 布局一致）
  static computeCategoryWorldPos(dim, categoryName, dimCenter) {
    const cats = (dim.categories || []).filter(c => c.count > 0);
    const idx = cats.findIndex(c => c.name === categoryName);
    if (idx < 0) return dimCenter.clone();
    const n = cats.length || 1;
    const perRing = Math.max(1, Math.ceil(n / 2));
    const innerR = 6.5;
    const ringGap = 3.0;
    const ringIndex = Math.floor(idx / perRing);
    const idxInRing = idx % perRing;
    const R = innerR + ringIndex * ringGap;
    const angle = (idxInRing / perRing) * Math.PI * 2 + ringIndex * 0.6;
    return new THREE.Vector3(
      dimCenter.x + R * Math.cos(angle),
      dimCenter.y,
      dimCenter.z + R * Math.sin(angle)
    );
  }

  _build() {
    const dim = this.meta;
    const colorHex = new THREE.Color(dim.color).getHex();

    // 中央维度恒星：位于视图中心，持续自转，作为本层级的「恒星」（沿用维度主色）
    this.star = new CentralStar({
      name: dim.name, color: dim.color, radius: 2.6,
      categoryName: dim.name, dimId: this.dimId, kind: 'dimStar',
    }).create();
    this.group.add(this.star.group);

    const cats = (dim.categories || []).filter(c => c.count > 0);
    const n = cats.length || 1;
    // 每个子分类在维度主色锚定的色环上均匀铺开 —— 彼此区分度最大（修复「同维度分类星球颜色差不多」）
    const pal = categoryPalette(dim.color, n);

    // 错位轨道：按数量分 1~2 圈，每圈不同半径与相位偏移，避免「排成一个圆圈」
    const perRing = Math.max(1, Math.ceil(n / 2));
    const innerR = 6.5;
    const ringGap = 3.0;
    const SPEED_K = 3.5; // 公转角速度系数（开普勒式：内圈快、外圈慢）

    cats.forEach((cat, i) => {
      const ringIndex = Math.floor(i / perRing);
      const idxInRing = i % perRing;
      const R = innerR + ringIndex * ringGap;
      const angle = (idxInRing / perRing) * Math.PI * 2 + ringIndex * 0.6;
      const speed = SPEED_K / Math.pow(R, 1.5);
      const radius = Math.max(0.9, Math.min(1.7, 0.9 + cat.count * 0.05));
      const catColor = pal[i].hex;

      const planet = new CategoryPlanet({
        name: cat.name,
        color: catColor,
        radius,
        categoryName: cat.name,
        dimId: this.dimId,
      }).create();
      planet.group.position.set(R * Math.cos(angle), 0, R * Math.sin(angle));
      this.group.add(planet.group);
      this.planets.push({ name: cat.name, planet, angle, speed, orbitRadius: R });

      // 每圈首颗为该半径补一条轨道环（轨迹），颜色取该圈首颗分类色
      if (idxInRing === 0) {
        const ring = new OrbitRing(R, OrbitRing.desat(catColor, 0.3, 0.6), { linewidth: 1.4, dashed: true, opacity: 0.42 });
        ring.create(this.group);
        this.rings.push(ring);
      }
    });
  }

  getCategoryWorldPos(categoryName) {
    const p = this.planets.find(x => x.name === categoryName);
    if (!p) return this.center.clone();
    return p.planet.getWorldPosition(new THREE.Vector3());
  }

  setCenter(center) {
    this.center.copy(center);
    this.group.position.copy(center);
  }

  setFaded(faded) { this.fadeTarget = faded ? 0.12 : 1.0; }

  getClickables() {
    const list = [...this.star.getClickables()];
    for (const p of this.planets) list.push(...p.planet.getClickables());
    return list;
  }

  // 分类行星标签内嵌于球体（由 CategoryPlanet.update 按 fade 控制显隐），无需按距离 gating
  forEachMoon() {}

  update(time) {
    this.fade += (this.fadeTarget - this.fade) * 0.12;
    // 作为父视图淡出时：中心恒星完全隐藏，避免与当前层中心球/文字重叠；轨道环同步变淡
    if (this.star) {
      this.star.group.visible = this.fade > 0.25;
      this.star.setFade(this.fade);
      this.star.update(time);
    }
    for (const r of this.rings) {
      if (r.mesh) {
        const base = 0.42 * this.fade;
        r.mesh.material.uniforms.uOpacity.value = r.highlight ? Math.max(base, 0.9) : base;
      }
    }
    for (const p of this.planets) {
      // 各自沿独立轨道公转（错位轨道 + 不同速度）
      p.angle += p.speed * 0.016;
      p.planet.group.position.set(
        p.orbitRadius * Math.cos(p.angle), 0, p.orbitRadius * Math.sin(p.angle)
      );
      p.planet.setFade(this.fade);
      p.planet.update(time);
    }
  }

  dispose() {
    if (this.star) this.star.dispose();
    for (const p of this.planets) p.planet.dispose();
    for (const r of this.rings) if (r.mesh) disposeObject(r.mesh);
    disposeObject(this.group);
  }
}
