// DataManager —— 启动期一次性构建全量索引，并对外提供数据访问与关系解析。
// 两级加载策略：
//   维度级：index.json + 8 个维度数组（含 356 名人基础信息）在启动时全部载入内存。
//   人物级：名人的完整详情（details / relations）按需懒加载并缓存。

// 朝代 -> 代表年份（用于卫星按年代排序；无确切生卒年时回退）
const DYNASTY_YEARS = {
  '远古': -2000, '上古': -2000,
  '夏': -2070, '商': -1600, '周': -1046, '西周': -1046, '东周': -770,
  '春秋': -770, '战国': -475,
  '秦': -221, '秦代': -221,
  '汉': -202, '西汉': -202, '东汉': 25, '楚汉': -206,
  '三国': 220, '魏晋': 220, '魏晋南北朝': 220, '南北朝': 420,
  '隋': 581, '隋代': 581,
  '唐': 618, '唐代': 618,
  '宋': 960, '宋代': 960, '北宋': 960, '南宋': 1127,
  '辽': 916, '金': 1115, '西夏': 1038,
  '元': 1271, '元代': 1271, '蒙元': 1271,
  '明': 1368, '明代': 1368, '明朝': 1368,
  '清': 1644, '清代': 1644, '清朝': 1644,
  '近代': 1840, '清末': 1840, '民国': 1912, '现代': 1950,
};

function lookupDynastyYear(str) {
  if (!str) return 0;
  for (const key of Object.keys(DYNASTY_YEARS)) {
    if (str.includes(key)) return DYNASTY_YEARS[key];
  }
  return 0;
}

export class DataManager {
  constructor() {
    this.index = null;
    this.dims = new Map();          // dimId -> meta (含 categories)
    this.figures = new Map();       // figId -> { basic, dimId, category, color, sortYear }
    this.dimFigureLists = new Map();// dimId -> [{ id, basic, category, color, sortYear }]
    this.cross = new Map();         // figId -> [dimId]
    this.associateIds = new Set();
    this.searchIndex = [];
    this.isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
    this._detailCache = new Map();
    this._assocCache = new Map();
  }

  async init() {
    const [index, assocManifest] = await Promise.all([
      fetch('./data/index.json').then(r => r.json()),
      fetch('./data/associates/manifest.json').then(r => r.json()).catch(() => []),
    ]);
    this.index = index;
    (assocManifest || []).forEach(id => this.associateIds.add(id));

    for (const d of index.dimensions) {
      this.dims.set(d.id, d);
    }
    for (const [fid, dims] of Object.entries(index.crossDimensions || {})) {
      this.cross.set(fid, dims);
    }

    // 并行加载 8 个维度数组
    const dimIds = index.dimensions.map(d => d.id);
    const arrays = await Promise.all(
      dimIds.map(id => fetch(`./data/dimensions/${id}.json`).then(r => r.json()))
    );

    arrays.forEach((arr, i) => {
      const dimId = dimIds[i];
      const meta = this.dims.get(dimId);
      const list = [];
      for (const basic of arr) {
        const sortYear = this._sortYear(basic);
        const entry = { id: basic.id, basic, dimId, category: basic.dimensionCategory, color: meta.color, sortYear };
        this.figures.set(basic.id, entry);
        list.push(entry);
        this.searchIndex.push({
          id: basic.id,
          name: basic.name,
          pinyin: (basic.pinyin || '').toLowerCase(),
          dynasty: basic.dynasty || '',
          tags: basic.tags || [],
          dimId,
          dimName: meta.name,
          color: meta.color,
        });
      }
      this.dimFigureLists.set(dimId, list);
    });

    return this;
  }

  _sortYear(basic) {
    const e = basic.era || {};
    if (typeof e.start === 'number') return e.start;
    const y = lookupDynastyYear(basic.dynasty) || lookupDynastyYear(basic.eraLabel) || 0;
    return y;
  }

  // ---- 查询接口 ----
  getDim(dimId) { return this.dims.get(dimId); }
  getDimFigures(dimId) { return this.dimFigureLists.get(dimId) || []; }
  getFigureBasic(id) { return this.figures.get(id); }
  getCrossDims(id) { return this.cross.get(id) || []; }

  async getFigureDetail(id) {
    if (this._detailCache.has(id)) return this._detailCache.get(id);
    const resp = await fetch(`./data/figures/${id}.json`);
    if (!resp.ok) throw new Error(`名人详情缺失: ${id}`);
    const data = await resp.json();
    this._detailCache.set(id, data);
    return data;
  }

  async getAssociate(id) {
    if (this._assocCache.has(id)) return this._assocCache.get(id);
    const resp = await fetch(`./data/associates/${id}.json`);
    if (!resp.ok) throw new Error(`关联人物缺失: ${id}`);
    const data = await resp.json();
    this._assocCache.set(id, data);
    return data;
  }

  // 解析某名人的全部关联人物（自动区分在册 / 边缘 / 未知）
  async resolveRelations(figureId) {
    const detail = await this.getFigureDetail(figureId);
    const rels = detail.relations || [];
    const out = [];
    for (const r of rels) {
      const tid = r.targetId;
      if (this.figures.has(tid)) {
        const fb = this.figures.get(tid);
        out.push({
          kind: 'figure', id: tid, name: fb.basic.name,
          dimId: fb.dimId, color: fb.color,
          relation: r.relation, desc: r.description,
        });
      } else if (this.associateIds.has(tid)) {
        try {
          const a = await this.getAssociate(tid);
          out.push({
            kind: 'associate', id: tid, name: a.name,
            relation: r.relation, desc: r.description,
            summary: a.summary, baiduBaike: a.baiduBaike,
            color: '#9aa0a6',
          });
        } catch {
          out.push({ kind: 'unknown', id: tid, name: tid, relation: r.relation, color: '#6b7280' });
        }
      } else {
        out.push({ kind: 'unknown', id: tid, name: tid, relation: r.relation, color: '#6b7280' });
      }
    }
    return out;
  }

  // 搜索：人名 / 拼音 / 朝代 / 标签
  search(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    const results = [];
    for (const s of this.searchIndex) {
      let score = 0;
      if (s.name.includes(query.trim())) score = 100;
      else if (s.pinyin.includes(q)) score = 80;
      else if (s.dynasty.toLowerCase().includes(q)) score = 60;
      else if (s.tags.some(t => t.toLowerCase().includes(q))) score = 50;
      if (score > 0) results.push({ ...s, score });
    }
    results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh'));
    return results.slice(0, 12);
  }

  get randomFigureId() {
    const all = [...this.figures.keys()];
    return all[Math.floor(Math.random() * all.length)];
  }
}
