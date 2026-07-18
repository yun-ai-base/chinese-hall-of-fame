import * as THREE from 'three';
import { createPlanetNameSprite } from '../ui/Label.js';
import { makePlanetTexture } from '../utils/planetTexture.js';

export class Planet {
  constructor({ name, color, radius, orbitRadius, orbitSpeed, initialAngle, dimId,
                ring = null, redSpot = false, moon = false, retrograde = false }) {
    this.name = name;
    this.color = color;
    this.radius = radius;
    this.orbitRadius = orbitRadius;
    this.orbitSpeed = orbitSpeed;
    this.angle = initialAngle;
    this.dimId = dimId;
    // ring 可为布尔（true→土星环）或类型字符串：'saturn'|'jupiter'|'uranus'|'neptune'
    this.ringType = ring === true ? 'saturn' : (ring || null);
    this.hasRing = !!this.ringType;
    this.hasRedSpot = !!redSpot;   // 木星大红斑
    this.hasMoon = !!moon;         // 地球月亮
    this.retrograde = !!retrograde; // 金星逆向自转
    this.mesh = null;
    this.glow = null;
    this.label = null;
    this.ring = null;
    this.redSpotMesh = null;
    this.moonGroup = null;
    this._moon = null;
    this.moonVisible = true;
    this.group = new THREE.Group();
  }

  create(scene) {
    const tex = this._createTexture();
    const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      map: tex.map,
      emissiveMap: tex.emissiveMap,
      emissive: new THREE.Color(this.color),
      emissiveIntensity: 0.28,  // 本色基底（配暗化 emissiveMap，背光面保留地形暗纹而不发亮）
      roughness: 0.55,
      metalness: 0.08,
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

    // 行星环（可选）：按类型渲染（土星明显环 / 木星·海王星微弱环 / 天王星近竖直黯淡环）
    // 随行星公转（作为 group 子节点）、随 fade 淡出
    if (this.hasRing) {
      this.ring = this._createRing(this.ringType);
      this.ring.position.set(this.orbitRadius, 0, 0);
      this.group.add(this.ring);
    }

    // 木星大红斑：贴在球面赤道偏南处，作为 mesh 子节点随自转横扫、转到背面自动被球体遮挡
    if (this.hasRedSpot) {
      this.redSpotMesh = this._createRedSpot();
      this.mesh.add(this.redSpotMesh);
    }

    // 地球月亮：moonGroup 挂在 group 上（随地球公转），其自身绕 y 轴旋转带动月亮绕地公转
    if (this.hasMoon) {
      this.moonGroup = this._createMoon();
      this.group.add(this.moonGroup);
    }

    scene.add(this.group);

    this.fade = 1.0;
    this.fadeTarget = 1.0;
    this.labelVisible = true;
    return this;
  }

  _createTexture() {
    const { map, emissiveMap, repeat } = makePlanetTexture(this.color, { seed: this._texSeed() });
    const m = new THREE.CanvasTexture(map);
    m.wrapS = m.wrapT = THREE.RepeatWrapping;
    m.repeat.set(repeat[0], repeat[1]);
    const e = new THREE.CanvasTexture(emissiveMap);
    e.wrapS = e.wrapT = THREE.RepeatWrapping;
    e.repeat.set(repeat[0], repeat[1]);
    return { map: m, emissiveMap: e };
  }

