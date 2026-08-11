import { el } from './dom.js';

// 全局时间线视图（P0 重构版）：朝代色带 + 50 年密度柱 + 人物点。
// 能力：朝代带点击 → 平滑缩放聚焦该朝代区间（看清细节）；「⟲ 全览」复位；
//      人物点点击 → 底部迷你详情卡（可去完整详情）；hover 高亮（含生卒年）；
//      Esc 收起迷你卡；←→ 在放大态切换相邻朝代。
// 纯 2D Canvas 一次性绘制 + 事件委托；数据来自 DataManager.getAllFigures()。

// 朝代色带（年份区间映射，颜色极淡不抢人物点）
const BANDS = [
  { from: -1200, to: -771, name: '周及以前', color: 'rgba(140,150,170,0.16)' },
  { from: -770, to: -476, name: '春秋', color: 'rgba(120,200,220,0.15)' },
  { from: -475, to: -221, name: '战国', color: 'rgba(90,160,230,0.17)' },
  { from: -221, to: -207, name: '秦', color: 'rgba(230,190,90,0.20)' },
  { from: -206, to: 220, name: '汉', color: 'rgba(210,100,80,0.17)' },
  { from: 221, to: 280, name: '三国', color: 'rgba(230,150,70,0.17)' },
  { from: 281, to: 420, name: '晋', color: 'rgba(160,190,90,0.15)' },
  { from: 421, to: 589, name: '南北朝', color: 'rgba(160,110,200,0.17)' },
  { from: 581, to: 618, name: '隋', color: 'rgba(90,170,200,0.17)' },
  { from: 619, to: 907, name: '唐', color: 'rgba(220,120,80,0.19)' },
  { from: 908, to: 960, name: '五代', color: 'rgba(130,140,160,0.15)' },
  { from: 961, to: 1279, name: '宋', color: 'rgba(90,140,220,0.19)' },
  { from: 1271, to: 1368, name: '元', color: 'rgba(110,90,190,0.17)' },
  { from: 1369, to: 1644, name: '明', color: 'rgba(190,80,70,0.19)' },
  { from: 1645, to: 1911, name: '清', color: 'rgba(80,160,150,0.17)' },
  { from: 1912, to: 1950, name: '近现代', color: 'rgba(220,220,240,0.15)' },
];

const YEAR_MIN = -1200, YEAR_MAX = 1950;
const BUCKET = 50;      // 密度桶：50 年
const PAD_L = 64, PAD_R = 28, PAD_T = 56, PAD_B = 34;  // 画布留白（含标题/刻度）
const HIT_R = 9;        // 点击/hover 命中半径（移动端友好）
const ZOOM_MS = 380;    // 缩放聚焦动画时长
const FULL = { from: YEAR_MIN, to: YEAR_MAX };   // 全览区间

