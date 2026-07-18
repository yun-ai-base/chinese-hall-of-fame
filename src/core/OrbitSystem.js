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
      });
      planet.create(this.scene);
      this.planets.push(planet);
    });
  }

  setRunning(v) { this.running = v; }

  getPlanet(dimId) { return this.planets.find(p => p.dimId === dimId); }

  getPlanetWorldPos(dimId, target = new THREE.Vector3()) {
    const p = this.getPlanet(dimId);
    if (p) return p.getWorldPosition(target);
    return target.set(0, 0, 0);
  }

  getPlanetMeshes() { return this.planets.map(p => p.mesh).filter(Boolean); }
  getPlanetLabels() { return this.planets.map(p => p.label).filter(Boolean); }

  update(time) {
    if (!this.running) return;
    for (const planet of this.planets) planet.update(time);
  }
}
