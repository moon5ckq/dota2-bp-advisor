"""
SQLite 数据库操作模块

本模块封装了所有与 SQLite 数据库的交互操作，负责：
1. 数据库初始化（创建 heroes 和 hero_stats 表）+ 自动迁移
2. 英雄数据的增删改查（upsert_heroes, get_all_heroes）
3. 英雄统计数据的写入和查询（upsert_hero_stats, get_hero_stats）

数据库文件位于 backend/data/dota2.db
"""

import sqlite3
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from services.hero_names_cn import get_cn_name

logger = logging.getLogger(__name__)

# 数据库文件路径
DB_PATH = Path(__file__).parent.parent / "data" / "dota2.db"

# heroes 表的完整 schema 定义（单一来源）
# 格式: (列名, 类型+约束, 默认值)
HEROES_COLUMNS = [
    ("id", "INTEGER PRIMARY KEY", None),
    ("name", "TEXT NOT NULL", None),
    ("localized_name", "TEXT NOT NULL", None),
    ("cn_name", "TEXT NOT NULL DEFAULT ''", "''"),
    ("primary_attr", "TEXT NOT NULL", None),
    ("attack_type", "TEXT NOT NULL", None),
    ("roles", "TEXT NOT NULL", None),
    ("img", "TEXT NOT NULL DEFAULT ''", "''"),
    ("icon", "TEXT NOT NULL DEFAULT ''", "''"),
    ("legs", "INTEGER DEFAULT 0", "0"),
]


def get_conn() -> sqlite3.Connection:
    """
    获取数据库连接
    
    自动创建数据目录（如不存在），并设置 Row 工厂使查询结果可按列名访问
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _migrate_heroes_table(conn: sqlite3.Connection) -> None:
    """
    自动迁移 heroes 表：检查并补齐缺失的列
    
    对比 HEROES_COLUMNS 定义与实际表结构，自动 ALTER TABLE ADD COLUMN。
    这样无论代码怎么演进，旧数据库都能自动升级。
    """
    cursor = conn.execute("PRAGMA table_info(heroes)")
    existing_cols = {row[1] for row in cursor.fetchall()}
    
    for col_name, col_def, default_val in HEROES_COLUMNS:
        if col_name not in existing_cols:
            # 构建 ALTER TABLE 语句
            alter_sql = f"ALTER TABLE heroes ADD COLUMN {col_name} {col_def}"
            try:
                conn.execute(alter_sql)
                logger.info(f"数据库迁移: 添加列 heroes.{col_name}")
            except sqlite3.OperationalError as e:
                logger.warning(f"数据库迁移: 添加列 heroes.{col_name} 失败: {e}")


def init_db() -> None:
    """
    初始化数据库表结构 + 自动迁移
    
    创建两张核心表：
    - heroes: 英雄基础信息（ID、名称、属性、角色、图片等）
    - hero_stats: 英雄各段位统计数据（选取数、胜场数、胜率）
    
    表已存在时自动检查并补齐缺失列（migration）
    """
    conn = get_conn()
    
    # 构建 CREATE TABLE 语句
    col_defs = ", ".join(f"{name} {typedef}" for name, typedef, _ in HEROES_COLUMNS)
    conn.execute(f"CREATE TABLE IF NOT EXISTS heroes ({col_defs})")
    
    # 自动迁移：补齐缺失列
    _migrate_heroes_table(conn)
    
    # 英雄段位统计表
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
    logger.info("数据库初始化完成")


def upsert_heroes(heroes: list[dict[str, Any]]) -> int:
    """
    批量写入或更新英雄数据
    
    使用 INSERT OR REPLACE 实现 upsert 语义。
    自动根据英文名查找对应的中文名。
    自动根据 hero name 生成 Steam CDN 图片路径。
    """
    conn = get_conn()
    count = 0
    for h in heroes:
        roles = json.dumps(h.get("roles", []))
        cn_name = get_cn_name(h["localized_name"])
        # 图片路径：优先用 API 返回的，否则从 hero name 生成
        img = h.get("img") or f'/apps/dota2/images/dota_react/heroes/{h["name"].replace("npc_dota_hero_", "")}.png'
        icon = h.get("icon") or ""
        conn.execute(
            """INSERT OR REPLACE INTO heroes (id, name, localized_name, cn_name, primary_attr, attack_type, roles, img, icon, legs)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (h["id"], h["name"], h["localized_name"], cn_name, h["primary_attr"],
             h["attack_type"], roles, img, icon, h.get("legs", 0)),
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
    """
    conn = get_conn()
    now = datetime.now(timezone.utc).isoformat()
    count = 0
    for s in stats:
        hero_id = s["id"]
        # 图片路径：优先用 API 返回的，否则从 hero name 生成
        img = s.get("img") or ""
        icon = s.get("icon") or ""
        name = s.get("name", "")
        if not img and name:
            img = f'/apps/dota2/images/dota_react/heroes/{name.replace("npc_dota_hero_", "")}.png'
        if img or icon:
            conn.execute(
                "UPDATE heroes SET img = ?, icon = ? WHERE id = ?",
                (img, icon, hero_id),
            )
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