export class TimelineView {
  constructor({ dm, onFigureJump, onExit }) {
    this.dm = dm;
    this.onFigureJump = onFigureJump;
    this.figures = dm.getAllFigures().filter((f) => f.sortYear >= YEAR_MIN && f.sortYear <= YEAR_MAX);
    this.pts = [];        // {year, y, fig}（year 为绝对年份，绘制时按当前区间换算）
    this.hoverIdx = -1;
    this.selectedIdx = -1;
    this.view = { ...FULL };       // 当前可视年份区间
    this.focusBand = '';           // 聚焦中的朝代名（非空时高亮）
    this._vw = 0; this._vh = 0;

    this.root = el('div', { class: 'timeline-view hidden' },
      el('div', { class: 'tl-head' },
        el('button', { class: 'tl-exit', onclick: () => onExit && onExit() }, '← 返回'),
        el('span', { class: 'tl-title' }, '中华群星 · 历史时间线'),
        el('span', { class: 'tl-sub' }, `${this.figures.length} 位人物 · 点击朝代聚焦 · 点击人物查看详情`),
        el('button', { class: 'tl-full hidden', onclick: () => this._zoomTo(null) }, '⟲ 全览'),
      ),
      el('canvas', { class: 'tl-canvas' }),
      el('div', { class: 'tl-tip hidden' }),
      el('div', { class: 'tl-mini hidden' }),
    );
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('.tl-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tip = this.root.querySelector('.tl-tip');
    this.mini = this.root.querySelector('.tl-mini');
    this.btnFull = this.root.querySelector('.tl-full');

    this._bind();
  }

  show() { this.root.classList.remove('hidden'); this._resize(); }
  hide() { this.root.classList.add('hidden'); }

  _resize() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.root.clientWidth, h = this.root.clientHeight;
      if (!w || !h) return;
      this._vw = w; this._vh = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._draw();
    });
  }

  // 年份 → 像素（按当前可视区间映射到画布宽）
  _xOf(year) {
    const chartW = this._vw - PAD_L - PAD_R;
    const span = (this.view.to - this.view.from) || 1;
    return PAD_L + ((year - this.view.from) / span) * chartW;
  }

  _draw() {
    const ctx = this.ctx, w = this._vw, h = this._vh;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const chartW = w - PAD_L - PAD_R;
    const chartH = h - PAD_T - PAD_B;

    // 1) 朝代色带（仅绘制与当前区间相交的带；聚焦带高亮）
    for (const b of BANDS) {
      const x0 = this._xOf(Math.max(b.from, this.view.from));
      const x1 = this._xOf(Math.min(b.to, this.view.to));
      if (x1 <= x0) continue;
      ctx.fillStyle = this.focusBand === b.name ? 'rgba(255,215,0,0.10)' : b.color;
      ctx.fillRect(x0, PAD_T - 34, x1 - x0, chartH + 34);
      if (x1 - x0 > 40) {
        ctx.fillStyle = this.focusBand === b.name ? 'rgba(255,215,0,0.95)' : 'rgba(255,255,255,0.45)';
        ctx.font = this.focusBand === b.name ? 'bold 13px sans-serif' : '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, (x0 + x1) / 2, PAD_T - 20);
      }
    }

    // 2) 密度柱（当前区间内的 50 年桶）
    const buckets = new Map();
    for (const f of this.figures) {
      if (f.sortYear < this.view.from || f.sortYear > this.view.to) continue;
      const k = Math.floor(f.sortYear / BUCKET);
      if (!buckets.has(k)) buckets.set(k, 0);
      buckets.set(k, buckets.get(k) + 1);
    }
    let maxN = 1;
    for (const n of buckets.values()) maxN = Math.max(maxN, n);
    const barTop = PAD_T + 6, barMaxH = chartH * 0.5;
    for (const [k, n] of buckets) {
      const bx = this._xOf(k * BUCKET + BUCKET / 2);
      const bh = (n / maxN) * barMaxH;
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(bx - 1.5, barTop + barMaxH - bh, 3, bh);
    }

    // 3) 人物点（当前区间内；桶内纵向散布）
    const slot = new Map();
    this.pts = [];
    const baseY = barTop + barMaxH + 8;
    const step = 9;
    for (const f of this.figures) {
      if (f.sortYear < this.view.from || f.sortYear > this.view.to) continue;
      const k = Math.floor(f.sortYear / BUCKET);
      const n = slot.get(k) || 0;
      slot.set(k, n + 1);
      const y = Math.min(baseY + n * step, PAD_T + chartH - 8);
      this.pts.push({ year: f.sortYear, y, fig: f });
      const x = this._xOf(f.sortYear);
      ctx.fillStyle = f.color || '#cfd8e8';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 4) 年份刻度（当前区间内，间隔随缩放自适应）
    const spanYears = this.view.to - this.view.from;
    const tickStep = spanYears > 1500 ? 250 : spanYears > 600 ? 100 : 50;
    ctx.fillStyle = 'rgba(255,255,255,0.40)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const t0 = Math.ceil(this.view.from / tickStep) * tickStep;
    for (let y = t0; y <= this.view.to; y += tickStep) {
      const x = this._xOf(y);
      ctx.fillRect(x, PAD_T + chartH, 1, 6);
      ctx.fillText((y < 0 ? '公元前 ' + (-y) : String(y)), x, PAD_T + chartH + 18);
    }

    // 5) hover 高亮 + 选中态描边
    const mark = (i, r, color, lw) => {
      if (i < 0 || !this.pts[i]) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(this._xOf(this.pts[i].year), this.pts[i].y, r, 0, 6.2832);
      ctx.stroke();
    };
    if (this.selectedIdx >= 0) mark(this.selectedIdx, 8, 'rgba(255,215,0,0.95)', 2);
    if (this.hoverIdx >= 0 && this.hoverIdx !== this.selectedIdx) mark(this.hoverIdx, 7, 'rgba(255,255,255,0.85)', 1.5);
  }

  _bind() {
    this.canvas.addEventListener('mousemove', (e) => this._onMove(e));
    this.canvas.addEventListener('mouseleave', () => this._setHover(-1));
    this.canvas.addEventListener('click', (e) => this._onClick(e));
    this._onKey = (e) => {
      if (e.key === 'Escape') { this._closeMini(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { this._shiftBand(e.key === 'ArrowRight' ? 1 : -1); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  dispose() {
    this.root.remove();
    this._raf && cancelAnimationFrame(this._raf);
    this._anim && cancelAnimationFrame(this._anim);
    window.removeEventListener('keydown', this._onKey);
  }

  // 命中检测：鼠标坐标 → 年份 → 匹配人物点（区间内）
  _hit(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const chartW = this._vw - PAD_L - PAD_R;
    const span = (this.view.to - this.view.from) || 1;
    const year = this.view.from + ((mx - PAD_L) / chartW) * span;
    let best = -1, bestD = HIT_R;
    for (let i = 0; i < this.pts.length; i++) {
      const dy = this.pts[i].y - my;
      const dx = (this.pts[i].year - year) / span * chartW;  // 像素距离
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // 命中朝代带（年份区间比较）
  _hitBand(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const chartW = this._vw - PAD_L - PAD_R;
    const span = (this.view.to - this.view.from) || 1;
    const year = this.view.from + ((mx - PAD_L) / chartW) * span;
    for (const b of BANDS) {
      if (year >= b.from && year <= b.to) return b;
    }
    return null;
  }

  _onMove(e) {
    this._setHover(this._hit(e));
    if (this.hoverIdx >= 0) {
      const f = this.pts[this.hoverIdx].fig;
      const basic = this.dm.getFigureBasic(f.id);
      const b = basic ? basic.basic : null;
      const era = (b && b.era) || {};
      const years = (typeof era.start === 'number')
        ? `${era.start}—${era.end != null ? era.end : '?'}${era.approximate ? '（约）' : ''}`
        : (b ? (b.eraLabel || b.dynasty || '') : f.dynasty);
      const rect = this.canvas.getBoundingClientRect();
      this.tip.classList.remove('hidden');
      this.tip.textContent = `${f.name} · ${f.dynasty || '年代不详'} · ${years}`;
      this.tip.style.left = Math.min(rect.left + this._xOf(this.pts[this.hoverIdx].year) + 12, window.innerWidth - 220) + 'px';
      this.tip.style.top = (rect.top + this.pts[this.hoverIdx].y - 34) + 'px';
    } else {
      this.tip.classList.add('hidden');
    }
  }

  _setHover(i) {
    if (this.hoverIdx !== i) { this.hoverIdx = i; this._draw(); }
  }

  _onClick(e) {
    const i = this._hit(e);
    if (i >= 0) {
      if (this.selectedIdx === i) this._closeMini();
      else this._showMini(i);
      return;
    }
    const band = this._hitBand(e);
    if (band) this._zoomTo(band);
    else this._closeMini();
  }

  // 缩放聚焦：band=null 回全览；否则放大到该朝代区间（平滑动画）
  _zoomTo(band) {
    const from = this.view.from, to = this.view.to;
    const target = band ? { from: band.from, to: band.to } : { ...FULL };
    this.focusBand = band ? band.name : '';
    if (band) this.btnFull.classList.remove('hidden');
    else this.btnFull.classList.add('hidden');
    this._closeMini();
    if (Math.abs(from - target.from) < 1 && Math.abs(to - target.to) < 1) { this._draw(); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ZOOM_MS);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.view.from = from + (target.from - from) * e;
      this.view.to = to + (target.to - to) * e;
      this._draw();
      if (k < 1) this._anim = requestAnimationFrame(step);
      else this._anim = 0;
    };
    cancelAnimationFrame(this._anim);
    this._anim = requestAnimationFrame(step);
  }

  // 放大态下 ←→ 切换相邻朝代
  _shiftBand(dir) {
    if (!this.focusBand) return;
    const idx = BANDS.findIndex((b) => b.name === this.focusBand);
    const next = BANDS[idx + dir];
    if (next) this._zoomTo(next);
  }

  _closeMini() {
    if (this.selectedIdx >= 0) { this.selectedIdx = -1; this.mini.classList.add('hidden'); this._draw(); }
  }

  _showMini(i) {
    const p = this.pts[i];
    if (!p) return;
    const f = p.fig;
    const basic = this.dm.getFigureBasic(f.id);
    const b = basic ? basic.basic : null;
    const era = (b && b.era) || {};
    const years = (typeof era.start === 'number')
      ? `${era.start}—${era.end != null ? era.end : '?'}${era.approximate ? '（约）' : ''}`
      : (b ? (b.eraLabel || b.dynasty || '') : f.dynasty);
    const summary = (b && b.summary) || '';
    this.mini.classList.remove('hidden');
    this.mini.innerHTML = '';  // 重建（内容全部本地数据、经 el 文本节点，无注入面）
    this.mini.append(
      el('div', { class: 'tl-mini-head' },
        el('span', { class: 'tl-mini-name', style: `color:${f.color}` }, f.name),
        el('span', { class: 'tl-mini-meta' }, `${f.dynasty || ''} · ${years}`),
      ),
      summary ? el('p', { class: 'tl-mini-sum' }, summary.length > 90 ? summary.slice(0, 90) + '…' : summary) : null,
      el('button', { class: 'tl-mini-btn', onclick: () => this.onFigureJump && this.onFigureJump(f.id) }, '查看完整详情 →'),
    );
    this.selectedIdx = i;
    this._draw();
  }
}
