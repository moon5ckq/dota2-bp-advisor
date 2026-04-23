"""
Pydantic 数据模型定义模块

本模块定义了 API 的请求/响应数据模型，用于 FastAPI 的自动参数校验和文档生成。
包含：
- Hero: 英雄基础信息模型
- HeroStat: 英雄段位统计模型
- SyncResponse: 数据同步接口的响应模型
"""

from pydantic import BaseModel
from typing import Optional


class Hero(BaseModel):
    """英雄基础信息模型"""
    id: int                     # 英雄唯一ID
    name: str                   # 内部名称（如 npc_dota_hero_antimage）
    localized_name: str         # 英文显示名（如 Anti-Mage）
    cn_name: str = ""           # 中文名（如 敌法师）
    primary_attr: str           # 主属性（str/agi/int/all）
    attack_type: str            # 攻击类型（Melee/Ranged）
    roles: str                  # 角色标签 JSON 字符串（如 '["Carry","Escape"]'）
    img: str                    # 英雄头像图片路径（Steam CDN 相对路径）
    icon: str                   # 英雄小图标路径


class HeroStat(BaseModel):
    """英雄段位统计数据模型"""
    hero_id: int                        # 英雄ID
    localized_name: Optional[str] = None  # 英文名（关联查询时填充）
    cn_name: Optional[str] = None         # 中文名
    img: Optional[str] = None             # 头像路径
    icon: Optional[str] = None            # 图标路径
    rank_tier: int                        # 段位等级（1-8）
    picks: int                            # 选取场次
    wins: int                             # 胜场数
    win_rate: float                       # 胜率（百分比）
    updated_at: str                       # 数据更新时间（ISO格式）


class SyncResponse(BaseModel):
    """数据同步接口响应模型"""
    status: str            # 状态标识（"ok"）
    heroes_count: int      # 同步的英雄数量
    stats_count: int       # 同步的统计记录数量
