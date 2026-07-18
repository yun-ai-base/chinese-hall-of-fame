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

  _createSystem() {
    this.dimensions.forEach((dim, i) => {
      const orbitRadius = dim.orbitRadius;
      const radius = dim.planetRadius;
      const speed = 0.15 + (8 - i) * 0.02;

      const orbit = new OrbitRing(orbitRadius, new THREE.Color(dim.color).getHex());
      orbit.create(this.scene);
      this.orbits.push(orbit);

      const planet = new Planet({
        name: dim.name,
        color: dim.color,
        radius,
        orbitRadius,
        orbitSpeed: speed,
        initialAngle: (i / 8) * Math.PI * 2,
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
