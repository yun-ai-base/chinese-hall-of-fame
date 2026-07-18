import { el } from './dom.js';

// 顶部搜索：人名 / 拼音 / 朝代 / 标签；结果点击 -> onResult(figureId)
export class Search {
  constructor(handlers = {}) {
    this.handlers = handlers; // { onResult }
    this.dm = handlers.dm;

    this.input = el('input', {
      class: 'search-input', type: 'text', placeholder: '搜索人物 / 朝代 / 标签…',
      oninput: (e) => this._onInput(e.target.value),
      onkeydown: (e) => { if (e.key === 'Enter') this._chooseFirst(); },
    });
    this.results = el('div', { class: 'search-results hidden' });
    this.toggle = el('button', { class: 'search-toggle', 'aria-label': '搜索', onclick: () => this._toggle() }, '🔍');

    this.root = el('div', { class: 'search-box' }, this.toggle, this.input, this.results);
    document.body.append(this.root);
  }

  _toggle() {
    this.root.classList.toggle('expanded');
    if (this.root.classList.contains('expanded')) this.input.focus();
  }

  _onInput(q) {
    const hits = this.dm.search(q);
    this.results.innerHTML = '';
    if (!q.trim() || !hits.length) { this.results.classList.add('hidden'); return; }
    for (const h of hits) {
      const item = el('button', {
        class: 'search-item',
        style: `--dim-color:${h.color}`,
        onclick: () => this._choose(h.id),
      },
        el('span', { class: 'search-dot' }),
        el('span', { class: 'search-name' }, h.name),
        el('span', { class: 'search-meta' }, `${h.dimName} · ${h.dynasty}`),
      );
      this.results.append(item);
    }
    this.results.classList.remove('hidden');
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
