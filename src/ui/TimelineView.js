import { el } from './dom.js';

// 全局时间线视图（精简版）：把 361 人从"星系空间隐喻"切换到"历史时间隐喻"。
// 结构：朝代色带背景 → 每 50 年密度柱 → 人物点（维度色、桶内纵向散布）→ hover 姓名/点击跳详情。
// 纯 2D Canvas 一次性绘制 + 事件委托，无每帧循环；数据来自 DataManager.getAllFigures()。

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

export class TimelineView {
  constructor({ dm, onFigureJump }) {
    this.dm = dm;
    this.onFigureJump = onFigureJump;
    this.figures = dm.getAllFigures().filter((f) => f.sortYear >= YEAR_MIN && f.sortYear <= YEAR_MAX);
    this.pts = [];       // 渲染后的命中点 {x, y, fig}
    this.hoverIdx = -1;

    this.root = el('div', { class: 'timeline-view hidden' },
      el('div', { class: 'tl-head' },
        el('span', { class: 'tl-title' }, '中华群星 · 历史时间线'),
        el('span', { class: 'tl-sub' }, `${this.figures.length} 位人物 · 点击人物进入详情`),
      ),
      el('canvas', { class: 'tl-canvas' }),
      el('div', { class: 'tl-tip hidden' }),
    );
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('.tl-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tip = this.root.querySelector('.tl-tip');

    this._bind();
  }

  show() { this.root.classList.remove('hidden'); this._resize(); }
  hide() { this.root.classList.add('hidden'); }

  // 窗口尺寸变化时按新分辨率重绘（高频 resize 用 rAF 节流）
  _resize() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.root.clientWidth, h = this.root.clientHeight;
      if (!w || !h) return;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._draw(w, h);
    });
  }

  _draw(w, h) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const chartW = w - PAD_L - PAD_R;
    const chartH = h - PAD_T - PAD_B;
    const xOf = (year) => PAD_L + ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * chartW;

    // 1) 朝代色带
    for (const b of BANDS) {
      const x0 = xOf(Math.max(b.from, YEAR_MIN));
      const x1 = xOf(Math.min(b.to, YEAR_MAX));
      if (x1 <= x0) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(x0, PAD_T - 34, x1 - x0, chartH + 34);
      // 朝代名（相邻带间距足够才绘制，避免重叠）
      if (x1 - x0 > 34) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, (x0 + x1) / 2, PAD_T - 20);
      }
    }

    // 2) 密度柱（每 50 年）
    const buckets = new Map();
    for (const f of this.figures) {
      const k = Math.floor(f.sortYear / BUCKET);
      if (!buckets.has(k)) buckets.set(k, 0);
      buckets.set(k, buckets.get(k) + 1);
    }
    let maxN = 1;
    for (const n of buckets.values()) maxN = Math.max(maxN, n);
    const barTop = PAD_T + 6, barMaxH = chartH * 0.5;
    for (const [k, n] of buckets) {
      const bx = xOf(k * BUCKET + BUCKET / 2);
      const bh = (n / maxN) * barMaxH;
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(bx - 1.5, barTop + barMaxH - bh, 3, bh);
    }

    // 3) 人物点：桶内纵向散布（同桶点错开避免重叠），维度色
    const slot = new Map(); // bucket -> 已用槽位
    this.pts = [];
    const baseY = barTop + barMaxH + 8;
    const step = 9;
    const dims = this.figures;
    for (const f of dims) {
      const k = Math.floor(f.sortYear / BUCKET);
      const n = slot.get(k) || 0;
      slot.set(k, n + 1);
      const x = xOf(f.sortYear);
      const y = Math.min(baseY + n * step, PAD_T + chartH - 8);
      this.pts.push({ x, y, fig: f });
      ctx.fillStyle = f.color || '#cfd8e8';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 4) 年份刻度（每 250 年）
    ctx.fillStyle = 'rgba(255,255,255,0.40)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    for (let y = Math.ceil(YEAR_MIN / 250) * 250; y <= YEAR_MAX; y += 250) {
      const x = xOf(y);
      ctx.fillRect(x, PAD_T + chartH, 1, 6);
      ctx.fillText((y < 0 ? '公元前 ' + (-y) : String(y)), x, PAD_T + chartH + 18);
    }

    // hover 高亮（若有）
    if (this.hoverIdx >= 0 && this.pts[this.hoverIdx]) {
      const p = this.pts[this.hoverIdx];
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, 6.2832);
      ctx.stroke();
    }
  }

  _bind() {
    this.canvas.addEventListener('mousemove', (e) => this._onMove(e));
    this.canvas.addEventListener('mouseleave', () => this._setHover(-1));
    this.canvas.addEventListener('click', (e) => this._onClick(e));
  }

  _hit(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = -1, bestD = HIT_R;
    for (let i = 0; i < this.pts.length; i++) {
      const dx = this.pts[i].x - mx, dy = this.pts[i].y - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  _onMove(e) {
    const i = this._hit(e);
    this._setHover(i);
    if (i >= 0) {
      const f = this.pts[i].fig;
      const rect = this.canvas.getBoundingClientRect();
      this.tip.classList.remove('hidden');
      this.tip.textContent = `${f.name} · ${f.dynasty || '年代不详'}`;
      this.tip.style.left = Math.min(rect.left + this.pts[i].x + 12, window.innerWidth - 180) + 'px';
      this.tip.style.top = (rect.top + this.pts[i].y - 34) + 'px';
    } else {
      this.tip.classList.add('hidden');
    }
  }

  _setHover(i) {
    if (this.hoverIdx !== i) {
      this.hoverIdx = i;
      this._resize(); // 重绘高亮
    }
  }

  _onClick(e) {
    const i = this._hit(e);
    if (i >= 0) this.onFigureJump && this.onFigureJump(this.pts[i].fig.id);
  }

  dispose() {
    this.root.remove();
    this._raf && cancelAnimationFrame(this._raf);
  }
}
