import * as THREE from 'three';
import { createPlanetNameSprite } from '../ui/Label.js';

export class Planet {
  constructor({ name, color, radius, orbitRadius, orbitSpeed, initialAngle, dimId }) {
    this.name = name;
    this.color = color;
    this.radius = radius;
    this.orbitRadius = orbitRadius;
    this.orbitSpeed = orbitSpeed;
    this.angle = initialAngle;
    this.dimId = dimId;
    this.mesh = null;
    this.glow = null;
    this.label = null;
    this.group = new THREE.Group();
  }

  create(scene) {
    const texture = this._createTexture();
    const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.5,
      metalness: 0.15,
      emissive: new THREE.Color(this.color),
      emissiveIntensity: 0.32,  // 仅作本色基底；明暗渐变交给太阳点光源，保留球体立体感
      transparent: true,   // 供淡出（下钻时非选中行星变暗）
      opacity: 1.0,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.x = this.orbitRadius;
    this.mesh.userData = { kind: 'planet', dimId: this.dimId, name: this.name, planet: this };

    this.glow = this._createGlow();
    this.glow.position.x = this.orbitRadius;

    // 行星名写在星球内部（居中、朝向相机、随星球大小自适应），不浮在外侧
    this.label = createPlanetNameSprite(this.name, this.color, this.radius);
    this.label.position.set(this.orbitRadius, 0, 0);

    this.trail = this._createTrail();

    this.group.add(this.mesh);
    this.group.add(this.glow);
    this.group.add(this.label);
    this.group.add(this.trail);
    scene.add(this.group);

    this.fade = 1.0;
    this.fadeTarget = 1.0;
    return this;
  }

  _createTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const color = new THREE.Color(this.color);
    const r = Math.floor(color.r * 255);
    const g = Math.floor(color.g * 255);
    const b = Math.floor(color.b * 255);

    // 不透明纯色底：保证颜色浓度，避免半透明斑点透出深空背景而发灰
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 128, 64);

    // 同色系细微明暗斑块：仅做表面质感，弱化处理避免干扰球面的统一明暗体积感
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 64;
      const rad = 5 + Math.random() * 20;
      const m = (Math.random() > 0.5 ? 22 : -18);
      const rr = Math.max(0, Math.min(255, r + m));
      const gg = Math.max(0, Math.min(255, g + m));
      const bb = Math.max(0, Math.min(255, b + m));
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(${rr},${gg},${bb},0.35)`);
      grad.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    return texture;
  }

  _createGlow() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const color = new THREE.Color(this.color);
    const r = Math.floor(color.r * 255);
    const g = Math.floor(color.g * 255);
    const b = Math.floor(color.b * 255);

    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.3)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},0.1)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(this.radius * 3, this.radius * 3, 1);
    return sprite;
  }

  getWorldPosition(target) {
    return this.mesh.getWorldPosition(target);
  }

  // 轨道拖尾（Phase 4）：以行星为头部、沿轨道后方绘制一段渐隐弧线。
  // 弧线作为 group 子节点，随公转一起旋转；顶点色含 alpha，头部亮、尾部透明。
  _createTrail() {
    const R = this.orbitRadius;
    const N = 40;
    const arc = 0.55; // 拖尾角度（弧度）
    const col = new THREE.Color(this.color);
    const positions = new Float32Array((N + 1) * 3);
    const colors = new Float32Array((N + 1) * 4);
    for (let i = 0; i <= N; i++) {
      const phi = -(arc * i) / N; // 0（头部，行星处）→ -arc（尾部）
      const x = R * Math.cos(phi);
      const z = -R * Math.sin(phi);
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = z;
      const a = 0.42 * (1 - i / N); // 头亮尾透
      colors[i * 4] = col.r;
      colors[i * 4 + 1] = col.g;
      colors[i * 4 + 2] = col.b;
      colors[i * 4 + 3] = a;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader:
        'attribute vec4 aColor; varying vec4 vColor;' +
        'void main(){ vColor = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'varying vec4 vColor;' +
        'void main(){ if(vColor.a < 0.01) discard; gl_FragColor = vColor; }',
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    return line;
  }

  // 淡出控制：下钻到其它维度时，非选中行星平滑变暗、标签隐藏
  setFade(target) { this.fadeTarget = target; }

  update(time, animateOrbit = true) {
    // 公转与本轴自转仅在运行态推进
    if (animateOrbit) {
      this.angle += this.orbitSpeed * 0.016;
      this.group.rotation.y = this.angle;
      if (this.mesh) this.mesh.rotation.y += 0.008;
    }

    // 平滑淡入淡出（始终更新，即使轨道暂停）
    this.fade += (this.fadeTarget - this.fade) * 0.12;
    if (this.glow) this.glow.material.opacity = this.fade;
    if (this.mesh) this.mesh.material.opacity = Math.max(this.fade, 0.06);
    if (this.label) this.label.visible = this.fade > 0.6;
  }
}
