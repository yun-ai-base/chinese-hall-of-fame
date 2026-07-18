import * as THREE from 'three';
import { Planet } from '../entities/Planet.js';
import { OrbitRing } from '../entities/OrbitRing.js';

// 太阳系八大行星轨道系统。维度元数据来自 DataManager（index.json）。
export class OrbitSystem {
  constructor(scene, dimensions) {
    this.scene = scene;
    this.dimensions = dimensions; // [{id,name,color,planetRadius,orbitRadius,...}]
    this.planets = [];
    this.orbits = [];
    this.running = true;

    // 轨道/行星淡出状态（下钻时让上层变淡，避免杂乱）
    this.ringBase = 0.42;
    this.ringFadeTarget = this.ringBase;
    this.ringKeepDimId = null;   // 进入某维度时，保留该维度轨道环作为锚点（稍亮）
    this.dimActive = false;
    this.planetFadeExempt = null;
    this.planetDeepDim = false; // L3/L4 深度视图下当前维度行星也调暗

    this._createSystem();
  }

  // 太阳系式布局：8 颗「行星」按 planetIndex 1..8 排布
  //  · 轨道半径非线性拉开（内紧外疏，外圈气态巨星区跳开）
  //  · 行星大小分级（内小岩质、外大气态巨星）
  //  · 公转速度按开普勒第三定律 ω ∝ r^-1.5（内快外慢，差距十余倍）
  static ORBIT = [0, 15, 21, 28, 36, 46, 58, 71, 85];
  static SIZE  = [0, 2.0, 2.8, 3.2, 2.6, 5.5, 4.8, 3.8, 3.6];
  static SPEED_K = 17.5;

  _createSystem() {
    const n = this.dimensions.length;
    this.dimensions.forEach((dim, i) => {
      const idx = dim.planetIndex || (i + 1);
      const orbitRadius = OrbitSystem.ORBIT[idx] ?? (15 + i * 10);
      const radius = OrbitSystem.SIZE[idx] ?? 3.0;
      const orbitSpeed = OrbitSystem.SPEED_K / Math.pow(orbitRadius, 1.5);
      const initialAngle = (i / n) * Math.PI * 2;

      const orbit = new OrbitRing(orbitRadius, new THREE.Color(dim.color).getHex());
      orbit.dimId = dim.id;
      orbit.create(this.scene);
      this.orbits.push(orbit);

      const planet = new Planet({
        name: dim.name,
        color: dim.color,
        radius,
        orbitRadius,
        orbitSpeed,
        initialAngle,
        dimId: dim.id,
        ring: idx === 6, // 太阳系第 6 颗行星位（真实土星位）带土星环
      });
      planet.create(this.scene);
      this.planets.push(planet);
    });
  }

  setRunning(v) { this.running = v; }

  // 下钻到某维度：宇宙层轨道整体淡出；非选中行星变暗（仅保留该维度行星明亮）
  // keepDimId 可选：进入某维度时，该维度的轨道环保持稍亮作为锚点，便于辨认当前所在。
  // deep=false（L2 维度视图）保留当前维度行星/轨道环明亮；deep=true（L3/L4 深度视图）进一步调暗锚点，避免与当前层中心球重叠。
  setRingsFaded(faded, keepDimId = null, deep = false) {
    this.ringFadeTarget = faded ? 0.05 : this.ringBase;
    this.ringKeepDimId = keepDimId;
    this.ringDeep = deep;
  }
  setPlanetDimmed(dimId, deep = false) {
    this.dimActive = !!dimId;
    this.planetFadeExempt = dimId || null;
    this.planetDeepDim = deep;
    // 进入某维度视图时，该维度行星作为锚点保留亮度，但其内嵌标签会与本层中央恒星标签重叠，故隐藏
    for (const p of this.planets) {
      p.setLabelVisible(!dimId || p.dimId !== dimId);
    }
  }

  getPlanet(dimId) { return this.planets.find(p => p.dimId === dimId); }

  getPlanetWorldPos(dimId, target = new THREE.Vector3()) {
    const p = this.getPlanet(dimId);
    if (p) return p.getWorldPosition(target);
    return target.set(0, 0, 0);
  }

  getPlanetMeshes() { return this.planets.map(p => p.mesh).filter(Boolean); }
  getPlanetLabels() { return this.planets.map(p => p.label).filter(Boolean); }

  update(time) {
    // 轨道环透明度平滑过渡（始终更新，即使在非运行态下钻时也需要淡出）
    const k = 0.1;
    for (const o of this.orbits) {
      const m = o.mesh.material;
      let target = this.ringFadeTarget;
      if (this.ringKeepDimId && o.dimId === this.ringKeepDimId) target = this.ringDeep ? 0.12 : 0.3;
      m.opacity += (target - m.opacity) * k;
    }
    // 行星淡出始终更新；轨道公转仅在 running 时推进
    for (const planet of this.planets) {
      let t;
      if (!this.dimActive) {
        t = 1.0;
      } else if (planet.dimId === this.planetFadeExempt) {
        t = this.planetDeepDim ? 0.25 : 1.0;
      } else {
        t = 0.12;
      }
      planet.setFade(t);
      planet.update(time, this.running);
    }
  }
}
