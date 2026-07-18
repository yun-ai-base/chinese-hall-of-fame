import * as THREE from 'three';

export class OrbitRing {
  constructor(radius, colorHex = 0x444466) {
    this.radius = radius;
    this.colorHex = colorHex;
    this.mesh = null;
  }

  create(scene) {
    const segments = 96;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 3);

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      positions[i * 3] = this.radius * Math.cos(theta);
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = this.radius * Math.sin(theta);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: this.colorHex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });

    this.mesh = new THREE.Line(geometry, material);
    scene.add(this.mesh);
    return this;
  }
}
