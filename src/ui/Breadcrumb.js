import { el } from './dom.js';

// 面包屑：中华文明 › 维度 › 名人；点击任意段回跳。
export class Breadcrumb {
  constructor(handlers = {}) {
    this.handlers = handlers; // { onJump(level, payload) }
    this.root = el('nav', { class: 'breadcrumb', id: 'breadcrumb' });
    document.body.append(this.root);
  }

  // path: [{ label, level, payload }]
  render(path) {
    this.root.innerHTML = '';
    path.forEach((seg, i) => {
      const seg2 = el('span', { class: 'crumb-seg' }, seg.label);
      if (i < path.length - 1) {
        seg2.classList.add('clickable');
        seg2.addEventListener('click', () => this.handlers.onJump && this.handlers.onJump(seg.level, seg.payload));
      } else {
        seg2.classList.add('current');
      }
      this.root.append(seg2);
      if (i < path.length - 1) this.root.append(el('span', { class: 'crumb-sep' }, '›'));
    });
  }
}
