import * as THREE from 'three';
import { easeInOutCubic } from '../utils/easing.js';

export class CameraController {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this._animation = null;
  }

  focusOn(targetPosition, duration = 1500, offset = new THREE.Vector3(0, 5, 12)) {
    if (this._animation) {
      cancelAnimationFrame(this._animation);
    }

    return new Promise((resolve) => {
      const startPos = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      const endTarget = targetPosition.clone();

      const endPos = endTarget.clone().add(offset);

      const startTime = performance.now();

      const animate = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = easeInOutCubic(t);

        this.camera.position.lerpVectors(startPos, endPos, eased);
        this.controls.target.lerpVectors(startTarget, endTarget, eased);
        this.controls.update();

        if (t < 1) {
          this._animation = requestAnimationFrame(animate);
        } else {
          this._animation = null;
          resolve();
        }
      };

      this._animation = requestAnimationFrame(animate);
    });
  }

  focusUniverse(duration = 1500) {
    // 太阳系布局：最外轨道半径 85，需保持俯视远距离才能一览全局
    return this.focusOn(new THREE.Vector3(0, 0, 0), duration, new THREE.Vector3(0, 55, 110));
  }

  // 「跃迁」脉冲：进入新层级时视野短暂收窄再回弹，营造空间跃迁感。
  // 尊重系统「减少动态效果」偏好：直接跳过。
  fovPulse(amount = 7, duration = 460) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const cam = this.camera;
    const base = cam.fov;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const k = Math.sin(t * Math.PI); // 0→1→0
      cam.fov = base - amount * k;     // 收窄=推近
      cam.updateProjectionMatrix();
      if (t < 1) requestAnimationFrame(step);
      else cam.fov = base;
    };
    requestAnimationFrame(step);
  }

  dispose() {
    if (this._animation) {
      cancelAnimationFrame(this._animation);
    }
  }
}
