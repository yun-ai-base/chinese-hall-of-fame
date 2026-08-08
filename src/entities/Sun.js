import * as THREE from 'three';
import { createPlanetNameSprite } from '../ui/Label.js';

// 太阳半径：显著大于最大行星（木星 5.5），符合恒星体量；内圈轨道 15，边缘 8.5 不遮挡
const SUN_RADIUS = 8.5;

// 太阳日珥 / 火焰喷射粒子（GPU 端循环寿命，无需 CPU 每帧更新）
const flaresVertexShader = `
  uniform float uTime;
  uniform float uReach;
  uniform float uSize;
  attribute float aStart;
  attribute float aLife;
  attribute float aSeed;
  varying float vAge;

  void main() {
    // 循环寿命：age 0->1 不断重生，形成持续喷射
    float age = mod(uTime - aStart, aLife) / aLife;
    vAge = age;

    vec3 aOrigin = position;          // 球面上的出生点
    vec3 aDir = normalize(position);  // 向外单位方向
    vec3 pos = aOrigin + aDir * (age * uReach);

    // 轻微湍流侧向飘动，避免笔直僵硬
    float sway = sin(uTime * 1.5 + aSeed * 6.2831) * 0.35 * age;
    pos += vec3(sway, sway * 0.5 + age * 0.4, -sway) * aSeed;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sizeCurve = sin(age * 3.14159);          // 出生小、中段大、消散小
    gl_PointSize = uSize * (0.4 + sizeCurve) * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const flaresFragmentShader = `
  varying float vAge;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    vec3 hot = vec3(0.95, 0.66, 0.32);   // 年轻：柔暖橙（收敛亮度，避免刺眼）
    vec3 cool = vec3(0.9, 0.32, 0.10);   // 年老：暗橙红
    vec3 col = mix(hot, cool, vAge);
    float alpha = soft * pow(1.0 - vAge, 0.9) * 0.5;
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Sun {
  constructor(scene, isMobile = false) {
    this.scene = scene;
    this.isMobile = isMobile;
    this._createSun();
    this._createGlow();
    this._createCenterText();
    this._createFlares();
  }

  _createSun() {
    // 太阳半径 8.5：须显著大于最大行星（木星 5.5），才符合「恒星」体量。
    // 内圈轨道 15（水星），太阳边缘 8.5 不遮挡内侧轨道。
    const geometry = new THREE.SphereGeometry(SUN_RADIUS, 64, 64);
    // MeshBasicMaterial：太阳是自发光体，不受光照 → 贴真实照片纹理即恒星本色
    // （程序化占位纹理立即可见，真实照片加载后无缝替换，见 _loadRealTexture）
    const material = new THREE.MeshBasicMaterial({
      map: this._makePlaceholderTexture(),
      color: 0xffffff,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.userData = { isSun: true, name: '中華名人堂' };
    this.scene.add(this.mesh);
    this._loadRealTexture();
  }

  // 程序化占位：中心白黄 → 边缘橙的径向渐变（真实纹理加载前的兜底）
  _makePlaceholderTexture() {
    const S = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, '#fff7e8');
    g.addColorStop(0.45, '#ffe9b0');
    g.addColorStop(0.78, '#ffb65e');
    g.addColorStop(1, '#ff7a2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // 真实太阳照片（assets/textures/sun.jpg，Solar System Scope / NASA SDO 合成 2:1 等距圆柱）
  _loadRealTexture() {
    const img = new Image();
    img.onload = () => {
      if (!this.mesh || !this.mesh.material || !img.width) return;
      const tex = new THREE.CanvasTexture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      const old = this.mesh.material.map;
      this.mesh.material.map = tex;
      this.mesh.material.needsUpdate = true;
      if (old) old.dispose();
    };
    // onerror 静默：保留程序化占位
    img.src = './assets/textures/sun.jpg';
  }

  // 太阳中心嵌入「华夏」二字：随太阳放大适度加大，但保持「暗金细底、不抢焦点」的设计
  _createCenterText() {
    this.centerLabel = createPlanetNameSprite('华夏', '#d4b896', SUN_RADIUS * 0.6, { clean: true });
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
    this.glow.scale.set(SUN_RADIUS * 3.5, SUN_RADIUS * 3.5, 1);  // 光晕随太阳放大（约 3.5 倍半径）
    this.scene.add(this.glow);
  }

  update(time, dt = 0.016, slow = 1.0) {
    if (this.mesh.material.uniforms) {
      this.mesh.material.uniforms.uTime.value = time;
    }
    // 太阳本体自转（纹理流动 + 网格旋转双重表现立体感）；提速至肉眼可辨
    this.mesh.rotation.y += 0.004 * dt * 60 * slow;
    if (this.glow) this.glow.rotation.y -= 0.0008 * dt * 60 * slow;
    if (this.flares) this.flares.material.uniforms.uTime.value = time;
  }

  // 太阳表面持续向外喷射的火焰粒子（日珥）。GPU 端按寿命循环，开销极小。
  _createFlares() {
    const count = this.isMobile ? 80 : 170;
    const origin = new Float32Array(count * 3);
    const start = new Float32Array(count);
    const life = new Float32Array(count);
    const seed = new Float32Array(count);
    const sunR = SUN_RADIUS;
    for (let i = 0; i < count; i++) {
      // 球面均匀采样出生点
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);
      origin[i * 3] = x * sunR;
      origin[i * 3 + 1] = y * sunR;
      origin[i * 3 + 2] = z * sunR;
      start[i] = Math.random() * 6.0;
      life[i] = 1.8 + Math.random() * 2.2;
      seed[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(origin, 3));
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 1));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uReach: { value: this.isMobile ? 2.6 : 3.4 },   // 日珥喷射距离随太阳半径放大
        uSize: { value: this.isMobile ? 3.5 : 4.5 },
      },
      vertexShader: flaresVertexShader,
      fragmentShader: flaresFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.flares = new THREE.Points(geo, mat);
    this.flares.frustumCulled = false;
    this.scene.add(this.flares);
  }

  setCenterTextVisible(v) { if (this.centerLabel) this.centerLabel.visible = v; }
}
