// InfoPanel —— DOM 毛玻璃信息面板。
// 支持：名人完整详情 / 关联人物弹窗 / 太阳文明总览 / 维度总览。
// 通过 handlers 回调与 main 通信（跃迁、跨维度、随机探索、关闭）。

import { el } from './dom.js';
import { createRelationMap } from './RelationMap.js';

export class InfoPanel {
  constructor(dataManager, handlers = {}) {
    this.dm = dataManager;
    this.handlers = handlers; // { onFigureJump, onDimensionJump, onRandomExplore, onAssociateJump, onClose }

    this.root = el('div', { class: 'panel', id: 'info-panel' });
    this.handle = el('div', { class: 'panel-handle' });
    this.closeBtn = el('button', { class: 'panel-close', 'aria-label': '关闭', onclick: () => this.hide() }, '×');
    this.scroll = el('div', { class: 'panel-scroll' });
    this.root.append(this.handle, this.closeBtn, this.scroll);
    document.body.append(this.root);
    this._bindMobileDrag();
  }

  _bindMobileDrag() {
    let startY = 0, dragging = false;
    this.handle.addEventListener('pointerdown', (e) => { dragging = true; startY = e.clientY; this.root.classList.add('dragging'); });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      if (dy > 40) this.root.classList.add('panel-expanded');
    });
    window.addEventListener('pointerup', () => { dragging = false; this.root.classList.remove('dragging'); });
  }

  show() { this.root.classList.add('open'); }
  hide() {
    this.root.classList.remove('open', 'panel-expanded');
    if (this.handlers.onClose) this.handlers.onClose();
  }

  clear() { this.scroll.innerHTML = ''; }

  // ---------- 太阳文明总览 ----------
  async showSunOverview() {
    this.clear();
    const idx = this.dm.index;
    this.scroll.append(
      el('div', { class: 'panel-hero' },
        el('h2', { class: 'panel-title' }, '中华文明'),
        el('p', { class: 'panel-sub' }, 'Celestial Mandate · 天命星系'),
        el('p', { class: 'panel-lead' }, `以太阳系为隐喻，将上下五千年 ${idx.totalFigures} 位杰出人物，归入八大文化维度，编织成一座可探索的交互星系。`),
      )
    );

    const grid = el('div', { class: 'dim-grid' });
    for (const d of idx.dimensions) {
      const count = d.categories.reduce((s, c) => s + c.count, 0);
      const card = el('button', {
        class: 'dim-card',
        style: `--dim-color:${d.color}`,
        onclick: () => this.handlers.onDimensionJump && this.handlers.onDimensionJump(d.id),
      },
        el('span', { class: 'dim-dot' }),
        el('span', { class: 'dim-name' }, d.name),
        el('span', { class: 'dim-count' }, `${count} 位`),
      );
      grid.append(card);
    }
    this.scroll.append(grid);

    const actions = el('div', { class: 'panel-actions' },
      el('button', { class: 'btn-primary', onclick: () => this.handlers.onRandomExplore && this.handlers.onRandomExplore() }, '🎲 随机探索一位名人'),
    );
    this.scroll.append(actions);
    this.show();
  }

  // ---------- 维度总览 ----------
  showDimensionOverview(dimId) {
    this.clear();
    const d = this.dm.getDim(dimId);
    this.scroll.append(
      el('div', { class: 'panel-hero' },
        el('h2', { class: 'panel-title', style: `color:${d.color}` }, d.name),
        el('p', { class: 'panel-lead' }, d.description),
      )
    );
    const list = el('div', { class: 'cat-list' });
    for (const c of d.categories) {
      list.append(el('div', { class: 'cat-row' },
        el('span', { class: 'cat-name' }, c.name),
        el('span', { class: 'cat-count' }, `${c.count} 人`),
      ));
    }
    this.scroll.append(list);
    this.show();
  }

  showAssociate(data) {
    this.clear();
    this.scroll.append(
      el('div', { class: 'panel-hero' },
        el('h2', { class: 'panel-title' }, data.name),
        data.relation ? el('p', { class: 'panel-sub' }, `与当前名人的关系：${data.relation}`) : null,
      ),
      data.summary ? el('p', { class: 'panel-lead' }, data.summary) : null,
    );
    if (data.baiduBaike) {
      this.scroll.append(el('div', { class: 'panel-actions' },
        el('a', { class: 'btn-primary', href: data.baiduBaike, target: '_blank', rel: 'noopener' }, '查看百度百科 ↗'),
      ));
    }
    this.show();
  }

  // ---------- 名人完整详情 ----------
  async showFigure(figureId) {
    this.clear();
    const basic = this.dm.getFigureBasic(figureId);
    if (!basic) return;
    const detail = await this.dm.getFigureDetail(figureId).catch(() => null);
    const d = basic.basic;
    const dim = this.dm.getDim(basic.dimId);

    // 头部
    this.scroll.append(
      el('div', { class: 'panel-hero' },
        el('h2', { class: 'panel-title', style: `color:${dim.color}` }, d.name),
        el('p', { class: 'panel-sub' }, [d.honor, d.dynasty].filter(Boolean).join(' · ')),
        el('div', { class: 'tag-row' },
          ...d.tags.slice(0, 8).map(t => el('span', { class: 'tag' }, t)),
        ),
        el('p', { class: 'panel-lead' }, d.summary),
      )
    );

    // 史料整理中（详情缺失 / 内容极简时防御降级，设计 Phase 2b）
    const det = detail ? detail.details : null;
    if (!detail || !this._isRich(det)) {
      this.scroll.append(
        el('div', { class: 'block archive-pending' },
          el('div', { class: 'archive-icon' }, '📚'),
          el('h3', { class: 'block-title' }, '史料整理中'),
          el('p', { class: 'panel-lead' },
            detail ? '该人物的基础档案已收录，但生平年表、作品与关系等深度史料仍在汇编中，将随版本迭代补全。'
                   : '该人物的详细史料暂时无法加载，基础档案已收录于星系中。'),
          el('button', {
            class: 'btn-primary',
            onclick: () => this.handlers.onFigureJump && this.handlers.onFigureJump(figureId),
          }, '以此人为中心重构星系 ↻'),
        )
      );
      if (!detail) { this.show(); return; } // 无详情则只展示头部 + 占位
    }

    // 核心理念（哲学类）
    if (detail && detail.details && detail.details.ideology) {
      this.scroll.append(this._section('核心理念', [detail.details.ideology]));
    }

    // 生平年表
    if (detail && detail.details && detail.details.timeline && detail.details.timeline.length) {
      this.scroll.append(this._timeline(detail.details.timeline));
    }

    // 跨维度归属
    const cross = this.dm.getCrossDims(figureId);
    if (cross.length) {
      const chips = el('div', { class: 'chip-row' }, el('span', { class: 'chip-label' }, '跨维度：'));
      for (const cd of cross) {
        const cdDim = this.dm.getDim(cd);
        chips.append(el('button', {
          class: 'chip', style: `--dim-color:${cdDim.color}`,
          onclick: () => this.handlers.onDimensionJump && this.handlers.onDimensionJump(cd),
        }, cdDim.name));
      }
      this.scroll.append(el('div', { class: 'block' }, chips));
    }

    // 关联人物
    if (detail && detail.relations && detail.relations.length) {
      this.scroll.append(await this._relationsBlock(figureId));
    }

    // 作品 / 语录 / 成就 / 评价 / 影响 / 争议 / 纪念地 / 影视 / 冷知识 / 资料
    const det = detail ? detail.details : null;
    if (det) {
      // 图库（公共领域影像；数据驱动，空则占位）
      if (det.gallery && det.gallery.length) {
        this.scroll.append(this._galleryBlock(det.gallery));
      }
      if (det.works && det.works.length) {
        this.scroll.append(this._section('代表作品', det.works.map(w => `${w.title}（${w.type}）${w.summary ? '— ' + w.summary : ''}`)));
      }
      if (det.quotes && det.quotes.length) {
        this.scroll.append(this._quoteList(det.quotes));
      }
      if (det.achievements && det.achievements.length) {
        this.scroll.append(this._section('核心成就', det.achievements));
      }
      if (det.appraisals && det.appraisals.length) {
        this.scroll.append(this._quoteList(det.appraisals, '后世评价'));
      }
      if (det.influence) {
        this.scroll.append(this._section('历史影响', [det.influence]));
      }
      if (det.controversies && det.controversies.length) {
        this.scroll.append(this._section('相关争议', det.controversies));
      }
      if (det.memorials && det.memorials.length) {
        this.scroll.append(this._section('纪念地', det.memorials));
      }
      if (det.mediaPortrayals && det.mediaPortrayals.length) {
        this.scroll.append(this._section('影视/文学形象', det.mediaPortrayals));
      }
      if (det.trivia && det.trivia.length) {
        this.scroll.append(this._section('冷知识', det.trivia));
      }
      if (det.references && det.references.length) {
        this.scroll.append(this._section('参考资料', det.references));
      }
    }

    this.show();
  }

  // 图库区块：渲染公共领域影像；为空时展示整理中占位
  _galleryBlock(items) {
    const wrap = el('div', { class: 'block' },
      el('h3', { class: 'block-title' }, '图库 · 公共领域'),
    );
    if (!items.length) {
      wrap.append(el('div', { class: 'gallery-empty' },
        el('span', { class: 'gallery-empty-icon' }, '🖼️'),
        el('p', {}, '公共领域图库整理中，相关历史画像与文物影像将陆续补充。'),
      ));
      return wrap;
    }
    const grid = el('div', { class: 'gallery-grid' });
    for (const it of items) {
      const card = el('figure', { class: 'gallery-item' });
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = it.title || '';
      img.src = it.src;
      img.onerror = () => {
        img.style.display = 'none';
        if (!card.querySelector('.gallery-fallback')) {
          card.append(el('div', { class: 'gallery-fallback' }, '📷 图像加载失败'));
        }
      };
      card.append(img);
      card.append(el('figcaption', {},
        el('span', { class: 'g-title' }, it.title || ''),
        it.source ? el('span', { class: 'g-source' }, `来源：${it.source}`) : null,
        it.license ? el('span', { class: 'g-license' }, it.license) : null,
      ));
      grid.append(card);
    }
    wrap.append(grid);
    return wrap;
  }

  // 判断详情是否"充实"（用于史料整理中防御降级）
  _isRich(det) {
    if (!det) return false;
    return Boolean(
      (det.timeline && det.timeline.length) ||
      (det.works && det.works.length) ||
      (det.quotes && det.quotes.length) ||
      (det.achievements && det.achievements.length) ||
      (det.influence) ||
      (det.trivia && det.trivia.length)
    );
  }

  _section(title, items) {
    if (!items || !items.length) return null;
    return el('div', { class: 'block' },
      el('h3', { class: 'block-title' }, title),
      el('ul', { class: 'block-list' }, ...items.map(it => el('li', {}, it))),
    );
  }

  _quoteList(items, title = '经典语录') {
    if (!items || !items.length) return null;
    return el('div', { class: 'block' },
      el('h3', { class: 'block-title' }, title),
      ...items.map(q => el('blockquote', { class: 'quote' }, q)),
    );
  }

  _timeline(events) {
    const wrap = el('div', { class: 'block' }, el('h3', { class: 'block-title' }, '生平年表'));
    const tl = el('div', { class: 'timeline' });
    for (const ev of events) {
      tl.append(el('div', { class: `tl-item tl-${ev.type || 'milestone'}` },
        el('span', { class: 'tl-year' }, ev.year || '—'),
        el('span', { class: 'tl-event' }, ev.event),
      ));
    }
    wrap.append(tl);
    return wrap;
  }

  async _relationsBlock(figureId) {
    const resolved = await this.dm.resolveRelations(figureId);
    const wrap = el('div', { class: 'block' },
      el('h3', { class: 'block-title' }, `关联人物（${resolved.length}）`),
    );
    // 关系图（可视化网络，可点击）
    if (resolved.length) {
      const map = createRelationMap(resolved, {
        onFigureJump: (id) => this.handlers.onFigureJump && this.handlers.onFigureJump(id),
        onAssociate: (r) => this.handlers.onAssociateJump && this.handlers.onAssociateJump(r),
      });
      wrap.append(map);
    }
    // 列表（可访问性与移动端兜底）
    const list = el('div', { class: 'rel-list' });
    for (const r of resolved) {
      const isFig = r.kind === 'figure';
      const item = el('button', {
        class: `rel-item ${isFig ? 'rel-in' : 'rel-out'}`,
        style: isFig ? `--dim-color:${r.color}` : '',
        onclick: () => {
          if (isFig) this.handlers.onFigureJump && this.handlers.onFigureJump(r.id);
          else this.handlers.onAssociateJump && this.handlers.onAssociateJump(r);
        },
      },
        el('span', { class: 'rel-name' }, r.name),
        el('span', { class: 'rel-rel' }, r.relation || ''),
        isFig ? el('span', { class: 'rel-go' }, '↗') : el('span', { class: 'rel-go' }, 'ⓘ'),
      );
      list.append(item);
    }
    wrap.append(list);
    return wrap;
  }
}
