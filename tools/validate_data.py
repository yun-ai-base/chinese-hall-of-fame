# -*- coding: utf-8 -*-
"""校验 chinese-hall-of-fame 数据完整性。用法：python tools/validate_data.py"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

errors = []
warns = []

def err(m): errors.append(m)
def warn(m): warns.append(m)

# ---- index.json ----
idx_path = os.path.join(DATA, "index.json")
if not os.path.exists(idx_path): err("缺失 data/index.json"); sys.exit(1)
idx = json.load(open(idx_path, encoding="utf-8"))
dims = idx["dimensions"]
if len(dims) != 8: err(f"维度数量应为 8，实为 {len(dims)}")

dim_ids = [d["id"] for d in dims]
for d in dims:
    for k in ("id", "name", "color", "planetRadius", "orbitRadius", "categories", "description"):
        if k not in d: err(f"维度 {d.get('id')} 缺字段 {k}")
    if not d["categories"]: warn(f"维度 {d['id']} 无分类")

# ---- 维度数组 + 名人基础信息 ----
master = {}          # figId -> dimId
master_basic = {}    # figId -> basic
dup = set()
for dim_id in dim_ids:
    arr = json.load(open(os.path.join(DATA, "dimensions", f"{dim_id}.json"), encoding="utf-8"))
    for f in arr:
        fid = f["id"]
        if fid in master: dup.add(fid)
        master[fid] = dim_id
        master_basic[fid] = f
        for k in ("id", "name", "dimension", "dimensionCategory", "tags", "summary", "era"):
            if k not in f: err(f"名人 {fid} 基础信息缺字段 {k}")
        # 跨字段一致性
        if f.get("dimension") != dim_id: err(f"名人 {fid} 的 dimension 字段({f.get('dimension')}) 与所在文件 {dim_id} 不符")
        if f.get("dimensionCategory") not in {c["name"] for c in next(d for d in dims if d['id']==dim_id)["categories"]}:
            err(f"名人 {fid} 的 dimensionCategory({f.get('dimensionCategory')}) 不在该维度分类表中")

if dup: err(f"重复的 figId：{sorted(dup)}")

# totalFigures 应与实际在册名人总数一致（动态校验，避免写死旧值）
if idx.get("totalFigures") != len(master):
    warn(f"index.totalFigures={idx.get('totalFigures')} 与在册名人总数 {len(master)} 不一致")

# ---- 详情文件 ----
detail_missing = []
relation_missing = []
for fid in master:
    fp = os.path.join(DATA, "figures", f"{fid}.json")
    if not os.path.exists(fp):
        detail_missing.append(fid); continue
    d = json.load(open(fp, encoding="utf-8"))
    if "details" not in d: err(f"名人 {fid} 详情缺 details")
    if "relations" not in d: err(f"名人 {fid} 详情缺 relations")
    else:
        if not isinstance(d["relations"], list): err(f"名人 {fid} relations 非数组")
if detail_missing: err(f"缺失详情文件：{detail_missing}")

# ---- 关系可达性 ----
assoc_manifest = json.load(open(os.path.join(DATA, "associates", "manifest.json"), encoding="utf-8"))
assoc_set = set(assoc_manifest)
assoc_files = {f[:-5] for f in os.listdir(os.path.join(DATA, "associates")) if f.endswith(".json") and f != "manifest.json"}
if assoc_set != assoc_files: warn(f"associates/manifest.json 与目录文件不一致：manifest={len(assoc_set)} files={len(assoc_files)}")

in_list = assoc = unknown = 0
unknown_samples = []
for fid in master:
    fp = os.path.join(DATA, "figures", f"{fid}.json")
    if not os.path.exists(fp): continue
    d = json.load(open(fp, encoding="utf-8"))
    for r in d.get("relations", []):
        tid = r.get("targetId")
        if not tid: err(f"名人 {fid} 有 relation 缺 targetId"); continue
        if tid in master: in_list += 1
        elif tid in assoc_set: assoc += 1
        else:
            unknown += 1
            if len(unknown_samples) < 20: unknown_samples.append(tid)
if unknown: err(f"存在无法解析的关系 targetId（既非在册亦非关联人物）：{unknown} 例 {unknown_samples}")

# ---- 跨维度映射合法性 ----
for fid, targets in idx.get("crossDimensions", {}).items():
    if fid not in master: err(f"crossDimensions 源 {fid} 不在在册名单")
    for t in targets:
        if t not in dim_ids: err(f"crossDimensions {fid} -> {t} 目标维度非法")
        elif t == master.get(fid): err(f"crossDimensions {fid} 目标 {t} 与主维度相同（无意义）")

# ---- 报告 ----
print("=" * 50)
print(f"维度数: {len(dims)}   名人总数: {len(master)}")
print(f"关系可达: 在册 {in_list} / 关联 {assoc} / 未知 {unknown}")
print(f"关联人物文件: {len(assoc_set)}")
print(f"跨维度条目: {len(idx.get('crossDimensions', {}))}")
print("=" * 50)
if warns:
    print("⚠ 警告:")
    for w in warns: print("  -", w)
if errors:
    print("✗ 错误:")
    for e in errors: print("  -", e)
    print(f"\n校验失败：{len(errors)} 个错误")
    sys.exit(1)
print("✓ 数据校验全部通过")
