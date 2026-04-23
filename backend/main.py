"""
FastAPI 主入口模块

本模块是 Dota2 BP Advisor 后端的核心入口文件，负责：
1. 创建 FastAPI 应用实例并配置 CORS 中间件
2. 定义所有 API 端点（英雄列表、英雄统计、别名、玩家信息、英雄池、推荐、数据同步等）
3. 提供缓存中间件，优化静态资源和 API 响应的缓存策略
4. 挂载前端构建产物（SPA 单页应用），实现前后端一体部署
"""

import httpx
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from pydantic import BaseModel
import json
from pathlib import Path

from models import Hero, HeroStat, SyncResponse
from services import opendota, database
from services.recommend import recommend as run_recommend

# 创建 FastAPI 应用实例
app = FastAPI(title="Dota2 BP Advisor API")

# 配置 CORS 中间件，允许所有来源跨域访问（开发/移动端友好）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    """应用启动时初始化数据库并启动后台定时更新"""
    database.init_db()
    # 启动后台定时数据更新
    import asyncio
    loop = asyncio.get_event_loop()
    loop.create_task(_background_scheduler())


# ── 英雄基础数据 API ──

@app.get("/api/heroes", response_model=list[Hero])
def get_heroes():
    """获取所有英雄列表，包含英雄ID、名称、属性、角色等基础信息"""
    return database.get_all_heroes()


@app.get("/api/heroes/stats", response_model=list[HeroStat])
def get_hero_stats(rank: Optional[int] = Query(None, ge=1, le=8)):
    """
    获取英雄统计数据（胜率、场次等）
    
    参数:
        rank: 段位等级（1-8），不传则返回所有段位的统计
    """
    return database.get_hero_stats(rank)


@app.get("/api/heroes/aliases")
def get_hero_aliases():
    """
    返回所有英雄及其别名数据，用于前端搜索功能
    
    合并 hero_aliases.json 中的别名数据与数据库中的英雄信息，
    返回包含英雄ID、中英文名、属性、头像和别名列表的完整数据
    """
    # 读取英雄别名配置文件
    aliases_path = Path(__file__).parent / "data" / "hero_aliases.json"
    with open(aliases_path, "r", encoding="utf-8") as f:
        aliases_data = json.load(f)

    # 从数据库获取英雄信息，构建 {hero_id: hero_dict} 的映射
    heroes = database.get_all_heroes()
    hero_map = {h["id"]: h for h in heroes}

    # 将别名数据与英雄信息合并
    result = []
    for item in aliases_data:
        hero_id = item["hero_id"]
        hero = hero_map.get(hero_id, {})
        result.append({
            "hero_id": hero_id,
            "name_en": item["name_en"],
            "name_cn": item["name_cn"],
            "primary_attr": hero.get("primary_attr", "all"),
            "img": hero.get("img", ""),
            "aliases": item.get("aliases", []),
        })
    return result


# ── 玩家信息 API ──

