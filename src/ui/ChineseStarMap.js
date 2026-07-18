import * as THREE from 'three';

// 浩瀚宇宙星空：以程序化坐标在深空绘制真实的星辰大海。
//   · 约 3800 颗恒星，按真实色温分布（蓝白为主、点缀黄/橙/红）
//   · 一条倾斜的银河带聚集（约占 38% 恒星），强化「星系」纵深
//   · 3 片加性混合的星云辉光（冷蓝/紫/青），缓慢自转，营造浩瀚感
//   · 深度抖动（0.8R~1.2R）形成层次；中式星官（北斗/二十八宿/三垣）降为极淡文化底纹
//   · 星点逐星微闪（shader），连线轻微呼吸
export class ChineseStarMap {
  constructor(scene, isMobile) {
    this.scene = scene;
    this.isMobile = isMobile;
    this._build();
  }

  _build() {
    const R = 820;
    const stars = [];   // {x,y,z,phase,tw,size,color:[r,g,b]}
    const segs = [];    // 中式星官连线端点展平数组
    const sph = (azDeg, latDeg, r = R) => {
      const a = THREE.MathUtils.degToRad(azDeg);
      const l = THREE.MathUtils.degToRad(latDeg);
      return [r * Math.cos(l) * Math.cos(a), r * Math.sin(l), r * Math.cos(l) * Math.sin(a)];
    };
    const addStar = (x, y, z, opt = {}) => {
      const c = new THREE.Color(opt.color || '#ffffff');
      stars.push({ x, y, z, phase: Math.random() * 6.283, tw: 0.5 + Math.random() * 2.4, size: opt.size || 0.4, color: [c.r, c.g, c.b] });
    };
    const addSeg = (a, b) => segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);

    // 恒星色温调色板（真实星空以蓝白星为主，黄/橙/红星渐少）
    const PALETTE = ['#aac4ff', '#cdd9ff', '#ffffff', '#fff4e8', '#ffe6b0', '#ffc98a', '#ff9d6e'];
    const PALW = [0.07, 0.16, 0.32, 0.22, 0.13, 0.07, 0.03];
    const pickColor = () => {
      let r = Math.random(), s = 0;
      for (let i = 0; i < PALW.length; i++) { s += PALW[i]; if (r <= s) return PALETTE[i]; }
      return '#ffffff';
    };

    // —— 主星场 ——
    const N = this.isMobile ? 1700 : 3800;
    const TILT = 0.42; // 银河带倾斜（绕 x 轴）
    for (let i = 0; i < N; i++) {
      if (Math.random() < 0.38) {
        // 银河带：聚集在一条倾斜大圆附近，带宽散布
        const ang = Math.random() * Math.PI * 2;
        const bandR = R * (0.97 + Math.random() * 0.05);
        let x = bandR * Math.cos(ang);
        let z = bandR * Math.sin(ang);
        const off = (Math.random() - 0.5) * R * 0.24;
        let y = off;
        const cy = y * Math.cos(TILT) - z * Math.sin(TILT);
        const cz = y * Math.sin(TILT) + z * Math.cos(TILT);
        x = x; y = cy; z = cz;
        const rr = Math.hypot(x, y, z) || 1;
        x *= R / rr; y *= R / rr; z *= R / rr;
        addStar(x, y, z, { color: pickColor(), size: 0.22 + Math.random() * 0.72 });
      } else {
        // 均匀分布 + 深度抖动（0.8R~1.2R），形成纵深层次
        const r = R * (0.8 + Math.random() * 0.4);
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        addStar(
          r * Math.sin(p) * Math.cos(t),
          r * Math.cos(p),
          r * Math.sin(p) * Math.sin(t),
          { color: pickColor(), size: 0.2 + Math.random() * 0.6 }
        );
      }
      // 少量极亮星（更大尺寸 + 偏蓝白），作为真实星空中的亮星
      if (Math.random() < 0.05) {
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        const rr = R * (0.85 + Math.random() * 0.3);
        addStar(
          rr * Math.sin(p) * Math.cos(t),
          rr * Math.cos(p),
          rr * Math.sin(p) * Math.sin(t),
          { color: Math.random() < 0.7 ? '#dfe8ff' : '#fff4e0', size: 1.5 + Math.random() * 1.6 }
        );
      }
    }

