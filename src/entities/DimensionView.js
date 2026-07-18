import * as THREE from 'three';
import { OrbitRing } from './OrbitRing.js';
import { Moon } from './Moon.js';
import { disposeObject } from '../utils/dispose.js';

// DimensionView —— 围绕某颗行星（中心）构建该维度的名人星系。
// 布局规则（设计 5.2 / 6.4）：
//   - 每个子分类占用一条轨道环（半径递增，层间距 ~2.6）
//   - 同一轨道内人物按年代（sortYear）升序沿圆周排布，年代越早越靠近起始角
//   - 桌面端默认展开全部分类；移动端默认仅显示分类 hub，点击展开
export class DimensionView {
  constructor(dataManager, dimId, center) {
    this.dm = dataManager;
    this.dimId = dimId;
    this.meta = dataManager.getDim(dimId);
    this.center = center.clone();
    this.isMobile = dataManager.isMobile;
    this.cacheSignature = `dim:${dimId}`;

    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.categoryGroups = [];   // { name, ring, moons:[Moon], hub:Moon, visible }
    this.hubs = [];

    // 分类层（L3）轨道淡出状态：进入名人视图时把上一层轨道变淡
    this.ringBase = 0.42;
    this.ringFadeTarget = this.ringBase;

    this._build();
  }

  _build() {
    const colorHex = new THREE.Color(this.meta.color).getHex();
    const baseR = this.meta.planetRadius + 2.4;
    const layerGap = 2.6;

    const figures = this.dm.getDimFigures(this.dimId);
    const cats = this.meta.categories || [];

    cats.forEach((cat, order) => {
      const ringR = baseR + order * layerGap;
      // L2 分类层轨道：虚线 + 低饱和维度色（与 L1 实线区分层级）
      const ring = new OrbitRing(ringR, OrbitRing.desat(colorHex, 0.3, 0.6), { linewidth: 1.6, dashed: true, opacity: 0.42 });
      ring.create(this.group);

      const catFigures = figures
        .filter(f => f.category === cat.name)
        .sort((a, b) => a.sortYear - b.sortYear);
      const n = catFigures.length || 1;

      const moons = catFigures.map((fe, i) => {
        const angle = (i / n) * Math.PI * 2;
        const x = ringR * Math.cos(angle);
        const z = ringR * Math.sin(angle);
        const moon = new Moon({
          name: fe.basic.name,
          color: this.meta.color,
          radius: 0.42,
          kind: 'figure',
          figureId: fe.id,
          dimId: this.dimId,
          sub: fe.basic.dynasty,
        });
        moon.group.position.set(x, 0, z);
        this.group.add(moon.group);
        moon.hit.userData.orbitRing = ring; // hover 回链：悬停分类卫星高亮其轨道
        return moon;
      });

      // 分类 hub（位于轨道顶部，可点击展开/收起）—— 作为独立的「分类层」节点（L3）
      const hub = new Moon({
        name: `${cat.name}·${cat.count}`,
        color: this.meta.color,
        radius: 0.72,
        kind: 'category',
        isHub: true,
      });
      hub.group.position.set(0, 0, -ringR);
      hub.mesh.userData.categoryIndex = order;
      hub.hit.userData.categoryIndex = order;
      // 分类节点光环：标出这是一个分类锚点，使分类层与名人卫星（L4）视觉上区分开
      const halo = new OrbitRing(1.05, OrbitRing.desat(colorHex, 0.3, 0.6));
      halo.create(hub.group);
      hub.hit.userData.orbitRing = halo; // 悬停分类 hub 高亮其光环
      this.group.add(hub.group);

      const visible = !this.isMobile; // 移动端默认折叠
      moons.forEach(m => m.group.visible = visible);

      this.categoryGroups.push({ name: cat.name, ring, moons, hub, visible });
      this.hubs.push(hub);
    });
  }

  // 缓存复用（LRU）时按当前行星世界坐标重算中心
  setCenter(center) {
    this.center.copy(center);
    this.group.position.copy(center);
  }

  // 进入名人视图：把本维度（分类层 L3）轨道与卫星平滑变淡，避免与名人视图互相干扰
  setFaded(faded) {
    this.ringFadeTarget = faded ? 0.04 : this.ringBase;
    const hubT = faded ? 0.15 : 1.0;
    const moonT = faded ? 0.3 : 1.0;
    for (const h of this.hubs) h.setFade(hubT);
    for (const cg of this.categoryGroups) for (const m of cg.moons) m.setFade(moonT);
  }

  // 移动端：点击分类 hub 切换该分类卫星显隐
  toggleCategory(index) {
    const cg = this.categoryGroups[index];
    if (!cg) return;
    cg.visible = !cg.visible;
    cg.moons.forEach(m => (m.group.visible = cg.visible));
  }

  getClickables() {
    const list = [];
    for (const h of this.hubs) list.push(...h.getClickables());
    for (const cg of this.categoryGroups) {
      if (cg.visible) for (const m of cg.moons) list.push(...m.getClickables());
    }
    return list;
  }

  // 扁平卫星列表（供标签按距离显隐）
  forEachMoon(cb) {
    for (const h of this.hubs) cb(h);
    for (const cg of this.categoryGroups) for (const m of cg.moons) cb(m);
  }

  update(time) {
    this.group.rotation.y += 0.0009; // 极缓慢自转
    const k = 0.1;
    for (const cg of this.categoryGroups) {
      const m = cg.ring.mesh.material;
      let target = this.ringFadeTarget;
      if (cg.ring.highlight) target = Math.max(target, 0.9); // hover 高亮抬升
      m.opacity += (target - m.opacity) * k;
    }
    this.forEachMoon(m => m.update(time));
  }

  dispose() {
    this.forEachMoon(m => m.dispose());
    this.hubs.forEach(h => h.dispose());
    for (const cg of this.categoryGroups) {
      if (cg.ring && cg.ring.mesh) disposeObject(cg.ring.mesh);
    }
    disposeObject(this.group);
  }
}
