import * as THREE from 'three';

// 星空背景：3000 颗（移动端 800）点云，逐星独立闪烁。
// 每颗星带随机相位 phase + 闪烁速率 twSpeed，vertex shader 中按 uTime 做正弦调制，
// 同时微调点尺寸（近大远小 * 闪烁），并叠加冷暖白色层次，营造真实星海呼吸感。
export class StarField {
  constructor(scene, isMobile) {
    this.scene = scene;
    this.count = isMobile ? 800 : 3000;
    this._create();
  }

  _create() {
    const positions = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);
    const phases = new Float32Array(this.count);
    const twSpeeds = new Float32Array(this.count);
    const colors = new Float32Array(this.count * 3);

    for (let i = 0; i < this.count; i++) {
      const radius = 60 + Math.random() * 180;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(radius * Math.cos(phi));
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      sizes[i] = 0.3 + Math.random() * 0.7;
      phases[i] = Math.random() * Math.PI * 2;
      // 大部分星闪烁缓慢，少数较快，避免整体齐闪
      twSpeeds[i] = 0.6 + Math.random() * 2.2;

      // 冷暖白层次：多数近白，少数偏蓝/偏暖
      const t = Math.random();
      const c = new THREE.Color();
      if (t < 0.15) c.setHSL(0.58, 0.55, 0.82);      // 冷蓝
      else if (t < 0.30) c.setHSL(0.09, 0.55, 0.80); // 暖黄
      else c.setHSL(0.6, 0.05, 0.95);                // 近白
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aTwSpeed', new THREE.BufferAttribute(twSpeeds, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    const texture = this._createTexture();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTex: { value: texture },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader:
        'attribute float aSize; attribute float aPhase; attribute float aTwSpeed; attribute vec3 aColor;' +
        'uniform float uTime; uniform float uPixelRatio;' +
        'varying float vAlpha; varying vec3 vColor;' +
        'void main(){' +
        '  vColor = aColor;' +
        '  float tw = 0.5 + 0.5 * sin(uTime * aTwSpeed + aPhase);' + // 0..1 闪烁
        '  vAlpha = 0.30 + 0.70 * tw;' +
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
        '  float sz = aSize * (0.75 + 0.55 * tw) * 90.0 * uPixelRatio;' +
        '  gl_PointSize = sz / -mv.z;' +
        '  gl_Position = projectionMatrix * mv;' +
        '}',
      fragmentShader:
        'uniform sampler2D uTex;' +
        'varying float vAlpha; varying vec3 vColor;' +
        'void main(){' +
        '  vec4 t = texture2D(uTex, gl_PointCoord);' +
        '  if (t.a < 0.01) discard;' +
        '  gl_FragColor = vec4(vColor, t.a * vAlpha);' +
        '}',
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  _createTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    return new THREE.CanvasTexture(canvas);
  }

  // 每帧推进闪烁相位
  update(time) {
    if (this.material) this.material.uniforms.uTime.value = time;
  }
}
