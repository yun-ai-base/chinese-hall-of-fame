// 太阳表面 Shader（真实感强化，2026-08-08）
//   · 米粒组织（granulation）：分形值噪声模拟太阳光球细胞状翻滚亮胞/暗缝
//   · 黑子（sunspot）：低频噪声成团暗斑，随表面一起流动
//   · 边缘暗化（limb darkening）：按视角幂次压暗边缘（真实太阳边缘比中心暗 ~35%）
//   · 色温校正：中心近白暖黄（~5800K），边缘偏橙但不过分
//   · 色球辉光：仅边缘薄层微橙（弱 Fresnel），避免「大红边」失真

export const sunVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_NOISE = `
  // 2D 值噪声（hash → 双线性插值）
  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  // 分形布朗运动：米粒组织的多尺度叠加（固定 4 层，WebGL1 兼容）
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(7.3, 3.1);
      a *= 0.5;
    }
    return v;
  }
`;

export const sunFragmentShader = `
  uniform float uTime;
  uniform float uComplexity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  ${SUN_NOISE}

  void main() {
    // 表面流动：uv 随时间缓慢漂移 → 光球「翻滚沸腾」感
    vec2 uvT = vUv * vec2(5.0, 5.0) + vec2(uTime * 0.035, uTime * 0.02);
    float spotOffset = 11.7;   // 黑子场偏移，与米粒场错开

    // 米粒组织：细粒度亮胞 + 暗缝（低频叠高频）
    float gran = fbm(uvT * 3.0);
    float granFine = vnoise(uvT * 7.5);
    float cell = gran * 0.75 + granFine * 0.25;
    if (uComplexity <= 0.5) cell = cell * 0.5 + 0.25;   // 移动端降级：更平滑

    // 黑子：两个低频场叠出「成团暗斑」（黑子常成群，位于低纬）
    float spotField = fbm(uvT * 1.25 + spotOffset);
    float spotField2 = fbm(uvT * 2.6 + spotOffset * 0.6);
    float spotMask = smoothstep(0.58, 0.74, spotField) * smoothstep(0.42, 0.58, spotField2);
    float spot = spotMask * (uComplexity > 0.5 ? 0.82 : 0.5);

    // 边缘暗化：视角余弦的幂次（中心 1 → 边缘 ~0.55），真实太阳的 limb darkening
    vec3 viewDir = normalize(-vPosition);
    float ndv = max(dot(vNormal, viewDir), 0.0);
    float limb = pow(ndv, 0.42);

    // 色温：中心近白暖黄（~5800K），边缘偏橙
    vec3 cCenter = vec3(1.0, 0.965, 0.87);
    vec3 cEdge   = vec3(1.0, 0.78, 0.5);
    vec3 base = mix(cEdge, cCenter, limb);

    // 米粒：亮胞提亮 / 暗缝压暗（小幅 ±22%）
    vec3 color = base * (1.0 + (cell - 0.5) * 0.24);

    // 黑子：暗棕斑块覆盖（真实黑子比周围暗 3~5 倍）
    vec3 spotCol = vec3(0.30, 0.19, 0.10);
    color = mix(color, spotCol, spot);

    // 色球辉光：边缘薄层微橙（弱 Fresnel，保持真实感不过曝）
    float fres = pow(1.0 - ndv, 2.4);
    color += vec3(1.0, 0.5, 0.16) * fres * 0.32;

    gl_FragColor = vec4(color, 1.0);
  }
`;
