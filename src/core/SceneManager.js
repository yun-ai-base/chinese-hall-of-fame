import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { ChineseStarMap } from '../ui/ChineseStarMap.js';

export class SceneManager {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.isMobile = window.innerWidth < 768 || 'ontouchstart' in window;

    this._initScene();
    this._initCamera();
    this._initRenderer();
    this._initControls();
    this._createSpaceBackground();   // 程序化深空背景（替代纯黑，见下）
    this._createTintSphere();        // 选中名人的背景染色层（叠加而非替换星空）
    this._initStarField();
    this._initLights();
    this._animate();
    this._handleResize();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
  }

  _initCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 2000);
    // 太阳系式布局：最外轨道半径 85，相机需拉远才能完整取景（俯视 30° 角）
    this.camera.position.set(0, 55, 110);
    this.camera.lookAt(0, 0, 0);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2)
    );
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 220;
    this.controls.autoRotate = false;
    // 星系浏览：禁用平移（移动端双指即缩放而非平移，避免误拖出画面）
    this.controls.enablePan = false;
    // 触摸手势：单指旋转、双指捏合缩放（禁用平移后 DOLLY_PAN 退化为纯缩放）
    if (THREE.TOUCH) {
      this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    }
    this.controls.target.set(0, 0, 0);
  }

  _initStarField() {
    // 名义上叫 StarField，实际渲染中式星官图（北斗/二十八宿/三垣），替代随机星点
    this.starField = new ChineseStarMap(this.scene, this.isMobile);
  }

  _initLights() {
    // 环境光压低：仅在背光面保留基础可见度，不抹平明暗（立体感来源）
    const ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(ambient);

    // 太阳点光源：decay=0 让光照均匀覆盖到最外层轨道；强度适中以保留明暗渐变
    const sunLight = new THREE.PointLight(0xffe8c8, 1.5, 0, 0);
    sunLight.position.set(0, 0, 0);
    this.scene.add(sunLight);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    // 星空闪烁：以累计时间推进逐星相位（独立于业务动画的 running 状态，始终呼吸）
    if (this.starField) this.starField.update(this.clock.getElapsedTime());
    this.renderer.render(this.scene, this.camera);
  }

  _handleResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  // ---------- 程序化深空背景 ----------
  // 用 Canvas 一次性绘制「有层次的深空」：靛蓝→深紫渐变（非纯黑）+
  // 斜跨银河带 + 三团低透明星云 + 大量尘星 + 少量带辉光亮星。
  // 作为 scene.background（渲染在一切场景物体之下），叠加中式星官图（ChineseStarMap）与 3D 天体。
  // 一次生成、无运行时开销；移动端降分辨率省内存。
  _createSpaceBackground() {
    const W = this.isMobile ? 1024 : 2048;
    const H = Math.round(W / 2);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1) 基础径向渐变：右上偏亮靛蓝（"深空主光源"方向），左下渐近黑
    const base = ctx.createRadialGradient(W * 0.72, H * 0.26, 0, W * 0.72, H * 0.26, W * 0.95);
    base.addColorStop(0, '#101a3d');   // 深靛蓝
    base.addColorStop(0.4, '#0a1028');
    base.addColorStop(0.75, '#070b1c');
    base.addColorStop(1, '#04060f');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // 2) 斜跨银河带（极淡冷白光带 + 噪声碎团）
    ctx.save();
    ctx.translate(W * 0.5, H * 0.5);
    ctx.rotate(-0.55);
    const milky = ctx.createLinearGradient(-W * 0.72, 0, W * 0.72, 0);
    milky.addColorStop(0, 'rgba(200,216,255,0)');
    milky.addColorStop(0.5, 'rgba(200,216,255,0.055)');
    milky.addColorStop(1, 'rgba(200,216,255,0)');
    ctx.fillStyle = milky;
    ctx.fillRect(-W * 0.72, -H * 0.32, W * 1.44, H * 0.64);
    for (let i = 0; i < 110; i++) {
      const x = (Math.random() - 0.5) * W * 1.3;
      const y = (Math.random() - 0.5) * H * 0.5;
      const r = 10 + Math.random() * 42;
      const a = 0.02 + Math.random() * 0.05;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(215,228,255,${a})`);
      g.addColorStop(1, 'rgba(215,228,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();

    // 3) 星云色团：右上靛蓝（呼应主光源）、左下淡紫、右下淡金，极低 alpha 不抢焦点
    const nebulae = [
      { x: W * 0.80, y: H * 0.18, r: W * 0.34, c: '140,160,255', a: 0.11 },
      { x: W * 0.12, y: H * 0.82, r: W * 0.26, c: '165,130,225', a: 0.07 },
      { x: W * 0.62, y: H * 0.88, r: W * 0.22, c: '205,185,150', a: 0.05 },
    ];
    for (const nb of nebulae) {
      const g = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
      g.addColorStop(0, `rgba(${nb.c},${nb.a})`);
      g.addColorStop(1, `rgba(${nb.c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(nb.x, nb.y, nb.r, 0, 6.2832); ctx.fill();
    }

    // 4) 尘星：大量、极小、低透明（30% 暖白 / 70% 冷白，贴近真实夜空配色）
    for (let i = 0; i < 1500; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = 0.5 + Math.random() * 1.1;
      const a = 0.06 + Math.random() * 0.32;
      ctx.fillStyle = Math.random() < 0.3
        ? `rgba(255,236,200,${a})`
        : `rgba(212,226,255,${a})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }

    // 5) 亮星：少量、带辉光晕与明亮核心（作为背景的点睛层次）
    for (let i = 0; i < 64; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = 1.1 + Math.random() * 2.2;
      const a = 0.45 + Math.random() * 0.5;
      const col = Math.random() < 0.4 ? '255,240,210' : '215,230,255';
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      glow.addColorStop(0, `rgba(${col},${a * 0.5})`);
      glow.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, r * 5, 0, 6.2832); ctx.fill();
      ctx.fillStyle = `rgba(${col},${Math.min(1, a)})`;
      ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, 6.2832); ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;      // 背景不参与 mipmap 细节
    tex.magFilter = THREE.LinearFilter;
    this.scene.background = tex;
  }

  // 选中名人时的背景染色层：巨大包围球 + 半透明色相（renderOrder 最低先画），
  // 叠加在深空背景之上 —— 星空隐约可见 + 色相笼罩，比「纯色替换背景」更保留太空感。
  _createTintSphere() {
    const geo = new THREE.SphereGeometry(1600, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.tintSphere = new THREE.Mesh(geo, mat);
    this.tintSphere.renderOrder = -100;
    this.scene.add(this.tintSphere);
  }

  // 选中名人时给背景叠加一层色相染色（半透明，星空保留）；null 还原
  setBackgroundTint(hex) {
    if (!this.tintSphere) return;
    const m = this.tintSphere.material;
    if (hex) {
      m.color.set(hex);
      m.opacity = 0.55;
    } else {
      m.opacity = 0;
    }
  }

  // 资源释放协议
  disposeEntity(object) {
    if (!object) return;
    if (object.geometry) {
      object.geometry.dispose();
    }
    if (object.material) {
      if (object.material.map) object.material.map.dispose();
      if (object.material.emissiveMap) object.material.emissiveMap.dispose();
      object.material.dispose();
    }
    if (object.parent) {
      object.parent.remove(object);
    }
  }
}