    // —— 中式星官底纹（极淡文化点缀，不抢真实星空主体）——
    const dipBaseAz = 200, dipBaseLat = 66;
    const dipper = [[0, 0], [13, 2], [25, 5], [33, 12], [45, 11], [47, 3], [37, -4]];
    let dp = [];
    dipper.forEach(([da, dl]) => {
      const p = sph(dipBaseAz + da, dipBaseLat + dl, R * 0.92);
      addStar(p[0], p[1], p[2], { size: 0.7, color: '#e8d9a8' });
      dp.push(p);
    });
    for (let i = 0; i < dp.length - 1; i++) addSeg(dp[i], dp[i + 1]);

    const xiang = [
      { az: 25, col: '#8fd9c4' }, { az: 115, col: '#9fb6e0' },
      { az: 205, col: '#e3d2a0' }, { az: 295, col: '#e6a6b0' },
    ];
    xiang.forEach((g) => {
      let p0 = null;
      for (let i = 0; i < 7; i++) {
        const az = g.az + (i - 3) * 8;
        const lat = 6 + Math.sin(i * 0.9) * 10;
        const p = sph(az, lat);
        addStar(p[0], p[1], p[2], { size: 0.5, color: g.col });
        if (p0) addSeg(p0, p);
        p0 = p;
      }
    });

    const yuan = [{ az: 90, lat: 52 }, { az: 170, lat: 47 }, { az: 250, lat: 56 }];
    yuan.forEach((g) => {
      let p0 = null;
      for (let i = 0; i < 4; i++) {
        const p = sph(g.az + (i - 1.5) * 6, g.lat + Math.sin(i) * 4);
        addStar(p[0], p[1], p[2], { size: 0.45, color: '#cfe0ef' });
        if (p0) addSeg(p0, p);
        p0 = p;
      }
    });

    // —— 星点 Points + 逐星微闪 shader ——
    const n = stars.length;
    const positions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const phases = new Float32Array(n);
    const twSpeeds = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    stars.forEach((s, i) => {
      positions[i * 3] = s.x; positions[i * 3 + 1] = s.y; positions[i * 3 + 2] = s.z;
      sizes[i] = s.size; phases[i] = s.phase; twSpeeds[i] = s.tw;
      colors[i * 3] = s.color[0]; colors[i * 3 + 1] = s.color[1]; colors[i * 3 + 2] = s.color[2];
    });
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    pGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    pGeo.setAttribute('aTwSpeed', new THREE.BufferAttribute(twSpeeds, 1));
    pGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    this._tex = this._createTexture();
    this.pMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTex: { value: this._tex },
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
        '  float tw = 0.5 + 0.5 * sin(uTime * aTwSpeed + aPhase);' +
        '  vAlpha = 0.35 + 0.65 * tw;' +
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
    this.points = new THREE.Points(pGeo, this.pMat);
    this.points.frustumCulled = false;

    // —— 中式星官连线（极淡金，轻微呼吸）——
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
    this.lMat = new THREE.LineBasicMaterial({
      color: 0xd9c089,
      transparent: true,
      opacity: 0.10,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(lGeo, this.lMat);
    this.lines.frustumCulled = false;

    // —— 星云辉光（加性混合的柔光精灵，缓慢自转）——
    this.nebulae = new THREE.Group();
    const nebDefs = [
      { pos: [-260, 130, -700], col: '#3a5bd0', s: 660, a: 0.11 },
      { pos: [380, -170, -640], col: '#7a3aa8', s: 560, a: 0.09 },
      { pos: [120, 270, 700], col: '#1f8f9c', s: 580, a: 0.08 },
    ];
    for (const d of nebDefs) {
      const tex = this._nebulaTexture(d.col);
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: d.a,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(d.pos[0], d.pos[1], d.pos[2]);
      sp.scale.set(d.s, d.s, 1);
      this.nebulae.add(sp);
    }

    // 统一编组，整体缓慢自转，呈现浩瀚宇宙漂移感
    this.group = new THREE.Group();
    this.group.add(this.points, this.lines, this.nebulae);
    this.scene.add(this.group);
  }

  _createTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
  }

  _nebulaTexture(color) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = new THREE.Color(color);
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
    // 多层径向渐变叠加，形成柔和的云絮感
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, `rgba(${rgb},0.9)`);
    g.addColorStop(0.35, `rgba(${rgb},0.35)`);
    g.addColorStop(0.7, `rgba(${rgb},0.08)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  update(time) {
    if (this.pMat) this.pMat.uniforms.uTime.value = time;
    if (this.lMat) this.lMat.opacity = 0.07 + 0.05 * Math.sin(time * 0.6);
    if (this.group) {
      this.group.rotation.y = time * 0.004;                 // 极缓慢自转
      this.group.rotation.x = Math.sin(time * 0.03) * 0.04; // 轻微俯仰摆动
    }
  }
}
