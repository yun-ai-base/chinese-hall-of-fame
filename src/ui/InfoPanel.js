// InfoPanel —— DOM 毛玻璃信息面板。
// 支持：名人完整详情 / 关联人物弹窗 / 太阳文明总览 / 维度总览。
// 通过 handlers 回调与 main 通信（跃迁、跨维度、随机探索、关闭）。

import { el } from './dom.js';
import { createRelationMap } from './RelationMap.js';

// 人物详情页低干扰意象粒子：按人物主题（特定人物 / 维度 / 分类）取色与运动，
// 仅以极淡的辉光呼应特色，绝不干扰正文阅读。
//   ember 上升余烬（神魔/兵戈）· data 冷蓝流光（科技数学）· herb 青绿微光（医学）
//   moon/ink 柔白光尘（诗词书画哲学）· dust 默认微尘
const AMBIENT_MOTIFS = {
  wu_chengen:  { kind: 'ember', c1: '#ff8a3c', c2: '#ffd27a', n: 48, label: '神魔灵光' },
  sun_wu_kong: { kind: 'ember', c1: '#ff5e3a', c2: '#ffcf6b', n: 48 },
  li_bai:      { kind: 'moon',  c1: '#bcd4ff', c2: '#ffffff', n: 40, label: '诗酒月华' },
  su_shi:      { kind: 'ink',   c1: '#cdd9ec', c2: '#eef3fb', n: 36 },
  wang_xizhi:  { kind: 'ink',   c1: '#e8d6b0', c2: '#fff4dd', n: 34 },
  zu_chongzhi: { kind: 'data',  c1: '#8fb8ff', c2: '#d6e6ff', n: 42, label: '算筹流光' },
  shen_kuo:    { kind: 'data',  c1: '#9fe0ff', c2: '#ffffff', n: 42 },
  li_shizhen:  { kind: 'herb',  c1: '#9fe0b0', c2: '#dcf7e3', n: 40, label: '本草微光' },
};

export class InfoPanel {
  constructor(dataManager, handlers = {}) {
    this.dm = dataManager;
    this.handlers = handlers; // { onFigureJump, onDimensionJump, onRandomExplore, onAssociateJump, onClose }
    this.isMobile = window.innerWidth < 768 || 'ontouchstart' in window;

    this.root = el('div', { class: 'panel', id: 'info-panel' });
    this.handle = el('div', { class: 'panel-handle' });
    this.closeBtn = el('button', { class: 'panel-close', 'aria-label': '关闭', onclick: () => this.hide() }, '×');
    this.scroll = el('div', { class: 'panel-scroll' });
    // 低干扰意象粒子层：置于最底层，pointer-events:none，仅作极淡背景辉光
    this.ambient = el('canvas', { class: 'panel-ambient' });
    this.root.append(this.ambient, this.handle, this.closeBtn, this.scroll);
    document.body.append(this.root);
    this._bindMobileDrag();
    window.addEventListener('resize', () => { if (this._amb) this._startAmbient(this._amb.motif); });
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
    this._stopAmbient();
    this.root.classList.remove('open', 'panel-expanded');
    if (this.handlers.onClose) this.handlers.onClose();
  }

  clear() { this._stopAmbient(); this.scroll.innerHTML = ''; }

