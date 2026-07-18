import * as THREE from 'three';
import { sunVertexShader, sunFragmentShader } from '../utils/shaders.js';
import { createPlanetNameSprite } from '../ui/Label.js';

export class Sun {
  constructor(scene, isMobile = false) {
    this.scene = scene;
    this.isMobile = isMobile;
    this._createSun();
    this._createGlow();
    this._createCenterText();
  }

  _createSun() {
    // 太阳半径不宜过大，否则在俯视太阳系布局中会遮挡内侧轨道与行星
    const geometry = new THREE.SphereGeometry(5, 64, 64);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uComplexity: { value: this.isMobile ? 0.3 : 1.0 },
      },
      vertexShader: sunVertexShader,
      fragmentShader: sunFragmentShader,
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.userData = { isSun: true, name: '中华名人堂' };
    this.scene.add(this.mesh);
  }

  // 太阳中心嵌入「华夏」二字：白字 + 淡金辉光 + 朝相机，depthTest:false 始终绘制于球体之上
  _createCenterText() {
    this.centerLabel = createPlanetNameSprite('华夏', '#ffe6b3', 5);
    this.centerLabel.position.set(0, 0, 0);
    this.scene.add(this.centerLabel);
  }

  _createGlow() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 180, 50, 0.4)');
    gradient.addColorStop(0.3, 'rgba(255, 100, 30, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.glow = new THREE.Sprite(spriteMaterial);
    this.glow.scale.set(18, 18, 1);
    this.scene.add(this.glow);
  }

  update(time) {
    if (this.mesh.material.uniforms) {
      this.mesh.material.uniforms.uTime.value = time;
    }
    // 太阳本体自转（纹理流动 + 网格旋转双重表现立体感）；提速至肉眼可辨
    this.mesh.rotation.y += 0.004;
    if (this.glow) this.glow.rotation.y -= 0.0008;
  }

  setCenterTextVisible(v) { if (this.centerLabel) this.centerLabel.visible = v; }
}