@app.get("/api/player/{account_id}/profile")
async def get_player_profile(account_id: int):
    """
    获取玩家基本信息（昵称、头像、段位）
    
    通过 OpenDota API 实时查询玩家的 Steam 个人资料
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"https://api.opendota.com/api/players/{account_id}")
        resp.raise_for_status()
        data = resp.json()
    profile = data.get("profile", {})
    return {
        "account_id": account_id,
        "personaname": profile.get("personaname", "Unknown"),
        "avatar": profile.get("avatar", ""),
        "rank_tier": data.get("rank_tier"),
    }


@app.get("/api/player/{account_id}/hero-pool")
async def get_player_hero_pool(account_id: int):
    """
    获取玩家最近200场比赛的英雄池分析
    
    统计每个英雄的使用次数和胜率，返回 TOP10 常用英雄。
    通过 player_slot 判断阵营（<128 为天辉），再结合 radiant_win 判断胜负。
    """
    from services.hero_names_cn import HERO_NAMES_CN

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"https://api.opendota.com/api/players/{account_id}/matches",
            params={"limit": 200},
        )
        resp.raise_for_status()
        matches = resp.json()

    # 若无数据，提示用户开启公开比赛数据
    if not matches:
        return {"error": "no_data", "message": "该账号未公开比赛数据，请在 Dota2 设置中开启「公开比赛数据」"}

    # 按英雄ID统计场次和胜场
    hero_stats: dict[int, dict] = {}
    for m in matches:
        hid = m.get("hero_id", 0)
        if hid == 0:
            continue
        if hid not in hero_stats:
            hero_stats[hid] = {"games": 0, "wins": 0}
        hero_stats[hid]["games"] += 1
        # 判断胜负：player_slot < 128 为天辉方
        is_radiant = m["player_slot"] < 128
        won = (is_radiant and m["radiant_win"]) or (not is_radiant and not m["radiant_win"])
        if won:
            hero_stats[hid]["wins"] += 1

    # 按使用场次降序排列，取 TOP10
    sorted_heroes = sorted(hero_stats.items(), key=lambda x: x[1]["games"], reverse=True)[:10]

    # 从数据库获取英雄信息，用于填充中文名和头像
    all_heroes = database.get_all_heroes()
    hero_map = {h["id"]: h for h in all_heroes}

    result = []
    for hid, stats in sorted_heroes:
        hero = hero_map.get(hid, {})
        localized_name = hero.get("localized_name", "")
        name_cn = HERO_NAMES_CN.get(localized_name, localized_name)
        result.append({
            "hero_id": hid,
            "name_cn": name_cn,
            "img": hero.get("img", ""),
            "games": stats["games"],
            "wins": stats["wins"],
            "win_rate": round(stats["wins"] / stats["games"] * 100, 1) if stats["games"] > 0 else 0,
        })

    return {"total_matches": len(matches), "heroes": result}


# ── 数据同步 API ──

@app.post("/api/sync/heroes", response_model=SyncResponse)
async def sync_heroes():
    """
    从 OpenDota API 同步英雄列表和统计数据到本地数据库
    
    先拉取英雄基础数据，再拉取各段位统计数据，最后写入 SQLite
    """
    heroes_data = await opendota.fetch_heroes()
    stats_data = await opendota.fetch_hero_stats()
    heroes_count = database.upsert_heroes(heroes_data)
    stats_count = database.upsert_hero_stats(stats_data)
    return SyncResponse(status="ok", heroes_count=heroes_count, stats_count=stats_count)


# ── 推荐 API ──

class RecommendRequest(BaseModel):
    """推荐请求参数模型"""
    radiant_picks: list[int] = []   # 天辉已选英雄ID列表
    dire_picks: list[int] = []      # 夜魇已选英雄ID列表
    bans: list[int] = []            # 已Ban英雄ID列表
    rank_tier: int = 5              # 段位等级（1-8，默认5=传奇）
    player_ids: list[int] = []      # 绑定的玩家账号ID列表


@app.post("/api/recommend")
async def recommend(request: RecommendRequest):
    """
    根据当前 BP 状态生成英雄推荐
    
    分别为天辉和夜魇计算推荐（仅对未满5人的阵营）。
    推荐时会互换 ally/enemy 视角：
    - 天辉推荐：ally=天辉, enemy=夜魇
    - 夜魇推荐：ally=夜魇, enemy=天辉
    """
    results = {}
    
    # 天辉未满5人时，计算天辉推荐
    if len(request.radiant_picks) < 5:
        results['radiant'] = await run_recommend(
            ally_picks=request.radiant_picks,
            enemy_picks=request.dire_picks,
            bans=request.bans,
            rank_tier=request.rank_tier,
            player_ids=request.player_ids,
        )
    
    # 夜魇未满5人时，计算夜魇推荐
    if len(request.dire_picks) < 5:
        results['dire'] = await run_recommend(
            ally_picks=request.dire_picks,
            enemy_picks=request.radiant_picks,
            bans=request.bans,
            rank_tier=request.rank_tier,
            player_ids=request.player_ids,
        )
    
    return results


# ── 数据热重载 API ──

@app.post("/api/reload-data")
async def reload_data():
    """
    重载内存中的静态数据（配合数据、分路数据等）
    
    在 update_data.py 更新数据文件后调用，无需重启服务即可生效
    """
    from services.recommend import _load_static, _cache
    _load_static()
    _cache.clear()  # 清除所有内存缓存
    return {"status": "ok", "message": "数据已重载"}


# ── 前端静态资源服务 ──

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pathlib import Path


class CacheMiddleware(BaseHTTPMiddleware):
    """
    HTTP 缓存中间件
    
    针对不同类型的资源设置不同的缓存策略：
    - /assets/: Vite 构建的 JS/CSS 文件带内容哈希，设置1年长缓存
    - /api/heroes: 英雄数据变化少，缓存10分钟
    - /favicon.svg: 缓存1天
    """
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith('/assets/'):
            # Vite 构建的 JS/CSS 带 hash，长缓存1年
            response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        elif path.startswith('/api/heroes') and request.method == 'GET':
            # 英雄列表数据变化少，缓存10分钟
            response.headers['Cache-Control'] = 'public, max-age=21600'  # 6小时
        elif path == '/favicon.svg':
            response.headers['Cache-Control'] = 'public, max-age=86400'
        return response

app.add_middleware(CacheMiddleware)

# 前端构建产物目录
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    # 挂载静态资源目录
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        """
        SPA 路由兜底：已存在的文件直接返回，否则返回 index.html
        
        这样前端路由（如 /bp、/profile）都能正确加载 SPA 应用
        """
        file_path = FRONTEND_DIST / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
