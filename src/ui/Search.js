import { el } from './dom.js';

// 顶部搜索：人名 / 拼音 / 拼音首字母 / 朝代 / 标签；支持按维度筛选。
export class Search {
  constructor(handlers = {}) {
    this.handlers = handlers; // { onResult, dm }
    this.dm = handlers.dm;
    this.filterDim = null;

    this.input = el('input', {
      class: 'search-input', type: 'text', placeholder: '搜索人物 / 拼音 / 朝代 / 标签…',
      oninput: (e) => this._onInput(e.target.value),
      onkeydown: (e) => { if (e.key === 'Enter') this._chooseFirst(); },
    });
    this.results = el('div', { class: 'search-results hidden' });
    this.toggle = el('button', { class: 'search-toggle', 'aria-label': '搜索', onclick: () => this._toggle() }, '🔍');

    // 维度筛选 chips：全部 + 八大维度
    this.filters = el('div', { class: 'search-filters' },
      this._chip('全部', null, true),
      ...[...this.dm.dims.values()].map((d) =>
        this._chip(d.name, d.id, false, d.color)),
    );

    this.root = el('div', { class: 'search-box' }, this.toggle, this.input, this.filters, this.results);
    document.body.append(this.root);
  }

  _chip(label, dimId, active, color) {
    const c = el('button', {
      class: 'search-filter' + (active ? ' active' : ''),
      style: color ? `--dim-color:${color}` : '',
      onclick: () => this._setFilter(dimId, c),
    }, label);
    c._dimId = dimId;
    return c;
  }

  _setFilter(dimId, chipEl) {
    this.filterDim = dimId;
    this.filters.querySelectorAll('.search-filter').forEach((c) => c.classList.remove('active'));
    chipEl.classList.add('active');
    this._onInput(this.input.value); // 即时按新筛选重算
  }

  _toggle() {
    this.root.classList.toggle('expanded');
    if (this.root.classList.contains('expanded')) this.input.focus();
  }

  _onInput(q) {
    const hits = this.dm.search(q, this.filterDim);
    this.results.innerHTML = '';
    const qTrim = (q || '').trim();
    if (!qTrim || !hits.length) {
      // 无结果时给出空态提示（避免「什么也没发生」的迷惑感）
      if (qTrim) {
        this.results.append(
          el('div', { class: 'search-empty' },
            el('span', { class: 'search-empty-icon' }, '🔍'),
            el('div', {}, `未匹配到「${qTrim}」`,
              this.filterDim ? '，可尝试切换维度筛选' : '，试试拼音 / 拼音首字母 / 朝代'),
          )
        );
      }
      this.results.classList.toggle('hidden', !qTrim); // 无 q 直接隐藏；有 q 但无结果则保留显示空态
      return;
    }
    for (const h of hits) {
      const item = el('button', {
        class: 'search-item',
        style: `--dim-color:${h.color}`,
        onclick: () => this._choose(h.id),
      },
        el('span', { class: 'search-dot' }),
        el('span', { class: 'search-name' }, ...this._highlight(h.name, qTrim)),
        el('span', { class: 'search-meta' }, `${h.dimName} · ${h.dynasty || ''}`),
      );
      this.results.append(item);
    }
    this.results.classList.remove('hidden');
  }

  // 把匹配词用 <span class="search-highlight"> 包裹（el 的文本节点渲染，XSS 安全）
  _highlight(text, q) {
    if (!q || !text) return text || '';
    const idx = text.indexOf(q);
    if (idx < 0) return text;
    const before = text.slice(0, idx);
    const hit = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    // 返回混合数组：字符串转文本节点、span 保持元素（el 对二者都安全）
    return [
      before ? el('span', {}, before) : null,
      el('span', { class: 'search-highlight' }, hit),
      after ? el('span', {}, after) : null,
    ];
  }

  _chooseFirst() {
    const first = this.results.querySelector('.search-item');
    if (first) first.click();
  }

  _choose(id) {
    this.results.classList.add('hidden');
    this.input.value = '';
    this.root.classList.remove('expanded');
    if (this.handlers.onResult) this.handlers.onResult(id);
  }
}
