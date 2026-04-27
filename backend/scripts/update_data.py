#!/usr/bin/env python3
"""
Dota2 BP Advisor 数据更新脚本

后台更新机制：
1. 新数据写入临时文件（.tmp）
2. 更新完成后原子性替换（rename）
3. 通知后端重载内存数据

用法：
  python3 update_data.py --all          # 更新所有数据
  python3 update_data.py --synergy      # 只更新配合数据
  python3 update_data.py --lane-roles   # 只更新分路数据
  python3 update_data.py --heroes       # 只更新英雄基础数据
"""

import argparse
import asyncio
import json
import os
import sqlite3
import sys
import time
import urllib.parse
from pathlib import Path

import httpx

# 项目路径
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "dota2.db"

OPENDOTA_API = "https://api.opendota.com/api"
EXPLORER_URL = f"{OPENDOTA_API}/explorer"


def log(msg: str):
    """带时间戳的日志输出"""
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}")


def atomic_write_json(filepath: Path, data: dict | list):
    """原子性写入JSON文件：先写临时文件，再rename替换"""
    tmp_path = filepath.with_suffix(".json.updating")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(str(tmp_path), str(filepath))
    log(f"  ✅ 已更新 {filepath.name} ({tmp_path.stat().st_size if tmp_path.exists() else filepath.stat().st_size} bytes)")


# ── 英雄基础数据更新 ──
async def update_heroes():
    """从 OpenDota 同步英雄列表到数据库，复用 database 模块的 schema 和写入逻辑"""
    log("📦 更新英雄基础数据...")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{OPENDOTA_API}/heroes")
        resp.raise_for_status()
        heroes = resp.json()

    # 复用 database 模块：确保表结构最新 + 统一写入逻辑
    sys.path.insert(0, str(BASE_DIR))
    from services.database import init_db, upsert_heroes
    init_db()  # 自动建表 + 迁移缺失列
    updated = upsert_heroes(heroes)  # 统一写入（含 img 生成、cn_name 查找）
    log(f"  ✅ 已更新 {updated} 个英雄到数据库")


# ── 分路数据更新 ──
async def update_lane_roles():
    """从 OpenDota explorer 获取英雄分路百分比数据"""
    log("🛣️  更新英雄分路数据...")
    sql = "SELECT hero_id, lane_role, count(*) as cnt FROM player_matches WHERE lane_role IS NOT NULL AND lane_role > 0 GROUP BY hero_id, lane_role ORDER BY hero_id"
    url = f"{EXPLORER_URL}?sql={urllib.parse.quote(sql)}"

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    rows = data.get("rows", [])
    if not rows:
        log("  ⚠️ 未获取到分路数据")
        return

    # 按英雄聚合
    from collections import defaultdict
    hero_lanes = defaultdict(lambda: {"safe": 0, "mid": 0, "off": 0})
    hero_totals = defaultdict(int)

    for r in rows:
        hid = str(r["hero_id"])
        lr = r["lane_role"]
        cnt = r["cnt"]
        hero_totals[hid] += cnt
        if lr == 1:
            hero_lanes[hid]["safe"] += cnt
        elif lr == 2:
            hero_lanes[hid]["mid"] += cnt
        elif lr == 3:
            hero_lanes[hid]["off"] += cnt

    # 转为百分比
    result = {}
    for hid in hero_lanes:
        total = hero_totals[hid]
        if total > 0:
            result[hid] = {
                "safe": round(hero_lanes[hid]["safe"] / total * 100),
                "mid": round(hero_lanes[hid]["mid"] / total * 100),
                "off": round(hero_lanes[hid]["off"] / total * 100),
            }

    atomic_write_json(DATA_DIR / "hero_lane_roles.json", result)
    log(f"  ✅ 已更新 {len(result)} 个英雄的分路数据")


