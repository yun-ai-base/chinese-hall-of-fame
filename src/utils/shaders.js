// 太阳表面流动 + Fresnel 辉光 Shader

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

export const sunFragmentShader = `
  uniform float uTime;
  uniform float uComplexity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    // 表面流动纹理（根据复杂度降级）
    float flow = 0.0;
    flow += sin(vUv.x * 20.0 + uTime * 0.8) * cos(vUv.y * 20.0 + uTime * 0.6);

    if (uComplexity > 0.5) {
      float flow2 = sin(vUv.x * 35.0 - uTime * 0.4) * cos(vUv.y * 35.0 + uTime * 0.7);
      flow = (flow + flow2) * 0.5;
    } else {
      flow = flow * 0.5;
    }

    // 基础色
    vec3 centerColor = vec3(1.0, 0.84, 0.2);
    vec3 edgeColor = vec3(1.0, 0.42, 0.2);
    vec3 baseColor = mix(centerColor, edgeColor, 1.0 - vUv.y);

    vec3 glowColor = vec3(1.0, 0.95, 0.6);
    vec3 finalColor = mix(baseColor, glowColor, flow * 0.4);

    // Fresnel 辉光
    if (uComplexity > 0.5) {
      vec3 viewDir = normalize(-vPosition);
      float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
      fresnel = pow(fresnel, 3.0);
      vec3 fresnelColor = vec3(1.0, 0.5, 0.1) * fresnel * 1.5;
      finalColor += fresnelColor;
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
