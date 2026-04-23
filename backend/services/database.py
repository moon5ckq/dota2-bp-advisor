"""
SQLite 数据库操作模块

本模块封装了所有与 SQLite 数据库的交互操作，负责：
1. 数据库初始化（创建 heroes 和 hero_stats 表）
2. 英雄数据的增删改查（upsert_heroes, get_all_heroes）
3. 英雄统计数据的写入和查询（upsert_hero_stats, get_hero_stats）

数据库文件位于 backend/data/dota2.db
"""

import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from services.hero_names_cn import get_cn_name

# 数据库文件路径
DB_PATH = Path(__file__).parent.parent / "data" / "dota2.db"


def get_conn() -> sqlite3.Connection:
    """
    获取数据库连接
    
    自动创建数据目录（如不存在），并设置 Row 工厂使查询结果可按列名访问
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row  # 使查询结果支持 dict(row) 转换
    return conn


def init_db() -> None:
    """
    初始化数据库表结构
    
    创建两张核心表：
    - heroes: 英雄基础信息（ID、名称、属性、角色、图片等）
    - hero_stats: 英雄各段位统计数据（选取数、胜场数、胜率）
    
    包含 cn_name 列的迁移逻辑（兼容旧版本数据库）
    """
    conn = get_conn()
    # 英雄基础信息表
    conn.execute("""
        CREATE TABLE IF NOT EXISTS heroes (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            localized_name TEXT NOT NULL,
            cn_name TEXT NOT NULL DEFAULT '',
            primary_attr TEXT NOT NULL,
            attack_type TEXT NOT NULL,
            roles TEXT NOT NULL,
            img TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT ''
        )
    """)
    # 迁移：为旧表添加 cn_name 列（如已存在则忽略错误）
    try:
        conn.execute("ALTER TABLE heroes ADD COLUMN cn_name TEXT NOT NULL DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    # 英雄段位统计表（复合主键：hero_id + rank_tier）
    conn.execute("""
        CREATE TABLE IF NOT EXISTS hero_stats (
            hero_id INTEGER NOT NULL,
            rank_tier INTEGER NOT NULL,
            picks INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            win_rate REAL NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (hero_id, rank_tier)
        )
    """)
    conn.commit()
    conn.close()


def upsert_heroes(heroes: list[dict[str, Any]]) -> int:
    """
    批量写入或更新英雄数据
    
    使用 INSERT OR REPLACE 实现 upsert 语义（存在则更新，不存在则插入）。
    自动根据英文名查找对应的中文名。
    
    参数:
        heroes: OpenDota API 返回的英雄数据列表
    
    返回:
        int: 写入的英雄数量
    """
    conn = get_conn()
    count = 0
    for h in heroes:
        roles = json.dumps(h.get("roles", []))
        cn_name = get_cn_name(h["localized_name"])  # 查找中文名
        conn.execute(
            """INSERT OR REPLACE INTO heroes (id, name, localized_name, cn_name, primary_attr, attack_type, roles, img, icon)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (h["id"], h["name"], h["localized_name"], cn_name, h["primary_attr"],
             h["attack_type"], roles, h.get("img", ""), h.get("icon", "")),
        )
        count += 1
    conn.commit()
    conn.close()
    return count


def upsert_hero_stats(stats: list[dict[str, Any]]) -> int:
    """
    写入英雄统计数据，同时更新英雄表的图片信息
    
    OpenDota heroStats 接口返回的数据包含各段位的选取数和胜场数，
    格式为 {rank}_pick 和 {rank}_win（rank 为 1-8）。
    
    同时利用该接口返回的 img/icon 字段更新 heroes 表的图片路径。
    
    参数:
        stats: OpenDota heroStats API 返回的统计数据列表
    
    返回:
        int: 写入的统计记录数
    """
    conn = get_conn()
    now = datetime.now(timezone.utc).isoformat()
    count = 0
    for s in stats:
        hero_id = s["id"]
        # 顺便更新英雄表的图片路径（heroStats 接口包含 img/icon 字段）
        img = s.get("img", "")
        icon = s.get("icon", "")
        if img or icon:
            conn.execute(
                "UPDATE heroes SET img = ?, icon = ? WHERE id = ?",
                (img, icon, hero_id),
            )
        # 遍历8个段位，分别写入统计数据
        for rank in range(1, 9):
            pick_key = f"{rank}_pick"
            win_key = f"{rank}_win"
            picks = s.get(pick_key, 0) or 0
            wins = s.get(win_key, 0) or 0
            win_rate = round(wins / picks * 100, 2) if picks > 0 else 0.0
            conn.execute(
                """INSERT OR REPLACE INTO hero_stats (hero_id, rank_tier, picks, wins, win_rate, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (hero_id, rank, picks, wins, win_rate, now),
            )
            count += 1
    conn.commit()
    conn.close()
    return count


def get_all_heroes() -> list[dict[str, Any]]:
    """获取所有英雄列表，按英文名排序"""
    conn = get_conn()
    rows = conn.execute("SELECT * FROM heroes ORDER BY localized_name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_hero_stats(rank: Optional[int] = None) -> list[dict[str, Any]]:
    """
    获取英雄统计数据，关联英雄表获取中文名和图片
    
    参数:
        rank: 段位等级（1-8），不传则返回所有段位的统计
    
    返回:
        list[dict]: 按胜率降序排列的统计记录
    """
    conn = get_conn()
    if rank:
        rows = conn.execute(
            """SELECT hs.*, h.localized_name, h.cn_name, h.img, h.icon
               FROM hero_stats hs JOIN heroes h ON hs.hero_id = h.id
               WHERE hs.rank_tier = ? ORDER BY hs.win_rate DESC""",
            (rank,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT hs.*, h.localized_name, h.cn_name, h.img, h.icon
               FROM hero_stats hs JOIN heroes h ON hs.hero_id = h.id
               ORDER BY hs.win_rate DESC""",
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
