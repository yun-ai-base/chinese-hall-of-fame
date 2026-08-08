import * as THREE from 'three';
import { SceneManager } from './core/SceneManager.js';
import { Sun } from './entities/Sun.js';
import { OrbitSystem } from './core/OrbitSystem.js';
import { CameraController } from './core/CameraController.js';
import { Raycaster } from './core/Raycaster.js';
import { DataManager } from './data/DataManager.js';
import { CategoryView } from './entities/CategoryView.js';
import { CategoryFigureView } from './entities/CategoryFigureView.js';
import { FigureView } from './entities/FigureView.js';
import { InfoPanel } from './ui/InfoPanel.js';
import { Search } from './ui/Search.js';
import { Breadcrumb } from './ui/Breadcrumb.js';

const IDLE_MS = 30000;          // 30 秒无操作自动回拢（用户阅读面板时需豁免，详见 _resetIdle）
const REDUCED_MOTION = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function showFatal(msg) {
  if (window.__fatalShown) return;
  window.__fatalShown = 1;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;background:rgba(5,8,21,0.96);color:#ffd9d9;font-family:sans-serif;padding:30px;text-align:center;line-height:1.8;font-size:14px';
  d.textContent = '加载出错：' + msg + '\n（请用本地 HTTP 服务器打开，而非 file:// 协议）';
  document.body.appendChild(d);
}
window.addEventListener('error', (e) => showFatal(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) => showFatal((e.reason && e.reason.message) || String(e.reason)));

class App {
  constructor() {
    this.clock = 0;
    this._lastT = 0;             // 上一帧真实时间戳（驱动帧率无关 dt）
    this.history = [];          // 导航历史栈（≤20）
    this.activeView = null;     // CategoryView | CategoryFigureView | FigureView
    this._parentView = null;    // 图视图上层（维度视图）作为淡出背景保留，不逐出缓存
    this.viewCache = new Map(); // LRU 视图缓存（设计 6.4）：signature -> view
    this.CACHE_LIMIT = 3;       // 保留最近 2~3 个场景层
    this.viewLevel = 'universe';
    this.currentDimId = null;
    this.currentFigureId = null;
    this.currentCategory = null;
    this.selectedFigureId = null;
    this._kbFocus = null;        // 键盘导航焦点 { id, kind: 'figure'|'category' }
    this._kbFocusId = null;
    this._kbTipTimer = null;
    this.currentCenter = new THREE.Vector3();
    this._suppressHash = false;
    this._idleTimer = null;
    this._mouseX = window.innerWidth / 2;
    this._mouseY = window.innerHeight / 2;
    this._debug = new URLSearchParams(location.search).has('debug');
    this._fpsEl = null;
    this._fpsLast = performance.now();
    this._fpsFrames = 0;
    this.btnBack = null;
    this.titleDisplay = null;
    this.mainTitle = null;
    this.tooltip = null;
    this.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    this._boot();
  }

  // ---------- 初始化（异步引导）----------
  async _boot() {
    try {
      this.dm = new DataManager();
      await this.dm.init();

    this.scene = new SceneManager();
    this.sun = new Sun(this.scene.scene, this.scene.isMobile);
    const dimMeta = [...this.dm.dims.values()];
    this.orbitSystem = new OrbitSystem(this.scene.scene, dimMeta);
    this.cameraCtrl = new CameraController(this.scene.camera, this.scene.controls);
    this.raycaster = new Raycaster(this.scene.camera, this.scene.renderer);

    this.panel = new InfoPanel(this.dm, {
      onFigureJump: (id) => this._jumpFigureFromPanel(id),
      onDimensionJump: (id) => this.navigateTo(this._dimensionState(id)),
      onRandomExplore: () => this._randomExplore(),
      onRandomDimension: () => this._randomDimension(),
      onHotFigures: () => this._showHotFigures(),
      onAssociateJump: (data) => this.panel.showAssociate(data),
      onClose: () => {},
    });
    this.search = new Search({ dm: this.dm, onResult: (id) => this._jumpFigureFromPanel(id) });
    this.breadcrumb = new Breadcrumb({
      onJump: (level, payload) => {
        if (level === 'universe') this.navigateTo(this._universeState());
        else if (level === 'dimension') this.navigateTo(this._dimensionState(payload.dimId));
        else if (level === 'category') this.navigateTo(this._categoryState(payload.dimId, payload.categoryName));
      },
    });
    this.btnBack = document.getElementById('btn-back');
    this.titleDisplay = document.getElementById('title-display');
    this.mainTitle = this.titleDisplay?.querySelector('.main-title');
    this.tooltip = document.getElementById('tooltip');

    this._bindEvents();
    this._apply(this._parseHash());
    this._animate();
    } catch (err) {
      console.error(err);
      showFatal(err.message || String(err));
    }
  }