  // ---------- 太阳文明总览 ----------
  async showSunOverview() {
    this.clear();
    const idx = this.dm.index;
    this.scroll.append(
      el('div', { class: 'panel-hero' },
        el('h2', { class: 'panel-title' }, '中華名人堂'),
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
        // 字号 / 别称（detail.styleName，如"字太白，号青莲居士"）
        (detail && detail.styleName) ? el('p', { class: 'panel-style' },
          el('span', { class: 'style-label' }, '字号'), detail.styleName) : null,
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
      if (!detail) { this._startAmbient(this._resolveMotif(figureId, basic.dimId, d.dimensionCategory || basic.category)); this.show(); return; } // 无详情则只展示头部 + 占位
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
    // 注：det 已在上方（史料整理中判断处）声明，此处直接复用，勿重复声明
    if (det) {
      // 图库（公共领域影像；数据驱动，空则占位）
      if (det.gallery && det.gallery.length) {
        this.scroll.append(this._galleryBlock(det.gallery));
      }
      // 地理坐标（detail.geo 经纬度 + 出生地名，为未来地图联动奠基）
      if (detail && detail.geo) {
        this.scroll.append(this._geoBlock(detail.geo, d));
      }
      // 代表作品：有全文则展示完整诗文块，否则仅列标题与简介
      if (det.works && det.works.length) {
        this.scroll.append(this._worksBlock(det.works));
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

    this._startAmbient(this._resolveMotif(figureId, basic.dimId, d.dimensionCategory || basic.category));
    this.show();
  }
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

  // 代表作品区块：有 fullText 时以居中诗文块展示完整诗文，否则仅列标题与简介
  _worksBlock(works) {
    if (!works || !works.length) return null;
    const wrap = el('div', { class: 'block' },
      el('h3', { class: 'block-title' }, '代表作品'),
    );
    for (const w of works) {
      const item = el('div', { class: 'work-item' });
      item.append(el('div', { class: 'work-head' },
        el('span', { class: 'work-title' }, w.title || '（佚名）'),
        w.type ? el('span', { class: 'work-type' }, w.type) : null,
      ));
      if (w.summary) item.append(el('p', { class: 'work-summary' }, w.summary));
      if (w.fullText && w.fullText.trim()) {
        item.append(el('div', { class: 'poem' }, w.fullText));
      }
      wrap.append(item);
    }
    return wrap;
  }

  // 地理坐标区块：展示出生地名 + 经纬度，附地图链接（为未来地图联动奠基）
  _geoBlock(geo, basic) {
    if (!geo || (geo.lat == null && geo.lng == null)) return null;
    const lat = geo.lat, lng = geo.lng;
    const place = (basic && basic.birthplace) ? basic.birthplace : '';
    const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=6/${lat}/${lng}`;
    return el('div', { class: 'block' },
      el('h3', { class: 'block-title' }, '地理坐标'),
      el('div', { class: 'geo-block' },
        place ? el('div', { class: 'geo-place' }, `出生地：${place}`) : null,
        el('div', { class: 'geo-coord' }, `纬度 ${lat} · 经度 ${lng}`),
        el('a', { class: 'geo-link', href: mapUrl, target: '_blank', rel: 'noopener' }, '在地图中查看 ↗'),
      ),
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

  // ---------- 低干扰意象粒子（人物详情页主题光效）----------
  // 按人物 id / 维度 / 分类解析主题，回退到默认微尘；保证每种人物都有低调呼应。
  _resolveMotif(figureId, dimId, category) {
    if (AMBIENT_MOTIFS[figureId]) return AMBIENT_MOTIFS[figureId];
    const cat = category || '';
    if (cat.includes('神魔') || dimId === 'mythology') return { kind: 'ember', c1: '#ff9a4d', c2: '#ffd98a', n: 46 };
    if (cat.includes('数学') || cat.includes('天文') || dimId === 'technology') return { kind: 'data', c1: '#9fd0ff', c2: '#eaf4ff', n: 40 };
    if (cat.includes('医学')) return { kind: 'herb', c1: '#9fe0b0', c2: '#dcf7e3', n: 38 };
    if (dimId === 'literature') return { kind: 'moon', c1: '#cfe0ff', c2: '#ffffff', n: 38 };
    if (dimId === 'art') return { kind: 'ink', c1: '#ecd9b5', c2: '#fff3da', n: 34 };
    if (dimId === 'philosophy') return { kind: 'ink', c1: '#c9b6ff', c2: '#efe8ff', n: 34 };
    if (dimId === 'military') return { kind: 'ember', c1: '#ff6b5e', c2: '#ffc7bd', n: 40 };
    if (dimId === 'politics') return { kind: 'ink', c1: '#ffe1a8', c2: '#fff4d8', n: 34 };
    if (dimId === 'exploration') return { kind: 'data', c1: '#8ff0e0', c2: '#dffaf4', n: 38 };
    return { kind: 'dust', c1: '#cfd8e8', c2: '#ffffff', n: 30 };
  }

  _startAmbient(motif) {
    this._stopAmbient();
    const cv = this.ambient;
    const rect = this.root.getBoundingClientRect();
    const w = Math.max(2, Math.round(rect.width)), h = Math.max(2, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = this.isMobile ? Math.round(motif.n * 0.6) : motif.n;
    const A = { ctx, w, h, motif, raf: 0, last: 0, parts: [] };
    for (let i = 0; i < n; i++) A.parts.push(this._spawnAmb(A, motif, true));
    // 尊重系统「减少动态效果」偏好：仅绘制一帧静态微光，不循环动画
    A.reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._amb = A;
    if (A.reduce) this._drawAmb(A, 0.016);
    else A.raf = requestAnimationFrame((t) => this._ambLoop(t));
  }

  _stopAmbient() {
    if (this._amb) {
      if (this._amb.raf) cancelAnimationFrame(this._amb.raf);
      this._amb = null;
    }
    const cv = this.ambient;
    if (cv) { const c = cv.getContext('2d'); if (c) c.clearRect(0, 0, cv.width, cv.height); }
  }

  _spawnAmb(A, motif, init) {
    const { w, h } = A;
    const kind = motif.kind;
    const c = Math.random() < 0.5 ? motif.c1 : motif.c2;
    const p = { x: Math.random() * w, y: Math.random() * h, c, phase: Math.random() * 6.283, tw: 0.4 + Math.random() * 1.8, size: 0, vx: 0, vy: 0, age: 0, max: 1 };
    if (kind === 'ember' || kind === 'herb') {
      p.size = 0.9 + Math.random() * 2.4;
      p.vy = -(0.12 + Math.random() * 0.5);          // 上升余烬
      p.vx = (Math.random() - 0.5) * 0.22;
      p.max = 2.6 + Math.random() * 3.2;
    } else if (kind === 'data') {
      p.size = 0.6 + Math.random() * 1.7;
      p.vx = (Math.random() - 0.5) * 0.16;
      p.vy = (Math.random() - 0.5) * 0.11;
      p.max = 3 + Math.random() * 4;
    } else {
      p.size = 0.7 + Math.random() * 1.9;
      p.vx = (Math.random() - 0.5) * 0.1;
      p.vy = (Math.random() - 0.5) * 0.08;
      p.max = 4 + Math.random() * 5;
    }
    p.age = init ? Math.random() * p.max : 0;
    return p;
  }

  _ambLoop(t) {
    if (!this._amb) return;
    if (!this._amb.last) this._amb.last = t;
    let dt = (t - this._amb.last) / 1000;
    if (dt > 0.05) dt = 0.05;
    this._amb.last = t;
    this._drawAmb(this._amb, dt);
    this._amb.raf = requestAnimationFrame((tt) => this._ambLoop(tt));
  }

  _drawAmb(A, dt) {
    const { ctx, w, h, motif } = A;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of A.parts) {
      p.age += dt;
      if (p.age > p.max) { Object.assign(p, this._spawnAmb(A, motif, false)); continue; }
      p.x += p.vx; p.y += p.vy;
      if (p.x < -6) p.x = w + 6; else if (p.x > w + 6) p.x = -6;
      if (p.y < -6) p.y = h + 6; else if (p.y > h + 6) p.y = -6;
      const lifeT = p.age / p.max;
      let a = Math.sin(Math.PI * lifeT);                 // 0→1→0 生命周期包络
      a *= 0.55 + 0.45 * Math.sin(p.phase + p.age * p.tw); // 轻微闪烁
      a = Math.max(0, a) * 0.15;                        // 整体极淡，不干扰正文
      const r = Math.max(1, p.size * (0.85 + 0.3 * Math.sin(p.phase + p.age * 1.3)));
      const rad = r * 3;
      const rgb = this._hexRgb(p.c);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _hexRgb(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
}