  _texSeed() {
    let s = 0;
    for (let i = 0; i < this.name.length; i++) s = (s * 31 + this.name.charCodeAt(i)) | 0;
    return (s >>> 0) || 1;
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
    const N = 48;
    const arc = 0.9; // 拖尾角度（弧度）—— 加长到 ~0.9，彗星尾更明显
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
      // 头部透明度提到 0.7，幂次衰减让头部聚拢、长尾渐隐，更像彗星
      const a = 0.7 * Math.pow(1 - i / N, 1.3);
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

  // 行星环：RingGeometry + 程序化 ShaderMaterial（按类型参数化）。
  //  · saturn  明显宽环，细密条带 + 卡西尼缝，倾斜约 24°
  //  · jupiter 极淡单薄尘环（真实木星环肉眼几乎不可见）
  //  · uranus  黯淡窄环，近乎竖直（天王星自转轴倾角 ~98°）
  //  · neptune 微弱环带 + 弧段（真实海王星环含 Adams 环弧团块）
  // fragment 按归一化半径 t 生成条带、边缘渐隐；uCassini/uArcs 控制卡西尼缝与角向弧段；
  // 透明度随 fade 联动（uOpacity）。
  static RING_CFG = {
    saturn:  { inner: 1.5, outer: 2.5, rot: [-Math.PI / 2 + 0.42, 0, 0], bands: 46, cassini: 1, arcs: 0, alpha: 0.55, lerp: 0.5,  target: '#e8dcc0' },
    jupiter: { inner: 1.55, outer: 1.95, rot: [-Math.PI / 2 + 0.28, 0, 0], bands: 16, cassini: 0, arcs: 0, alpha: 0.16, lerp: 0.4,  target: '#d8c6a4' },
    uranus:  { inner: 1.7, outer: 2.05, rot: [-0.22, 0.5, 0.12], bands: 30, cassini: 0, arcs: 0, alpha: 0.24, lerp: 0.55, target: '#bfe9ef' },
    neptune: { inner: 1.6, outer: 2.2, rot: [-Math.PI / 2 + 0.55, 0, 0], bands: 20, cassini: 0, arcs: 1, alpha: 0.20, lerp: 0.5,  target: '#8fd0e0' },
  };

  _createRing(type = 'saturn') {
    const cfg = Planet.RING_CFG[type] || Planet.RING_CFG.saturn;
    const inner = this.radius * cfg.inner;
    const outer = this.radius * cfg.outer;
    const geo = new THREE.RingGeometry(inner, outer, 160, 1);
    const col = new THREE.Color(this.color).lerp(new THREE.Color(cfg.target), cfg.lerp);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uInner: { value: inner },
        uOuter: { value: outer },
        uColor: { value: col },
        uOpacity: { value: 1.0 },
        uBands: { value: cfg.bands },
        uCassini: { value: cfg.cassini },
        uArcs: { value: cfg.arcs },
        uAlpha: { value: cfg.alpha },
      },
      vertexShader:
        'varying float vR; varying float vA;' +
        'void main(){ vR = length(position.xy); vA = atan(position.y, position.x);' +
        'gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform float uInner; uniform float uOuter; uniform vec3 uColor; uniform float uOpacity;' +
        'uniform float uBands; uniform float uCassini; uniform float uArcs; uniform float uAlpha;' +
        'varying float vR; varying float vA;' +
        'void main(){' +
        '  float t = (vR - uInner) / (uOuter - uInner);' +      // 0 内 → 1 外
        '  float band = 0.65 + 0.35 * sin(t * uBands);' +        // 细密环纹
        '  float cassini = 1.0;' +
        '  if (uCassini > 0.5) cassini = 1.0 - (smoothstep(0.44,0.47,t) - smoothstep(0.53,0.56,t));' + // 卡西尼缝
        '  float edge = smoothstep(0.0,0.05,t) * (1.0 - smoothstep(0.92,1.0,t));' +      // 内外渐隐
        '  float arc = 1.0;' +
        '  if (uArcs > 0.5) {' +                                  // 海王星弧段：几处角向亮团
        '    arc = 0.35 + exp(-pow(vA-1.2,2.0)*7.0) + exp(-pow(vA+2.0,2.0)*9.0) + exp(-pow(vA-2.7,2.0)*11.0);' +
        '  }' +
        '  float a = band * cassini * edge * arc;' +
        '  if (a < 0.01) discard;' +
        '  gl_FragColor = vec4(uColor, a * uAlpha * uOpacity);' +
        '}',
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
    mesh.frustumCulled = false;
    return mesh;
  }

