// RelationMap —— 关联人物关系图（设计 3.4 / Phase 3）。
// 以当前名人为中心，关联人物环绕为节点，按维度色着色；节点可点击跃迁或在册/边缘处理。
// 纯 Canvas 2D 绘制，响应式宽度，设备上像素比清晰。
import { el } from './dom.js';

export function createRelationMap(resolved, handlers = {}) {
  // resolved: [{ kind, id, name, color, relation, dimId, ... }]
  const wrap = el('div', { class: 'relmap' });
  const canvas = document.createElement('canvas');
  canvas.className = 'relmap-canvas';
  wrap.append(canvas);

  const nodes = []; // { x, y, r, item, color }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let W = 0, H = 0;
  const PAD = 14;

  function layout() {
    const parent = wrap.parentElement;
    W = Math.max(260, (parent ? parent.clientWidth : 360) - 40);
    H = Math.min(260, Math.max(200, W * 0.62));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) / 2 - PAD;
    nodes.length = 0;
    // 中心节点（当前名人）
    nodes.push({ x: cx, y: cy, r: 16, item: null, color: '#FFD700', center: true });
    const n = resolved.length;
    resolved.forEach((item, i) => {
      const ang = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      const rr = n > 1 ? R : 0;
      nodes.push({
        x: cx + rr * Math.cos(ang),
        y: cy + rr * Math.sin(ang),
        r: 9,
        item,
        color: item.color || (item.kind === 'figure' ? '#9aa0a6' : '#6b7280'),
      });
    });
  }

  function colorOf(c) {
    // 将 #rrggbb 转 rgba 字符串
    const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
    if (!m) return 'rgba(255,255,255,0.8)';
    const num = parseInt(m[1], 16);
    return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},`;
  }

  function draw() {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cx = nodes[0].x, cy = nodes[0].y;

    // 连线（中心 → 关联）
    for (let i = 1; i < nodes.length; i++) {
      const nd = nodes[i];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nd.x, nd.y);
      ctx.strokeStyle = colorOf(nd.color) + '0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 节点
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      const isFig = nd.item && nd.item.kind === 'figure';
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2);
      const base = colorOf(nd.color);
      // 外发光
      const grad = ctx.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, nd.r * 1.8);
      grad.addColorStop(0, base + '0.95)');
      grad.addColorStop(1, base + '0)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.fillStyle = base + '1)';
      ctx.fill();
      ctx.lineWidth = nd.center ? 2 : 1;
      ctx.strokeStyle = nd.center ? 'rgba(255,215,0,0.9)' : 'rgba(255,255,255,0.35)';
      ctx.stroke();

      // 标签（关联名）
      if (!nd.center) {
        ctx.font = '300 10px "Noto Sans SC", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.textAlign = 'center';
        const name = nd.item.name || '';
        ctx.fillText(name.length > 4 ? name.slice(0, 4) + '…' : name, nd.x, nd.y + nd.r + 11);
      }
    }
    // 中心名牌
    if (nodes[0].item === null && resolved.length) {
      // 中心为当前名人（由调用方在标题处标注），此处不重复画字
    }
  }

  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    for (let i = 1; i < nodes.length; i++) {
      const nd = nodes[i];
      if ((px - nd.x) ** 2 + (py - nd.y) ** 2 <= (nd.r + 3) ** 2) {
        const it = nd.item;
        if (it.kind === 'figure') {
          handlers.onFigureJump && handlers.onFigureJump(it.id);
        } else {
          handlers.onAssociate && handlers.onAssociate(it);
        }
        return;
      }
    }
  }

  // 首次绘制需在挂载后（父容器有宽度）
  requestAnimationFrame(() => {
    layout();
    draw();
  });
  canvas.addEventListener('click', onClick);
  wrap._relayout = () => { layout(); draw(); };

  return wrap;
}
