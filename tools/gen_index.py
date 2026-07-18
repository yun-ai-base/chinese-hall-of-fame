# -*- coding: utf-8 -*-
"""
生成 data/index.json —— 维度索引 + 分类结构 + 跨维度映射。

数据来源：
  1. 各 data/dimensions/<id>.json 的 dimensionCategory 字段（派生分类与计数）
  2. 设计文档 2.9 的跨维度归属表（硬编码，运行时校验 figId / dimId 合法性）
  3. 设计文档 2.1~2.8 的维度元数据（颜色 / 行星半径 / 描述）

产出 data/index.json 供前端 DataManager 在启动期一次性加载。
"""
import json
import os

DIMS_DIR = "data/dimensions"
OUT = "data/index.json"

# ---- 维度元数据（来自设计文档 2.1~2.8）----
META = {
    "mythology": dict(
        name="神话传说", nameEn="Mythology", planetIndex=1, color="#2ECC71", planetRadius=3.2,
        description="创世始祖、上古神祇与神魔小说人物，构成华夏文明的原初想象。",
    ),
    "philosophy": dict(
        name="哲学思想·儒释道", nameEn="Philosophy", planetIndex=2, color="#9B59B6", planetRadius=3.5,
        description="儒释道与诸子百家，奠定中国精神世界的底层逻辑。",
    ),
    "literature": dict(
        name="诗词文学", nameEn="Literature", planetIndex=3, color="#3498DB", planetRadius=3.5,
        description="从楚辞汉赋到唐诗宋词明清小说，五千年文脉的华彩。",
    ),
    "military": dict(
        name="兵法武备", nameEn="Military", planetIndex=4, color="#E74C3C", planetRadius=3.0,
        description="兵家圣贤与历代名将，金戈铁马里写就的攻守之道。",
    ),
    "technology": dict(
        name="科技工程", nameEn="Technology", planetIndex=5, color="#BDC3C7", planetRadius=3.2,
        description="四大发明与天文历算、医学农学，文明存续的硬核支撑。",
    ),
    "art": dict(
        name="书画艺术", nameEn="Art", planetIndex=6, color="#E67E22", planetRadius=3.3,
        description="笔墨丹青与篆刻雕塑，以线条与色彩承载东方审美。",
    ),
    "politics": dict(
        name="政治治世", nameEn="Politics", planetIndex=7, color="#F1C40F", planetRadius=3.3,
        description="帝王将相与治世名臣，王朝兴衰中的制度与人事。",
    ),
    "exploration": dict(
        name="探索交流", nameEn="Exploration", planetIndex=8, color="#1ABC9C", planetRadius=2.8,
        description="凿空西域、远洋航海与入华先客，文明向外张望的目光。",
    ),
}

# ---- 跨维度映射（设计文档 2.9）----
CROSS = {
    "cao_cao": ["politics"],
    "su_shi": ["art", "politics"],
    "zhuge_liang": ["politics"],
    "han_yu": ["philosophy"],
    "xu_guangqi": ["philosophy"],
    "liang_qichao": ["philosophy"],
    "tao_hongjing": ["philosophy"],
    "zhu_zaiyu": ["art"],
    # 注：徐霞客未纳入在册名单，利玛窦/汤若望主维度为探索交流
    "li_madou": ["technology"],
    "tang_ruowang": ["technology"],
}

# 维护一个 master figId -> dimId 映射，用于校验跨维度
master = {}
for dim_id in META:
    arr = json.load(open(os.path.join(DIMS_DIR, f"{dim_id}.json"), encoding="utf-8"))
    for f in arr:
        master[f["id"]] = dim_id

dimensions = []
cross_index = {}  # figId -> [dimId]，仅保留合法条目
for dim_id, meta in META.items():
    arr = json.load(open(os.path.join(DIMS_DIR, f"{dim_id}.json"), encoding="utf-8"))
    # 按首次出现顺序收集分类并计数
    cats = []
    cat_counts = {}
    for f in arr:
        c = f.get("dimensionCategory", "未分类")
        if c not in cat_counts:
            cat_counts[c] = 0
        cat_counts[c] += 1
    cats = [
        {"name": c, "count": cat_counts[c], "order": i, "start": None, "end": None}
        for i, c in enumerate(cat_counts)
    ]
    orbit_radius = 14 + (meta["planetIndex"] - 1) * 3
    dimensions.append({
        "id": dim_id,
        "name": meta["name"],
        "nameEn": meta["nameEn"],
        "planetIndex": meta["planetIndex"],
        "color": meta["color"],
        "planetRadius": meta["planetRadius"],
        "orbitRadius": orbit_radius,
        "description": meta["description"],
        "categories": cats,
    })

# 校验跨维度
for fig_id, dims in CROSS.items():
    if fig_id not in master:
        print(f"[跳过] 跨维度源 figId 不在在册名单: {fig_id}")
        continue
    valid = [d for d in dims if d in META and d != master[fig_id]]
    if valid:
        cross_index[fig_id] = valid
    else:
        print(f"[跳过] 跨维度 {fig_id} 目标均无效: {dims}")

index = {
    "version": "1.0",
    "name": "中华文明",
    "nameEn": "Celestial Mandate",
    "totalFigures": len(master),
    "dimensions": dimensions,
    "crossDimensions": cross_index,
}

with open(OUT, "w", encoding="utf-8") as fp:
    json.dump(index, fp, ensure_ascii=False, indent=2)

# ---- 关联人物清单（供前端判断是否在册，避免逐个 404）----
assoc_ids = sorted(
    f[:-5] for f in os.listdir("data/associates") if f.endswith(".json")
)
with open("data/associates/manifest.json", "w", encoding="utf-8") as fp:
    json.dump(assoc_ids, fp, ensure_ascii=False)

print(f"已生成 {OUT}")
print(f"  维度数: {len(dimensions)}  名人总数: {len(master)}  跨维度条目: {len(cross_index)}")
for d in dimensions:
    print(f"  {d['id']:<12} {d['name']:<14} 分类数={len(d['categories']):<2} 人数={sum(c['count'] for c in d['categories'])}")