  // 木星大红斑：程序化红棕椭圆贴片。放在赤道偏南（lat≈-22°）的球面上，
  // 作为 mesh 子节点随本轴自转横扫；转到背面时被球体深度遮挡自动隐没。
  _createRedSpot() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    g.addColorStop(0, 'rgba(210,80,48,0.98)');
    g.addColorStop(0.45, 'rgba(190,66,40,0.9)');
    g.addColorStop(0.8, 'rgba(150,52,34,0.35)');
    g.addColorStop(1, 'rgba(150,52,34,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(64, 64, 60, 40, 0, 0, Math.PI * 2); // 椭圆大红斑
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.CircleGeometry(this.radius * 0.4, 28);
    const spot = new THREE.Mesh(geo, mat);
    const lat = -0.38; // 赤道偏南
    const p = new THREE.Vector3(0, Math.sin(lat), Math.cos(lat)).multiplyScalar(this.radius * 1.004);
    spot.position.copy(p);
    spot.lookAt(p.clone().multiplyScalar(2)); // 法线朝外
    spot.scale.set(1.7, 1.0, 1);              // 椭圆拉宽
    spot.frustumCulled = false;
    return spot;
  }

  // 地球月亮：灰色小球，挂在 moonGroup 上绕地公转。
  // moonGroup 位于地球本地位置，随 group（公转）一起走；其自身 rotation.y 带动月亮绕地。
  _createMoon() {
    const moonGroup = new THREE.Group();
    moonGroup.position.set(this.orbitRadius, 0, 0);
    const mr = Math.max(this.radius * 0.27, 0.7);
    const geo = new THREE.SphereGeometry(mr, 20, 20);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc7c7cf, emissive: 0x2b2b33, emissiveIntensity: 0.3,
      roughness: 0.95, metalness: 0.0, transparent: true, opacity: 1.0,
    });
    const moon = new THREE.Mesh(geo, mat);
    this.moonDist = this.radius + mr + 1.8;
    moon.position.set(this.moonDist, 0, 0);
    moon.userData = { kind: 'moon', name: '月亮' };
    moonGroup.add(moon);
    this._moon = moon;
    moonGroup.rotation.y = Math.random() * Math.PI * 2; // 随机初相位
    return moonGroup;
  }

  // 淡出控制：下钻到其它维度时，非选中行星平滑变暗、标签隐藏
  setFade(target) { this.fadeTarget = target; }
  setLabelVisible(v) { this.labelVisible = v; }
  // 月亮显隐：进入 L2 及更深层时隐藏，避免视觉干扰；返回宇宙层恢复
  setMoonVisible(v) { this.moonVisible = v; }

  update(time, animateOrbit = true) {
    // 公转与本轴自转仅在运行态推进
    if (animateOrbit) {
      this.angle += this.orbitSpeed * 0.016;
      this.group.rotation.y = this.angle;
      // 金星逆向自转：spin 取反
      if (this.mesh) this.mesh.rotation.y += this.retrograde ? -0.008 : 0.008;
      if (this.moonGroup) this.moonGroup.rotation.y += 0.02; // 月亮绕地公转
    }

    // 平滑淡入淡出（始终更新，即使轨道暂停）
    this.fade += (this.fadeTarget - this.fade) * 0.12;
    if (this.glow) this.glow.material.opacity = this.fade;
    if (this.mesh) this.mesh.material.opacity = Math.max(this.fade, 0.06);
    if (this.ring) this.ring.material.uniforms.uOpacity.value = this.fade;
    if (this.redSpotMesh) this.redSpotMesh.material.opacity = this.fade * 0.95;
    if (this.moonGroup) {
      this.moonGroup.visible = this.moonVisible && this.fade > 0.9;
      if (this._moon) this._moon.material.opacity = this.fade;
    }
    if (this.label) this.label.visible = this.labelVisible && this.fade > 0.6;
  }
}
