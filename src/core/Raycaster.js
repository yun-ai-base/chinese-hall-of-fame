import * as THREE from 'three';

export class Raycaster {
  constructor(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.clickables = [];
    this._handlers = { click: [], hover: [] };
    this._lastHovered = null;
    this._bindEvents();
  }

  setClickables(objects) {
    this.clickables = objects;
  }

  on(event, handler) {
    if (this._handlers[event]) {
      this._handlers[event].push(handler);
    }
  }

  _bindEvents() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('click', (e) => {
      this._updateMouse(e);
      const hit = this._hitTest();
      // 命中则传命中体；未命中也照常派发（hit 为 null），供上层处理「点击空白」逻辑
      this._handlers.click.forEach((h) => h(hit));
    });

    canvas.addEventListener('pointermove', (e) => {
      this._updateMouse(e);
      const hit = this._hitTest();
      if (hit !== this._lastHovered) {
        if (this._lastHovered) {
          this._handlers.hover.forEach((h) => h(null, this._lastHovered));
        }
        if (hit) {
          this._handlers.hover.forEach((h) => h(hit, null));
        }
        this._lastHovered = hit;
      }
    });
  }

  _updateMouse(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _hitTest() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.clickables, false);
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      return {
        object: obj,
        point: intersects[0].point,
        userData: obj.userData,
      };
    }
    return null;
  }
}
