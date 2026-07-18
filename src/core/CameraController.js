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

  dispose() {
    if (this._animation) {
      cancelAnimationFrame(this._animation);
    }
  }
}
