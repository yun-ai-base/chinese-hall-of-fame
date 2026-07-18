import * as THREE from 'three';

// 资源释放协议（设计 6.6）：递归释放几何体 / 材质 / 纹理并从父节点移除。
export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m.map) m.map.dispose();
        if (m.emissiveMap) m.emissiveMap.dispose();
        if (m.alphaMap) m.alphaMap.dispose();
        m.dispose();
      }
    }
  });
  if (obj.parent) obj.parent.remove(obj);
}
