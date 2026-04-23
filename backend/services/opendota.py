"""
OpenDota API 封装模块

本模块封装了对 OpenDota 公共 API 的调用，提供异步接口获取英雄列表和英雄统计数据。
这些数据用于初始化本地数据库（通过 /api/sync/heroes 端点触发）。

OpenDota API 文档: https://docs.opendota.com/
"""

import httpx
from typing import Any

# OpenDota API 基础地址
BASE_URL = "https://api.opendota.com/api"


async def fetch_heroes() -> list[dict[str, Any]]:
    """
    获取所有 Dota2 英雄的基础信息
    
    返回包含英雄ID、名称、属性、攻击类型、角色标签、图片路径等字段的列表。
    对应 OpenDota API: GET /heroes
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{BASE_URL}/heroes")
        resp.raise_for_status()
        return resp.json()


async def fetch_hero_stats() -> list[dict[str, Any]]:
    """
    获取所有英雄的各段位统计数据
    
    返回包含各段位选取数（{rank}_pick）和胜场数（{rank}_win）的列表，
    同时包含英雄的 img 和 icon 路径。
    对应 OpenDota API: GET /heroStats
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{BASE_URL}/heroStats")
        resp.raise_for_status()
        return resp.json()
