import * as THREE from 'three';
import { Moon } from './Moon.js';
import { OrbitRing } from './OrbitRing.js';
import { disposeObject } from '../utils/dispose.js';

// FigureView —— 以某位名人为中心，环绕其关联人物（设计 1.3 / 3.6）。
//   在册关联人物：维度色、可点击跃迁
//   边缘关联人物：灰半透明、点击仅弹面板
// 同时承载"跨维度引力线"（设计 2.9 / Phase 5）：仅在该名人聚焦时局部渲染。
export class FigureView {
  constructor(dataManager, figureId, center, orbitSystem = null, scene = null) {
    this.dm = dataManager;
    this.figureId = figureId;
    this.orbitSystem = orbitSystem;
    this.scene = scene;
    this.center = center.clone();
    this.isMobile = dataManager.isMobile;
    this.cacheSignature = `fig:${figureId}`;

    const basic = dataManager.getFigureBasic(figureId);
    this.basic = basic;
    this.color = basic ? basic.color : '#ffffff';

    this.group = new THREE.Group();
    this.group.position.copy(this.center);

    this.selfMoon = new Moon({
      name: basic ? basic.basic.name : figureId,
      color: this.color,
      radius: 0.95,
      kind: 'self',
      figureId,
      dimId: basic ? basic.dimId : null,
      sub: basic ? basic.basic.dynasty : null,
    });
    this.group.add(this.selfMoon.group);

    this.relationMoons = [];
    this.rings = [];

    // 跨维度引力线（世界空间，加入 scene 而非 group，避免随 group 自转）
    this.crossDims = dataManager.getCrossDims(figureId);
    this.gravityGroup = null;
    this.gravityLines = [];
    this.gravityBuilt = false;
  }

  async loadRelations() {
    const resolved = await this.dm.resolveRelations(this.figureId);
    const perRing = this.isMobile ? 8 : 12;
    const innerR = 2.4;
    const ringGap = 1.7;

    resolved.forEach((r, i) => {
      const ringIndex = Math.floor(i / perRing);
      const idxInRing = i % perRing;
      const R = innerR + ringIndex * ringGap;
      const angle = (idxInRing / perRing) * Math.PI * 2 + ringIndex * 0.35;

      const moon = new Moon({
        name: r.name,
        color: r.kind === 'figure' ? r.color : (r.kind === 'associate' ? '#9aa0a6' : '#6b7280'),
        radius: r.kind === 'figure' ? 0.5 : 0.4,
        kind: 'relation',
        targetId: r.id,
        isInList: r.kind === 'figure',
        dimId: r.kind === 'figure' ? r.dimId : null,
        sub: r.relation,
      });
      moon.group.position.set(R * Math.cos(angle), 0, R * Math.sin(angle));
      this.group.add(moon.group);
      this.relationMoons.push(moon);

      // 每环首颗时补一条轨道环
      if (idxInRing === 0) {
        const ring = new OrbitRing(R, OrbitRing.desat(this.color, 0.3, 0.6), { linewidth: 1.3, dashed: true, opacity: 0.42 });
        ring.create(this.group);
        this.rings.push(ring);
      }
    });
    return this;
  }

  // ---- 跨维度引力线 ----
  // 在每次进入（新建或缓存复用）时调用：确保线段端点指向当前行星世界坐标。
  ensureGravity() {
    if (!this.orbitSystem || !this.scene || !this.crossDims.length) return;
    if (!this.gravityBuilt) this._buildGravity();
    this._updateGravityTargets();
  }

  _buildGravity() {
    this.gravityGroup = new THREE.Group();
    const SEG = 48;
    this.crossDims.forEach((dimId) => {
      const dim = this.dm.getDim(dimId);
      const hex = new THREE.Color(dim ? dim.color : '#ffffff').getHex();
      const geo = new THREE.BufferGeometry();
      const pts0 = new Array(SEG + 1).fill(0).map(() => new THREE.Vector3());
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
      const mat = new THREE.LineBasicMaterial({
        color: hex, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      this.gravityGroup.add(line);
      this.gravityLines.push(line);

      // 终点处的小光点（维度色节点）
      const dotGeo = new THREE.SphereGeometry(0.18, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.85 });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      this.gravityGroup.add(dot);
      line.userData.dot = dot;
    });
    this.scene.add(this.gravityGroup);
    this.gravityBuilt = true;
  }

  _updateGravityTargets() {
    const SEG = 48;
    this.crossDims.forEach((dimId, i) => {
      const line = this.gravityLines[i];
      const start = this.center;
      const end = this.orbitSystem.getPlanetWorldPos(dimId);
      // 控制点向外（远离太阳中心）弯曲，形成"引力线"弧
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const outward = mid.clone().normalize().multiplyScalar(Math.max(start.distanceTo(end) * 0.12, 1.6));
      mid.add(outward);
      const curve = new THREE.QuadraticBezierCurve3(start.clone(), mid, end.clone());
      const pts = curve.getPoints(SEG);
      const pos = line.geometry.attributes.position;
      for (let k = 0; k <= SEG; k++) {
        pos.setXYZ(k, pts[k].x, pts[k].y, pts[k].z);
      }
      pos.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      const dot = line.userData.dot;
      if (dot) dot.position.copy(end);
    });
  }

  setCenter(center) {
    this.center.copy(center);
    this.group.position.copy(center);
    if (this.gravityBuilt) this._updateGravityTargets();
  }

  getClickables() {
    const list = [...this.selfMoon.getClickables()];
    for (const m of this.relationMoons) list.push(...m.getClickables());
    return list;
  }

  forEachMoon(cb) {
    cb(this.selfMoon);
    for (const m of this.relationMoons) cb(m);
  }

  update(time) {
    this.group.rotation.y += 0.0006;
    this.forEachMoon(m => m.update(time));
  }

  dispose() {
    this.forEachMoon(m => m.dispose());
    for (const ring of this.rings) if (ring.mesh) disposeObject(ring.mesh);
    if (this.gravityGroup) {
      for (const line of this.gravityLines) {
        if (line.userData.dot) disposeObject(line.userData.dot);
        disposeObject(line);
      }
      disposeObject(this.gravityGroup);
    }
    disposeObject(this.group);
  }
}
