import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { StarField } from '../ui/StarField.js';

export class SceneManager {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.isMobile = window.innerWidth < 768 || 'ontouchstart' in window;

    this._initScene();
    this._initCamera();
    this._initRenderer();
    this._initControls();
    this._initStarField();
    this._initLights();
    this._animate();
    this._handleResize();
  }

  _initScene() {
    this.scene = new THREE.Scene();
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
    this.controls.target.set(0, 0, 0);
  }

  _initStarField() {
    this.starField = new StarField(this.scene, this.isMobile);
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

  // 选中名人时给背景叠加一层极淡的色相染色，强化「当前聚焦某位名人」的凸显度；
  // 传入 null 还原为默认（黑色虚空）。
  setBackgroundTint(hex) {
    if (hex) this.scene.background = new THREE.Color(hex);
    else this.scene.background = null;
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