  _bindEvents() {
    this.raycaster.on('click', (hit) => this._onClick(hit));
    this.raycaster.on('hover', (hit, prev) => this._onHover(hit, prev));

    this.btnBack.addEventListener('click', () => this.back());
    window.addEventListener('pointermove', (e) => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    }, { passive: true });
    window.addEventListener('hashchange', () => {
      if (this._suppressHash) { this._suppressHash = false; return; }
      this.history = [];
      this._apply(this._parseHash());
    });

    // 键盘导航（无障碍 + 桌面用户提效）：
    //   Esc    关闭面板 → 取消选中 → 返回上级
    //   ←/→   分类层/名人层：相邻卫星（名人/分类星球）间移动键盘焦点（高亮 + 名称提示）
    //   ↑/↓   同 ←/→ 的环绕移动（对轨道层级无向概念，统一用左右；上下也响应）
    //   Enter 确认当前键盘焦点（名人 → 打开详情面板；分类 → 下钻）
    window.addEventListener('keydown', (e) => {
      const k = e.key;
      // 输入框/搜索框内不劫持方向键
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;

      if (k === 'Escape') {
        // 1) 关闭打开的信息面板
        if (this.panel && this.panel.root.classList.contains('open')) {
          this.panel.hide();
          // 同步 URL：如果当前在 figure 层且是从 panel 触发的，回上一级
          if (this.viewLevel === 'figure' && !this.selectedFigureId) this.back();
          e.preventDefault();
          return;
        }
        // 2) 取消选中 / 清除键盘焦点
        if (this.selectedFigureId || this._kbFocus) {
          this._clearFigureSelection();
          e.preventDefault();
          return;
        }
        // 3) 否则：返回上级（历史栈）
        if (this.viewLevel !== 'universe') {
          this.back();
          e.preventDefault();
        }
        return;
      }

      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        // 面板打开时方向键留给面板滚动，不劫持
        if (this.panel && this.panel.root.classList.contains('open')) return;
        if (this.viewLevel === 'category' || this.viewLevel === 'dimension') {
          const dir = (k === 'ArrowLeft' || k === 'ArrowUp') ? -1 : 1;
          this._kbNavigate(dir);
          e.preventDefault();
        }
        return;
      }

      if (k === 'Enter') {
        if (this._kbFocus && (this.viewLevel === 'category' || this.viewLevel === 'dimension')) {
          this._openKbFocus();
          e.preventDefault();
        }
      }
    });

    // 空闲计时（详情面板打开时豁免：用户停下来阅读不算「空闲」）
    ['pointermove', 'click', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev =>
      window.addEventListener(ev, () => this._resetIdle(), { passive: true })
    );
    this._resetIdle();
  }

  _bindGlobal() {}

  // ---------- 状态构造 ----------
  _universeState() { return { level: 'universe' }; }
  _dimensionState(dimId, center) {
    const c = center || this.orbitSystem.getPlanetWorldPos(dimId);
    return { level: 'dimension', dimId, center: c.clone() };
  }
  _categoryState(dimId, categoryName, center) {
    if (!center) {
      const dimCenter = this.orbitSystem.getPlanetWorldPos(dimId);
      const dim = this.dm.getDim(dimId);
      center = CategoryView.computeCategoryWorldPos(dim, categoryName, dimCenter);
    }
    return { level: 'category', dimId, categoryName, center: center.clone() };
  }

  _figureState(figureId, center, dimId) {
    const basic = this.dm.getFigureBasic(figureId);
    const dId = dimId || (basic ? basic.dimId : null);
    const c = center || (dId ? this.orbitSystem.getPlanetWorldPos(dId) : new THREE.Vector3());
    return { level: 'figure', figureId, dimId: dId, center: c.clone() };
  }

  // ---------- 导航 ----------
  navigateTo(state) {
    // 记录当前态进历史栈
    if (this.viewLevel !== 'universe' || this.currentDimId || this.currentFigureId) {
      this.history.push({
        level: this.viewLevel, dimId: this.currentDimId,
        categoryName: this.viewLevel === 'category' ? this.currentCategory : null,
        figureId: this.currentFigureId, center: this.currentCenter.clone(),
      });
      if (this.history.length > 20) this.history.shift();
    }
    this._apply(state);
  }

  back() {
    if (!this.history.length) {
      if (this.viewLevel !== 'universe') this._apply(this._universeState());
      return;
    }
    const prev = this.history.pop();
    this._apply(prev);
  }

  _apply(state) {
    // 进入任何非宇宙层级时，收起太阳中心的「中华」字样与可能残留的名人选中态
    this.sun.setCenterTextVisible(state.level === 'universe');
    this._clearFigureSelection();
    if (state.level === 'universe') this._applyUniverse();
    else if (state.level === 'dimension') this._applyDimension(state.dimId, state.center);
    else if (state.level === 'category') this._applyCategory(state.dimId, state.categoryName, state.center);
    else if (state.level === 'figure') this._applyFigure(state.figureId, state.center);
  }

  _applyUniverse() {
    this._disposeView();
    this._disposeParent();   // 清空可能的上层（维度）淡出背景
    this.viewLevel = 'universe';
    this.currentDimId = null;
    this.currentFigureId = null;
    this.currentCenter.set(0, 0, 0);
    this.orbitSystem.setRunning(true);
    this.orbitSystem.setRingsFaded(false);   // 宇宙层轨道恢复
    this.orbitSystem.setPlanetDimmed(null);  // 行星全部恢复明亮
    this.panel.hide();
    this.cameraCtrl.focusUniverse();
    this.btnBack.classList.add('hidden');
    if (this.titleDisplay) this.titleDisplay.style.display = '';
    this._updateTitle('中華名人堂', '点击星球探索上下五千年');
    this._refreshClickables();
    this.breadcrumb.render([]);
    this._setHash('u');
  }

  _applyDimension(dimId, center) {
    // 防御：未知维度 ID 直接退回宇宙层（异常 hash / 数据残缺都不会让 app 崩溃）
    if (!this.dm.getDim(dimId)) { this._applyUniverse(); return; }
    this._transitionCue();
    // 从图视图返回同一维度：复用已淡出的维度视图（上层背景还原），逐出图视图
    if (this._parentView && this._parentView.dimId === dimId) {
      const view = this._parentView;
      this._parentView = null;
      this._evictActiveToCache();
      view.setCenter(center);
      view.setFaded(false);
      this.scene.scene.add(view.group);
      this.activeView = view;
      this.viewLevel = 'dimension';
      this.currentDimId = dimId;
      this.currentFigureId = null;
      this.currentCenter.copy(center);
      this.orbitSystem.setRunning(false);
      this.orbitSystem.setRingsFaded(true, dimId); // 宇宙层轨道淡出，保留本维度轨道作锚
      this.orbitSystem.setPlanetDimmed(dimId);
      this.panel.hide();
      this.btnBack.classList.remove('hidden');
      if (this.titleDisplay) this.titleDisplay.style.display = 'none';
      const dim = this.dm.getDim(dimId);
      this._updateTitle(dim.name, '点击分类星球下钻探索');
      this.cameraCtrl.focusOn(center.clone());
      this._refreshClickables();
      this.breadcrumb.render([
        { label: '中華名人堂', level: 'universe' },
        { label: dim.name, level: 'dimension', payload: { dimId } },
      ]);
      this._setHash('d', dimId);
      return;
    }

    // 否则：清掉旧上层（若有）与旧活动视图，重建该维度
    this._disposeParent();
    this._evictActiveToCache();
    const sig = `cat:${dimId}`;
    let view = this.viewCache.get(sig);
    let isNew = false;
    if (!view) {
      view = new CategoryView(this.dm, dimId, center);
      isNew = true;
    } else {
      this.viewCache.delete(sig);
      view.setCenter(center);
    }
    this.scene.scene.add(view.group);
    this.activeView = view;
    this.viewLevel = 'dimension';
    this.currentDimId = dimId;
    this.currentFigureId = null;
    this.currentCenter.copy(center);
    this.orbitSystem.setRunning(false);
    this.orbitSystem.setRingsFaded(true, dimId); // 宇宙层轨道淡出，保留本维度轨道作锚
    this.orbitSystem.setPlanetDimmed(dimId);
    this.panel.hide();
    this.btnBack.classList.remove('hidden');
    if (this.titleDisplay) this.titleDisplay.style.display = 'none';
    const dim = this.dm.getDim(dimId);
    this._updateTitle(dim.name, '点击分类星球下钻探索');
    this.cameraCtrl.focusOn(center.clone());
    this._refreshClickables();
    this.breadcrumb.render([
      { label: '中華名人堂', level: 'universe' },
      { label: dim.name, level: 'dimension', payload: { dimId } },
    ]);
    this._setHash('d', dimId);
    if (!isNew) this._cacheTouch(sig);
  }

  _applyCategory(dimId, categoryName, center) {
    if (!this.dm.getDim(dimId)) { this._applyUniverse(); return; }
    this._transitionCue();
    // 进入分类名人层（L4）：当前 L3 分类视图作为上层淡出背景保留
    if (this.activeView && this.activeView instanceof CategoryView && this.activeView.dimId === dimId) {
      this._parentView = this.activeView;
      this.activeView = null;
      this._parentView.setFaded(true);
    } else {
      this._evictActiveToCache();
    }
    const sig = `catfig:${dimId}:${categoryName}`;
    let view = this.viewCache.get(sig);
    let isNew = false;
    if (!view) {
      view = new CategoryFigureView(this.dm, dimId, categoryName, center);
      isNew = true;
    } else {
      this.viewCache.delete(sig);
      view.setCenter(center);
    }
    this.scene.scene.add(view.group);
    this.activeView = view;
    this.viewLevel = 'category';
    this.currentDimId = dimId;
    this.currentCategory = categoryName;
    this.currentFigureId = null;
    this.currentCenter.copy(center);
    this.orbitSystem.setRunning(false);
    this.orbitSystem.setRingsFaded(true, dimId, true); // 宇宙层轨道淡出，L3 下当前维度锚点也调暗
    this.orbitSystem.setPlanetDimmed(dimId, true);
    if (this._parentView) this._parentView.setFaded(true);
    this.panel.hide();
    this.btnBack.classList.remove('hidden');
    if (this.titleDisplay) this.titleDisplay.style.display = 'none';
    const dim = this.dm.getDim(dimId);
    this._updateTitle(categoryName, '点击名人探索生平');
    this.cameraCtrl.focusOn(center.clone());
    this._refreshClickables();
    this.breadcrumb.render([
      { label: '中華名人堂', level: 'universe' },
      { label: dim.name, level: 'dimension', payload: { dimId } },
      { label: categoryName, level: 'category', payload: { dimId, categoryName } },
    ]);
    this._setHash('c', `${dimId}/${encodeURIComponent(categoryName)}`);
    if (!isNew) this._cacheTouch(sig);
  }

  async _applyFigure(figureId, center) {
    this._transitionCue();
    // 先确定目标人物所属维度，便于判断上层（维度）背景是否仍相关
    const _basic = this.dm.getFigureBasic(figureId);
    const _figDimId = _basic ? _basic.dimId : null;

    // 跨维度跳转时，旧的上层（维度）背景已不相关，直接释放
    if (this._parentView && this._parentView.dimId !== _figDimId) {
      this._disposeParent();
    }

    // 若当前正是「同一维度」的维度视图，则保留为上层淡出背景（不逐出缓存）；
    // 进入图视图时，其分类层（L3）轨道与卫星一并变淡，作为背景不干扰图视图。
    if (this.activeView && this.activeView instanceof CategoryView
        && this.activeView.dimId === _figDimId) {
      this._parentView = this.activeView;
      this.activeView = null;
      this._parentView.setFaded(true);
    } else {
      this._evictActiveToCache();
    }
    const sig = `fig:${figureId}`;
    let view = this.viewCache.get(sig);
    let isNew = false;
    if (!view) {
      view = new FigureView(this.dm, figureId, center, this.orbitSystem, this.scene.scene);
      this._setLoading(true);
      await view.loadRelations();
      this._setLoading(false);
      isNew = true;
    } else {
      this.viewCache.delete(sig);
      view.setCenter(center);
    }
    view.ensureGravity();
    this.scene.scene.add(view.group);
    if (view.gravityGroup) this.scene.scene.add(view.gravityGroup);
    this.activeView = view;
    this.viewLevel = 'figure';
    this.currentFigureId = figureId;
    this.currentCenter.copy(center);
    // 保留 currentDimId（来自进入前的维度），若缺失则从 basic 取
    if (!this.currentDimId) {
      const b = this.dm.getFigureBasic(figureId);
      this.currentDimId = b ? b.dimId : null;
    }
    this.orbitSystem.setRunning(false);
    this.btnBack.classList.remove('hidden');
    // 上层轨道变淡：宇宙层轨道淡出（保留当前维度轨道作锚），非当前维度行星变暗；
    // 若由维度视图下钻而来，父级（分类层 L3）轨道与卫星一并淡出，作为背景不干扰图视图。
    this.orbitSystem.setRingsFaded(true, this.currentDimId, true);
    this.orbitSystem.setPlanetDimmed(this.currentDimId, true);
    if (this._parentView) this._parentView.setFaded(true);
    if (this.titleDisplay) this.titleDisplay.style.display = 'none';
    const basic = this.dm.getFigureBasic(figureId);
    const dim = basic ? this.dm.getDim(basic.dimId) : null;
    // 从 figure 数据补全分类层（随机/面板/URL 直接进入 L4 时 currentCategory 可能缺失）
    const categoryName = this.currentCategory || (basic ? basic.category : '') || '';
    this.currentCategory = categoryName;
    this._updateTitle(basic ? basic.basic.name : figureId,
      `${dim ? dim.name : ''} · ${categoryName}`);
    this.cameraCtrl.focusOn(center.clone());
    this._refreshClickables();
    this.breadcrumb.render([
      { label: '中華名人堂', level: 'universe' },
      { label: dim ? dim.name : '', level: 'dimension', payload: { dimId: this.currentDimId } },
      { label: categoryName, level: 'category', payload: { dimId: this.currentDimId, categoryName } },
      { label: basic ? basic.basic.name : figureId, level: 'figure' },
    ]);
    this.panel.showFigure(figureId);
    this._setHash('f', figureId);
    if (!isNew) this._cacheTouch(sig);
  }

  // 将当前活动视图移入 LRU 缓存（而非直接 dispose），超出上限时显式释放最久未用者。
  _evictActiveToCache() {
    if (!this.activeView) return;
    const v = this.activeView;
    const sig = v.cacheSignature;
    this.scene.scene.remove(v.group);
    if (v.gravityGroup) this.scene.scene.remove(v.gravityGroup);
    this.activeView = null;
    if (sig) {
      if (this.viewCache.has(sig)) this.viewCache.delete(sig);
      this.viewCache.set(sig, v);
      while (this.viewCache.size > this.CACHE_LIMIT) {
        const oldest = this.viewCache.keys().next().value;
        const old = this.viewCache.get(oldest);
        this.viewCache.delete(oldest);
        old.dispose();
      }
    }
  }

  // 命中缓存后将其移到最近使用位（Map 保序）
  _cacheTouch(sig) {
    if (!this.viewCache.has(sig)) return;
    const v = this.viewCache.get(sig);
    this.viewCache.delete(sig);
    this.viewCache.set(sig, v);
  }

  _disposeView() {
    if (this.activeView) {
      this.activeView.dispose();
      this.activeView = null;
    }
  }

  // 释放上层（维度）淡出背景视图
  _disposeParent() {
    if (this._parentView) {
      this.scene.scene.remove(this._parentView.group);
      this._parentView.dispose();
      this._parentView = null;
    }
  }

  // ---------- 点击路由 ----------
  _onClick(hit) {
    if (!hit) { this._onBackgroundClick(); return; }
    const ud = hit.userData;
    if (!ud) return;

    if (ud.isSun) { this.panel.showSunOverview(); return; }

    if (ud.kind === 'planet') {
      this.navigateTo(this._dimensionState(ud.dimId));
      return;
    }
    if (ud.kind === 'categoryPlanet') {
      const c = ud.planet.getWorldPosition(new THREE.Vector3());
      this.navigateTo(this._categoryState(ud.dimId, ud.categoryName, c));
      return;
    }
    if (ud.kind === 'figure') {
      // L4 分类名人层：点击名人 → 聚焦 + 选中高亮 + 四级头部 + 背景染色（严格四层）
      if (this.viewLevel === 'category') {
        this._selectFigure(ud.figureId, ud.moon);
        return;
      }
      const c = ud.moon.getWorldPosition(new THREE.Vector3());
      this.navigateTo(this._figureState(ud.figureId, c));
      return;
    }
    if (ud.kind === 'relation') {
      if (ud.isInList) {
        const c = this.orbitSystem.getPlanetWorldPos(ud.dimId);
        this.navigateTo(this._figureState(ud.targetId, c, ud.dimId));
      } else {
        // 边缘人物：弹面板
        this.dm.getAssociate(ud.targetId).then(a => {
          this.panel.showAssociate({
            name: a.name, relation: ud.sub, summary: a.summary, baiduBaike: a.baiduBaike,
          });
        }).catch(() => {});
      }
      return;
    }
    if (ud.kind === 'self') {
      this.panel.showFigure(this.currentFigureId);
      return;
    }
  }

  _onHover(hit, prev) {
    // 悬停对应星球时，其所属轨道同步高亮发光；移开则复原
    if (prev && prev.userData && prev.userData.orbitRing) prev.userData.orbitRing.setHighlight(false);
    if (hit && hit.userData && hit.userData.orbitRing) hit.userData.orbitRing.setHighlight(true);
    if (!this.tooltip) return;
    // 触屏设备禁用 hover tooltip（避免双指拖动时画面残留提示；点击面板/星图本身已足够表达信息）
    if (this.isTouch) { this.tooltip.classList.add('hidden'); return; }
    if (!hit) { this.tooltip.classList.add('hidden'); return; }
    const ud = hit.userData;
    this.tooltip.textContent = ud.sub ? `${ud.name} · ${ud.sub}` : (ud.name || '');
    // 精确跟随鼠标指针（带偏移与视口夹取），而非固定居中（设计 Phase 4）
    const pad = 16;
    let x = this._mouseX + pad;
    let y = this._mouseY + pad;
    const r = this.tooltip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = this._mouseX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = this._mouseY - r.height - pad;
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
    this.tooltip.classList.remove('hidden');
  }

  // ---------- 名人选中（L4 第四级）----------
  // 点击分类名人层中的某颗名人卫星：聚焦 + 高亮 + 头部四级文字 + 背景染色，
  // 构成明确可感知的「第四级结构」，而非仅弹侧面板。
  _selectFigure(figureId, moon) {
    const c = moon.getWorldPosition(new THREE.Vector3());
    this.cameraCtrl.focusOn(c.clone());
    this.selectedFigureId = figureId;
    if (this.activeView && this.activeView.selectFigure) this.activeView.selectFigure(figureId);
    this.panel.showFigure(figureId);

    const basic = this.dm.getFigureBasic(figureId);
    const dim = basic ? this.dm.getDim(basic.dimId) : null;
    if (this.titleDisplay) {
      this.titleDisplay.classList.add('figure-header');
      this.titleDisplay.style.display = '';
      this._updateTitle(basic ? basic.basic.name : figureId,
        `${dim ? dim.name : ''} · ${this.currentCategory || ''}`);
    }
    this.breadcrumb.render([
      { label: '中華名人堂', level: 'universe' },
      { label: dim ? dim.name : '', level: 'dimension', payload: { dimId: this.currentDimId } },
      { label: this.currentCategory || '', level: 'category', payload: { dimId: this.currentDimId, categoryName: this.currentCategory } },
      { label: basic ? basic.basic.name : figureId, level: 'figure' },
    ]);

    // 背景染色：取该名人卫星主色，转成极淡的暗色相，强化聚焦凸显度
    const col = moon.color ? new THREE.Color(moon.color) : new THREE.Color('#ffffff');
    const hsl = {};
    col.getHSL(hsl);
    this.scene.setBackgroundTint(new THREE.Color().setHSL(hsl.h, 0.5, 0.06).getStyle());
  }

  _clearFigureSelection() {
    // 键盘焦点与选中态一并清除（含 tooltip 提示清理）
    this._kbFocus = null;
    this._kbFocusId = null;
    if (this._kbTipTimer) { clearTimeout(this._kbTipTimer); this._kbTipTimer = null; }
    if (this.tooltip) this.tooltip.classList.add('hidden');
    if (!this.selectedFigureId) return;
    this.selectedFigureId = null;
    if (this.activeView && this.activeView.clearSelection) this.activeView.clearSelection();
    this.scene.setBackgroundTint(null);
    if (this.titleDisplay) {
      this.titleDisplay.classList.remove('figure-header');
      this.titleDisplay.style.display = 'none';
    }
  }

  // ---------- 键盘方向键导航（浏览聚焦，不弹面板）----------
  // 名人层（L4）：在名人卫星间移动焦点（高亮 + 相机靠近 + 名称提示）
  // 分类层（L3）：在分类星球间移动焦点（相机靠近 + 名称提示）
  _kbNavigate(dir) {
    const av = this.activeView;
    if (!av) return;
    let items = [];
    if (this.viewLevel === 'category' && av.moons && av.moons.length) {
      items = av.moons.map(m => ({ id: m.figureId, name: m.name, kind: 'figure', moon: m, sub: m.sub }));
    } else if (this.viewLevel === 'dimension' && av.planets && av.planets.length) {
      items = av.planets.map(p => ({
        id: p.planet.categoryName || p.name, name: p.name, kind: 'category', planet: p.planet,
      }));
    }
    if (!items.length) return;

    let idx = -1;
    if (this._kbFocus) {
      const i = items.findIndex(it => it.kind === this._kbFocus.kind && it.id === this._kbFocus.id);
      if (i >= 0) idx = i;
    }
    if (idx < 0) idx = dir > 0 ? 0 : items.length - 1;      // 首次按键：从头/尾开始
    else idx = (idx + dir + items.length) % items.length;   // 环绕移动
    const target = items[idx];

    this._kbFocus = { id: target.id, kind: target.kind };
    this._kbFocusId = target.id;

    if (target.kind === 'figure' && target.moon) {
      if (av.selectFigure) av.selectFigure(target.id);       // 复用选中高亮（不弹面板）
      const c = target.moon.getWorldPosition(new THREE.Vector3());
      this.cameraCtrl.focusOn(c.clone(), 700, new THREE.Vector3(0, 1.2, 2.6));
      this._kbTooltip(target.name, target.sub);
    } else if (target.kind === 'category' && target.planet) {
      const c = target.planet.getWorldPosition(new THREE.Vector3());
      this.cameraCtrl.focusOn(c.clone(), 700, new THREE.Vector3(0, 1.2, 2.6));
      this._kbTooltip(target.name);
    }
  }

  // 键盘焦点确认：名人 → 打开详情面板；分类 → 下钻
  _openKbFocus() {
    const f = this._kbFocus;
    if (!f) return;
    const av = this.activeView;
    if (f.kind === 'figure' && av && av.moons) {
      const moon = av.moons.find(m => m.figureId === f.id);
      if (moon) this._selectFigure(f.id, moon);
    } else if (f.kind === 'category' && av && av.planets) {
      const p = av.planets.find(x => (x.planet.categoryName || x.name) === f.id);
      if (p) {
        const c = p.planet.getWorldPosition(new THREE.Vector3());
        this.navigateTo(this._categoryState(this.currentDimId, p.planet.categoryName || p.name, c));
      }
    }
  }

  // 键盘焦点提示：视口上部居中显示 2.6s（触屏无键盘，跳过）
  _kbTooltip(name, sub) {
    if (!this.tooltip || this.isTouch) return;
    this.tooltip.textContent = sub ? `${name} · ${sub}` : name;
    const w = this.tooltip.getBoundingClientRect().width;
    this.tooltip.style.left = Math.max(8, (window.innerWidth - w) / 2) + 'px';
    this.tooltip.style.top = '24%';
    this.tooltip.classList.remove('hidden');
    if (this._kbTipTimer) clearTimeout(this._kbTipTimer);
    this._kbTipTimer = setTimeout(() => this.tooltip.classList.add('hidden'), 2600);
  }

  // 点击空白处：若已选中某位名人，则取消选中（恢复分类层视图）
  _onBackgroundClick() {
    if (this.selectedFigureId) this._clearFigureSelection();
  }

  // ---------- 面板触发 ----------
  _jumpFigureFromPanel(figureId) {
    const b = this.dm.getFigureBasic(figureId);
    const c = b ? this.orbitSystem.getPlanetWorldPos(b.dimId) : new THREE.Vector3();
    this.navigateTo(this._figureState(figureId, c, b ? b.dimId : null));
  }

  _randomExplore() {
    const id = this.dm.randomFigureId;
    this._jumpFigureFromPanel(id);
  }

  _randomDimension() {
    const ids = [...this.dm.dims.keys()];
    const dimId = ids[Math.floor(Math.random() * ids.length)];
    this.navigateTo(this._dimensionState(dimId));
  }

  // 热门人物：每维度取一位代表性人物（按年代最早，通常为该领域开创/标志人物）
  _showHotFigures() {
    const items = [];
    for (const dim of this.dm.dims.values()) {
      const figs = this.dm.getDimFigures(dim.id)
        .slice()
        .sort((a, b) => a.sortYear - b.sortYear);
      const rep = figs[0];
      if (!rep) continue;
      items.push({
        id: rep.id,
        name: rep.basic.name,
        color: dim.color,
        meta: `${dim.name} · ${rep.basic.dynasty || ''}`,
      });
    }
    this.panel.showFigureList('热门人物 · 各维度代表', items);
  }

  // ---------- 工具 ----------
  _refreshClickables() {
    const list = [this.sun.mesh, ...this.orbitSystem.getPlanetMeshes()];
    if (this.activeView) list.push(...this.activeView.getClickables());
    this.raycaster.setClickables(list);
  }

  _updateTitle(main, sub) {
    if (this.mainTitle) this.mainTitle.textContent = main;
    const subEl = this.titleDisplay?.querySelector('.subtitle');
    if (subEl) subEl.textContent = sub;
  }

  // 层级切换「跃迁」提示：视野脉冲 + 闪屏（尊重 reduced-motion 已在各自内部处理）
  _transitionCue() {
    if (this.cameraCtrl) this.cameraCtrl.fovPulse();
    this._navFlash();
  }

  _navFlash() {
    const flash = document.getElementById('nav-flash');
    if (!flash) return;
    flash.classList.add('flash');
    setTimeout(() => flash.classList.remove('flash'), 180);
  }

  _setLoading(on) {
    let el = document.getElementById('loading');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loading';
      el.className = 'loading hidden';
      el.innerHTML = '<span class="loading-dot"></span>';
      document.body.append(el);
    }
    el.classList.toggle('hidden', !on);
  }

  _setHash(level, id) {
    const h = level === 'u' ? '#/u'
      : level === 'd' ? `#/d/${id}`
      : level === 'c' ? `#/c/${id}`
      : `#/f/${id}`;
    this._suppressHash = true;
    if (location.hash !== h) location.hash = h;
    else this._suppressHash = false;
  }

  _parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length) return this._universeState();
    if (parts[0] === 'u') return this._universeState();
    if (parts[0] === 'd' && parts[1]) {
      return this.dm.getDim(parts[1]) ? this._dimensionState(parts[1]) : this._universeState();
    }
    if (parts[0] === 'c' && parts[1]) {
      if (!this.dm.getDim(parts[1])) return this._universeState();
      let cat = '';
      try { cat = decodeURIComponent(parts[2] || ''); }
      catch { return this._dimensionState(parts[1]); }
      return cat ? this._categoryState(parts[1], cat) : this._dimensionState(parts[1]);
    }
    if (parts[0] === 'f' && parts[1]) {
      const b = this.dm.getFigureBasic(parts[1]);
      if (b) return this._figureState(parts[1], null, b.dimId);
    }
    return this._universeState();
  }

  _resetIdle() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      // 信息面板打开 / 已选中名人 / 搜索框展开：用户正在交互，豁免回拢
      const panelOpen = this.panel && this.panel.root.classList.contains('open');
      const searchOpen = this.search && this.search.root.classList.contains('expanded');
      if (panelOpen || this.selectedFigureId || searchOpen) { this._resetIdle(); return; }
      if (this.viewLevel !== 'universe') {
        this.history = [];
        this._apply(this._universeState());
      }
    }, IDLE_MS);
  }

  // ---------- 渲染循环 ----------
  // 真实 dt 驱动：修复旧版 `this.clock += 0.016` 在 120Hz 屏上速度翻倍、低帧率变慢的 bug。
  // 公转/自转增量统一用 dt（秒）替换 0.016。
  _animate(t) {
    requestAnimationFrame((nt) => this._animate(nt));
    let dt;
    if (!this._lastT) { dt = 0.016; } else { dt = Math.min((t - this._lastT) / 1000, 0.05); }
    this._lastT = t;
    this.clock += dt;
    // 减少动态效果偏好下整体放慢公转（视觉信息保留，运动幅度降低）
    const slow = REDUCED_MOTION() ? 0.25 : 1.0;
    this.sun.update(this.clock, dt, slow);
    this.orbitSystem.update(this.clock, dt, this.running, slow);
    if (this.activeView) {
      this.activeView.update(this.clock, dt, slow);
      this._updateLabels();
    }
    // 上层（维度）淡出背景视图也需更新，才能平滑执行其轨道/卫星的淡出过渡
    if (this._parentView) this._parentView.update(this.clock, dt, slow);
    if (this._debug) this._tickFps();
  }

  // 调试 FPS 计数器（设计 Phase 2b 性能压力测试辅助）：?debug 开启
  _tickFps() {
    this._fpsFrames++;
    const now = performance.now();
    const dt = now - this._fpsLast;
    if (dt >= 500) {
      const fps = Math.round((this._fpsFrames * 1000) / dt);
      if (!this._fpsEl) {
        this._fpsEl = document.createElement('div');
        this._fpsEl.id = 'fps-meter';
        document.body.append(this._fpsEl);
      }
      const views = this.activeView ? this.activeView.constructor.name : 'universe';
      const cached = this.viewCache.size;
      this._fpsEl.textContent = `FPS ${fps} · ${views} · 缓存 ${cached}`;
      this._fpsFrames = 0;
      this._fpsLast = now;
    }
  }

  _updateLabels() {
    if (!this.activeView) return;
    const cam = this.scene.camera;
    const tmp = new THREE.Vector3();
    // 卫星标签：仅在足够近且自身未淡出时显示（避免远景标签杂乱）
    this.activeView.forEachMoon((m) => {
      if (!m.label) return;
      m.getWorldPosition(tmp);
      const dist = cam.position.distanceTo(tmp);
      m.setLabelVisible(dist < 34 && m.fade > 0.6);
    });
    // 行星名已内嵌星球内部（由 Planet.update 按 fade 控制显隐），此处不再按距离隐藏
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__app = new App();
  // 注册 Service Worker（PWA 离线缓存）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[SW] 注册失败', e));
  }
});
