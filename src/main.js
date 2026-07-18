import * as THREE from 'three';
import { SceneManager } from './core/SceneManager.js';
import { Sun } from './entities/Sun.js';
import { OrbitSystem } from './core/OrbitSystem.js';
import { CameraController } from './core/CameraController.js';
import { Raycaster } from './core/Raycaster.js';
import { StateMachine } from './data/StateMachine.js';
import { DataManager } from './data/DataManager.js';
import { DimensionView } from './entities/DimensionView.js';
import { FigureView } from './entities/FigureView.js';
import { InfoPanel } from './ui/InfoPanel.js';
import { Search } from './ui/Search.js';
import { Breadcrumb } from './ui/Breadcrumb.js';

const IDLE_MS = 15000; // 15 秒无操作自动回拢

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
    this.state = new StateMachine();
    this.history = [];          // 导航历史栈（≤20）
    this.activeView = null;     // DimensionView | FigureView
    this.viewCache = new Map(); // LRU 视图缓存（设计 6.4）：signature -> view
    this.CACHE_LIMIT = 3;       // 保留最近 2~3 个场景层
    this.viewLevel = 'universe';
    this.currentDimId = null;
    this.currentFigureId = null;
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
      onAssociateJump: (data) => this.panel.showAssociate(data),
      onClose: () => {},
    });
    this.search = new Search({ dm: this.dm, onResult: (id) => this._jumpFigureFromPanel(id) });
    this.breadcrumb = new Breadcrumb({
      onJump: (level, payload) => {
        if (level === 'universe') this.navigateTo(this._universeState());
        else if (level === 'dimension') this.navigateTo(this._dimensionState(payload.dimId));
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
    this.raycaster.on('hover', (hit) => this._onHover(hit));

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

    // 空闲计时
    ['pointermove', 'click', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
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
    if (state.level === 'universe') this._applyUniverse();
    else if (state.level === 'dimension') this._applyDimension(state.dimId, state.center);
    else if (state.level === 'figure') this._applyFigure(state.figureId, state.center);
  }

  _applyUniverse() {
    this._disposeView();
    this.viewLevel = 'universe';
    this.currentDimId = null;
    this.currentFigureId = null;
    this.currentCenter.set(0, 0, 0);
    this.orbitSystem.setRunning(true);
    this.panel.hide();
    this.cameraCtrl.focusUniverse();
    this.btnBack.classList.add('hidden');
    if (this.titleDisplay) this.titleDisplay.style.display = '';
    this._updateTitle('中华文明', '点击星球探索上下五千年');
    this._refreshClickables();
    this.breadcrumb.render([]);
    this._setHash('u');
  }

  _applyDimension(dimId, center) {
    this._evictActiveToCache();
    const sig = `dim:${dimId}`;
    let view = this.viewCache.get(sig);
    let isNew = false;
    if (!view) {
      view = new DimensionView(this.dm, dimId, center);
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
    this.panel.hide();
    this.btnBack.classList.remove('hidden');
    if (this.titleDisplay) this.titleDisplay.style.display = 'none';
    const dim = this.dm.getDim(dimId);
    this._updateTitle(dim.name, '点击名人卫星深入探索');
    this.cameraCtrl.focusOn(center.clone());
    this._refreshClickables();
    this.breadcrumb.render([
      { label: '中华文明', level: 'universe' },
      { label: dim.name, level: 'dimension', payload: { dimId } },
    ]);
    this._setHash('d', dimId);
    if (!isNew) this._cacheTouch(sig);
  }

  async _applyFigure(figureId, center) {
    this._evictActiveToCache();
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
    if (this.titleDisplay) this.titleDisplay.style.display = 'none';
    const basic = this.dm.getFigureBasic(figureId);
    const dim = basic ? this.dm.getDim(basic.dimId) : null;
    this._updateTitle(basic ? basic.basic.name : figureId, dim ? dim.name : '');
    this.cameraCtrl.focusOn(center.clone());
    this._refreshClickables();
    this.breadcrumb.render([
      { label: '中华文明', level: 'universe' },
      { label: dim ? dim.name : '', level: 'dimension', payload: { dimId: this.currentDimId } },
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

  // ---------- 点击路由 ----------
  _onClick(hit) {
    const ud = hit.userData;
    if (!ud) return;

    if (ud.isSun) { this.panel.showSunOverview(); return; }

    if (ud.kind === 'planet') {
      this.navigateTo(this._dimensionState(ud.dimId));
      return;
    }
    if (ud.kind === 'category') {
      if (this.activeView && this.activeView.toggleCategory) {
        this.activeView.toggleCategory(ud.categoryIndex);
        this._refreshClickables();
      }
      return;
    }
    if (ud.kind === 'figure') {
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

  _onHover(hit) {
    if (!this.tooltip) return;
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
    const h = level === 'u' ? '#/u' : level === 'd' ? `#/d/${id}` : `#/f/${id}`;
    this._suppressHash = true;
    if (location.hash !== h) location.hash = h;
    else this._suppressHash = false;
  }

  _parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length) return this._universeState();
    if (parts[0] === 'u') return this._universeState();
    if (parts[0] === 'd' && parts[1]) return this._dimensionState(parts[1]);
    if (parts[0] === 'f' && parts[1]) {
      const b = this.dm.getFigureBasic(parts[1]);
      if (b) return this._figureState(parts[1], null, b.dimId);
    }
    return this._universeState();
  }

  _resetIdle() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      if (this.viewLevel !== 'universe') {
        this.history = [];
        this._apply(this._universeState());
      }
    }, IDLE_MS);
  }

  // ---------- 渲染循环 ----------
  _animate() {
    requestAnimationFrame(() => this._animate());
    this.clock += 0.016;
    this.sun.update(this.clock);
    this.orbitSystem.update(this.clock);
    if (this.activeView) {
      this.activeView.update(this.clock);
      this._updateLabels();
    }
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
    this.activeView.forEachMoon((m) => {
      if (!m.label) return;
      m.getWorldPosition(tmp);
      const dist = cam.position.distanceTo(tmp);
      m.setLabelVisible(dist < 34);
    });
    // 行星标签远景隐藏
    for (const p of this.orbitSystem.planets) {
      if (!p.label) continue;
      const d = cam.position.distanceTo(p.getWorldPosition(tmp));
      p.label.visible = d < 60;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => new App());
