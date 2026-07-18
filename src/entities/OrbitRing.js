import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

// 轨道环：用 Line2（fat lines）绘制，支持真实像素线宽、虚实（虚线）、低饱和主题色，
// 以及 hover 高亮（提亮暖白 + 加粗 + 抬升透明度）。
// 所有实例共享同一份 resolution（由 SceneManager 在创建前与 resize 时更新），避免逐环维护。
export class OrbitRing {
  static _resolution = new THREE.Vector2(1, 1);
  static _instances = [];
  // LineMaterial 的 resolution 为拷贝语义，故维护实例表，创建前/resize 时统一刷新
  static setResolution(w, h) {
    this._resolution.set(w, h);
    for (const inst of this._instances) {
      if (inst.material) inst.material.resolution.set(w, h);
    }
  }

  // 降饱和工具：把任意维度色压成低饱和、略提亮的「主题灰彩」，避免深色背景下高饱和原色糊成一片
  static desat(hex, s = 0.32, l = 0.62) {
    const c = new THREE.Color(hex);
    const hsl = {};
    c.getHSL(hsl);
    return new THREE.Color().setHSL(hsl.h, s, l).getHex();
  }

  constructor(radius, colorHex = 0x444466, opts = {}) {
    this.radius = radius;
    this.baseColor = new THREE.Color(colorHex);
    this.linewidth = opts.linewidth ?? 2.2;   // 像素线宽（内层细、外层粗由此控制）
    this.dashed = opts.dashed ?? false;        // 虚实差异：L1 实线，L2+ 虚线
    this.baseOpacity = opts.opacity ?? 0.42;
    this.highlight = false;
    this.mesh = null;
    this.material = null;
  }

  create(scene) {
    const seg = 180;
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      pts.push(this.radius * Math.cos(t), 0, this.radius * Math.sin(t));
    }

    const geo = new LineGeometry();
    geo.setPositions(pts);

    const mat = new LineMaterial({
      color: this.baseColor.getHex(),
      linewidth: this.linewidth,           // 单位：像素（worldUnits 默认 false）
      transparent: true,
      opacity: this.baseOpacity,
      depthWrite: false,
      dashed: this.dashed,
      dashSize: this.dashed ? 2.4 : 0,
      gapSize: this.dashed ? 2.4 : 0,
      resolution: OrbitRing._resolution,    // 共享实例，resize 时自动同步
    });

    const line = new Line2(geo, mat);
    line.computeLineDistances();            // 虚线需要线距离
    line.frustumCulled = false;
    this.mesh = line;
    this.material = mat;
    OrbitRing._instances.push(this);
    scene.add(this.mesh);
    return this;
  }

  // hover 高亮：提亮向暖白 + 加粗；取消时复原。透明度由各自淡出循环统一管控。
  setHighlight(b) {
    if (this.highlight === b) return;
    this.highlight = b;
    const m = this.material;
    if (!m) return;
    if (b) {
      m.color.copy(this.baseColor).lerp(new THREE.Color('#fff4d6'), 0.6);
      m.linewidth = this.linewidth * 2.4;
    } else {
      m.color.copy(this.baseColor);
      m.linewidth = this.linewidth;
    }
  }
}
