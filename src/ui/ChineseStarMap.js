import * as THREE from 'three';

// 中国星官图：以程序化坐标在深空绘制简化的中式星象，替代随机西式星空。
// 包含：北斗七星（勺形连线）、二十八宿（四象各 7 宿弧线）、三垣（3 小弧）、极淡尘星。
// 星点为淡金/青白 Points + 逐星微闪；连线为淡金 LineSegments + 轻微呼吸。
export class ChineseStarMap {
  constructor(scene, isMobile) {
    this.scene = scene;
    this.isMobile = isMobile;
    this._build();
  }

  _build() {
    const R = 175;
    const stars = [];   // {x,y,z,phase,tw,size,color:[r,g,b]}
    const segs = [];    // 连线端点展平数组
    const sph = (azDeg, latDeg, r = R) => {
      const a = THREE.MathUtils.degToRad(azDeg);
      const l = THREE.MathUtils.degToRad(latDeg);
      return [r * Math.cos(l) * Math.cos(a), r * Math.sin(l), r * Math.cos(l) * Math.sin(a)];
    };
    const addStar = (x, y, z, opt = {}) => {
      const c = new THREE.Color(opt.color || '#e8d9a8');
      stars.push({ x, y, z, phase: Math.random() * 6.283, tw: 0.6 + Math.random() * 2.2, size: opt.size || 0.6, color: [c.r, c.g, c.b] });
    };
    const addSeg = (a, b) => segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);

    // —— 北斗七星（勺形：斗柄 4 星 + 斗魁 3 星）——
    const dipBaseAz = 200, dipBaseLat = 66;
    const dipper = [[0, 0], [13, 2], [25, 5], [33, 12], [45, 11], [47, 3], [37, -4]];
    let prev = null;
    dipPre: {
      const dp = [];
      dipper.forEach(([da, dl]) => {
        const p = sph(dipBaseAz + da, dipBaseLat + dl, R * 0.92);
        addStar(p[0], p[1], p[2], { size: 1.15, color: '#f1e3b2' });
        dp.push(p);
      });
      for (let i = 0; i < dp.length - 1; i++) addSeg(dp[i], dp[i + 1]);
    }

    // —— 二十八宿：四象各 7 宿，沿弧线相连 ——
    const xiang = [
      { az: 25, col: '#8fd9c4' },  // 东方青龙
      { az: 115, col: '#9fb6e0' }, // 北方玄武
      { az: 205, col: '#e3d2a0' }, // 西方白虎
      { az: 295, col: '#e6a6b0' }, // 南方朱雀
    ];
    xiang.forEach((g) => {
      let p0 = null;
      for (let i = 0; i < 7; i++) {
        const az = g.az + (i - 3) * 8;
        const lat = 6 + Math.sin(i * 0.9) * 10;
        const p = sph(az, lat);
        addStar(p[0], p[1], p[2], { size: 0.85, color: g.col });
        if (p0) addSeg(p0, p);
        p0 = p;
      }
    });

    // —— 三垣：紫微垣 / 太微垣 / 天市垣（3 小弧，近天顶）——
    const yuan = [
      { az: 90, lat: 52 }, { az: 170, lat: 47 }, { az: 250, lat: 56 },
    ];
    yuan.forEach((g) => {
      let p0 = null;
      for (let i = 0; i < 4; i++) {
        const p = sph(g.az + (i - 1.5) * 6, g.lat + Math.sin(i) * 4);
        addStar(p[0], p[1], p[2], { size: 0.7, color: '#cfe0ef' });
        if (p0) addSeg(p0, p);
        p0 = p;
      }
    });

    // —— 极淡尘星（稀疏，避免虚空，不抢星官主线）——
    const dustN = this.isMobile ? 240 : 560;
    for (let i = 0; i < dustN; i++) {
      const r = R * (0.7 + Math.random() * 0.6);
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      addStar(
        r * Math.sin(p) * Math.cos(t),
        r * Math.cos(p),
        r * Math.sin(p) * Math.sin(t),
        { size: 0.28, color: '#c9d2e2' }
      );
    }

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
    this.scene.add(this.points);

    // —— 星官连线（淡金，轻微呼吸）——
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
    this.lMat = new THREE.LineBasicMaterial({
      color: 0xd9c089,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(lGeo, this.lMat);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
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

  update(time) {
    if (this.pMat) this.pMat.uniforms.uTime.value = time;
    // 连线轻微呼吸（微闪），强化「星图在呼吸」的观感
    if (this.lMat) this.lMat.opacity = 0.20 + 0.09 * Math.sin(time * 0.6);
  }
}
