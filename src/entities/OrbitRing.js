import * as THREE from 'three';

// 轨道环：用「环形几何 + 着色器」渲染柔边发光带。
//   · 按半径方向做平滑 alpha 渐变（内外边缘自然渐隐为 0），彻底消除 Line2 细线在深色背景下的「珠点/斑点」感
//   · 加性混合（AdditiveBlending）→ 自然发光，像一条发光的轨迹，而非硬线
//   · 低饱和主题色；内层带窄、外层带宽（层级区分）；hover 高亮提亮向暖白 + 抬升亮度
// 接口与旧版（Line2）保持兼容：new / create / .mesh / .material / .highlight / .setHighlight / .dimId / disposeObject(.mesh)
const VERT = /* glsl */`
  varying vec3 vPos;
  void main() {
    vPos = position;                 // 几何已 rotateX(-90°) 躺平至 XZ 平面，y≈0
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec3 vPos;
  uniform vec3  uColor;
  uniform float uInner;
  uniform float uOuter;
  uniform float uOpacity;
  uniform float uHighlight;         // 0..1 hover 高亮强度

  void main() {
    float r = length(vPos.xz);       // 距轨道中心的半径
    float t = clamp((r - uInner) / max(uOuter - uInner, 0.0001), 0.0, 1.0);
    // 软质带形剖面：两端为 0，中段峰值（smoothstep 给出自然过渡）
    float a1 = smoothstep(0.0, 0.5, t);
    float a2 = smoothstep(1.0, 0.5, t);
    float prof = pow(a1 * a2, 1.2);
    float a = prof * uOpacity;
    vec3 col = mix(uColor, vec3(1.0, 0.96, 0.88), uHighlight * 0.6);
    gl_FragColor = vec4(col, a);
  }
`;

export class OrbitRing {
  // 降饱和工具：把任意维度色压成低饱和、略提亮的「主题灰彩」，避免深色背景下高饱和原色糊成一片
  static desat(hex, s = 0.32, l = 0.62) {
    const c = new THREE.Color(hex);
    const hsl = {};
    c.getHSL(hsl);
    return new THREE.Color().setHSL(hsl.h, s, l).getHex();
  }

  constructor(radius, colorHex = 0x444466, opts = {}) {
    this.radius = radius;
    this.baseColor = new THREE.Color(colorHex);
    // 带宽（径向厚度）：内层窄、外层宽，承载「层级区分」；同时不超过半径的 0.3 以免小环糊成一团
    const lw = opts.linewidth ?? 1.0;
    this.bandWidth = Math.min(opts.bandWidth ?? lw * 0.45, radius * 0.3);
    this.baseOpacity = opts.opacity ?? 0.42;
    this.highlight = false;
    this.mesh = null;
    this.material = null;
  }

  create(parent) {
    const inner = Math.max(0.01, this.radius - this.bandWidth * 0.5);
    const outer = this.radius + this.bandWidth * 0.5;
    const geo = new THREE.RingGeometry(inner, outer, 220, 1);
    geo.rotateX(-Math.PI / 2);       // 躺平到 XZ 平面（与行星公转平面一致）

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.baseColor.clone() },
        uInner: { value: inner },
        uOuter: { value: outer },
        uOpacity: { value: this.baseOpacity },
        uHighlight: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const ring = new THREE.Mesh(geo, mat);
    ring.renderOrder = 2;
    ring.frustumCulled = false;
    this.mesh = ring;
    this.material = mat;
    parent.add(this.mesh);
    return this;
  }

  // hover 高亮：提亮向暖白（由着色器 mix 实现）；亮度（uOpacity）由各自淡出循环接管
  setHighlight(b) {
    if (this.highlight === b) return;
    this.highlight = b;
    if (!this.material) return;
    this.material.uniforms.uHighlight.value = b ? 1 : 0;
  }
}
