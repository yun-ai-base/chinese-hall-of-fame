export class DataLoader {
  static #cache = new Map();

  static async loadIndex() {
    return this.#load('index', './data/index.json');
  }

  static async loadDimension(dimId) {
    return this.#load(`dim:${dimId}`, `./data/dimensions/${dimId}.json`);
  }

  static async loadFigure(figureId) {
    return this.#load(`fig:${figureId}`, `./data/figures/${figureId}.json`);
  }

  static async #load(cacheKey, path) {
    if (this.#cache.has(cacheKey)) {
      return this.#cache.get(cacheKey);
    }

    const resp = await fetch(path);
    if (!resp.ok) {
      throw new Error(`加载失败 ${path}: ${resp.status}`);
    }
    const data = await resp.json();
    this.#cache.set(cacheKey, data);
    return data;
  }

  static clearCache() {
    this.#cache.clear();
  }
}