# ── 配合数据更新 ──
async def update_synergy():
    """从 OpenDota explorer 获取英雄两两配合胜率"""
    log("🤝 更新英雄配合数据（这需要较长时间）...")

    # 获取英雄列表
    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    c.execute("SELECT id FROM heroes ORDER BY id")
    hero_ids = [r[0] for r in c.fetchall()]
    conn.close()

    synergy = {}  # {hero_id_str: {partner_id_str: {games, wins, win_rate}}}
    errors = []
    total = len(hero_ids)

    for idx, hid in enumerate(hero_ids):
        if idx > 0 and idx % 10 == 0:
            log(f"  进度: {idx}/{total} ({idx/total*100:.0f}%)")

        sql = f"""
        SELECT pm2.hero_id as partner_id, count(*) as games,
            sum(case when (pm1.player_slot < 128 and matches.radiant_win)
                or (pm1.player_slot >= 128 and not matches.radiant_win)
                then 1 else 0 end) as wins
        FROM player_matches pm1
        JOIN player_matches pm2 ON pm1.match_id = pm2.match_id
            AND pm1.hero_id != pm2.hero_id
            AND ((pm1.player_slot < 128 AND pm2.player_slot < 128)
                OR (pm1.player_slot >= 128 AND pm2.player_slot >= 128))
        JOIN matches ON pm1.match_id = matches.match_id
        WHERE pm1.hero_id = {hid}
        GROUP BY pm2.hero_id
        """
        url = f"{EXPLORER_URL}?sql={urllib.parse.quote(sql)}"

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.get(url)
                    if resp.status_code == 429:
                        wait = 60
                        log(f"  ⏳ 限速，等待{wait}秒...")
                        await asyncio.sleep(wait)
                        continue
                    resp.raise_for_status()
                    data = resp.json()

                hid_str = str(hid)
                synergy[hid_str] = {}
                for r in data.get("rows", []):
                    pid = str(r["partner_id"])
                    games = r["games"]
                    wins = r["wins"]
                    if games >= 10:  # 过滤样本太小的
                        synergy[hid_str][pid] = {
                            "games": games,
                            "wins": wins,
                            "win_rate": round(wins / games * 100, 1),
                        }
                break
            except Exception as e:
                if attempt == 2:
                    errors.append((hid, str(e)))
                    log(f"  ❌ 英雄 {hid} 失败: {e}")
                else:
                    await asyncio.sleep(5)

        await asyncio.sleep(3)  # 速率控制

    result = {
        "meta": {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
            "hero_count": len(synergy),
            "errors": len(errors),
        },
        "data": synergy,
    }
    atomic_write_json(DATA_DIR / "hero_synergy.json", result)

    total_pairs = sum(len(v) for v in synergy.values())
    log(f"  ✅ 完成: {len(synergy)} 英雄, {total_pairs} 对配合数据, {len(errors)} 个错误")


# ── 通知后端重载 ──
async def notify_reload():
    """通知后端重载内存中的静态数据"""
    log("🔄 通知后端重载数据...")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post("http://127.0.0.1:8082/api/reload-data")
            if resp.status_code == 200:
                log("  ✅ 后端已重载")
            else:
                log(f"  ⚠️ 后端响应: {resp.status_code}")
    except Exception:
        log("  ⚠️ 后端未运行或无法连接，数据将在下次启动时加载")


# ── 主入口 ──
async def main():
    parser = argparse.ArgumentParser(description="Dota2 BP Advisor 数据更新")
    parser.add_argument("--all", action="store_true", help="更新所有数据")
    parser.add_argument("--heroes", action="store_true", help="更新英雄基础数据")
    parser.add_argument("--lane-roles", action="store_true", help="更新分路数据")
    parser.add_argument("--synergy", action="store_true", help="更新配合数据")
    args = parser.parse_args()

    if not any([args.all, args.heroes, args.lane_roles, args.synergy]):
        parser.print_help()
        return

    log("=" * 50)
    log("Dota2 BP Advisor 数据更新开始")
    log("=" * 50)

    t0 = time.time()

    if args.all or args.heroes:
        await update_heroes()
    if args.all or args.lane_roles:
        await update_lane_roles()
    if args.all or args.synergy:
        await update_synergy()

    await notify_reload()

    elapsed = time.time() - t0
    log(f"\n🎉 全部完成，耗时 {elapsed:.1f} 秒")


if __name__ == "__main__":
    asyncio.run(main())
