"""
推荐引擎核心服务模块

本模块实现了 Dota2 BP Advisor 的核心推荐算法，负责根据当前 BP 状态为玩家推荐最优英雄。

核心设计：
1. 6维度评分体系：克制分、段位分、个人分、位置需求分、能力覆盖分、配合分
2. 动态权重：根据 BP 阶段（己方已选人数）自动调整各维度权重
3. 位置匹配：使用全排列暴力搜索（二分图匹配）找到最优位置分配
4. 冷门惩罚：段位分会根据英雄的使用场次对冷门英雄打折
5. 内存缓存：对 OpenDota API 数据做 TTL 缓存，减少重复请求
6. 并行预加载：所有外部 API 数据（个人池、克制、段位统计）并行拉取

评分流程：
  候选英雄 → 计算6个维度得分 → 加权求和 → 排序取 TOP10 → 生成推荐理由
"""

import json
import time
import httpx
from itertools import permutations
from pathlib import Path
from typing import Optional

from services.hero_names_cn import HERO_NAMES_CN
from services import database


# ── 动态权重（根据 BP 阶段调整） ──

# 3个度的默认值（4个阶段）
DEFAULT_DEGREES = {
    'early':     {'hero': 50, 'team': 30, 'comp': 20},
    'mid':       {'hero': 25, 'team': 50, 'comp': 25},
    'mid_late':  {'hero': 15, 'team': 35, 'comp': 50},
    'late':      {'hero': 10, 'team': 30, 'comp': 60},
}

# 固定子比例
SUB_RATIOS = {
    'meta_in_hero': 0.4,
    'personal_in_hero': 0.6,
    'counter_in_team': 0.6,
    'synergy_in_team': 0.4,
    'position_in_comp': 0.6,
    'capability_in_comp': 0.4,
}


def _degrees_to_weights(hero_deg: float, team_deg: float, comp_deg: float, has_pool: bool) -> dict:
    """将3个度转换为6维度权重"""
    total = hero_deg + team_deg + comp_deg
    if total <= 0:
        total = 100
    hero = hero_deg / total
    team = team_deg / total
    comp = comp_deg / total

    if has_pool:
        meta_ratio = SUB_RATIOS['meta_in_hero']
        personal_ratio = SUB_RATIOS['personal_in_hero']
    else:
        meta_ratio = 1.0
        personal_ratio = 0.0

    return {
        'counter': team * SUB_RATIOS['counter_in_team'],
        'synergy': team * SUB_RATIOS['synergy_in_team'],
        'meta': hero * meta_ratio,
        'personal': hero * personal_ratio,
        'position': comp * SUB_RATIOS['position_in_comp'],
        'capability': comp * SUB_RATIOS['capability_in_comp'],
    }


def _get_weights(ally_count: int, enemy_count: int, has_pool: bool, custom_degrees: dict = None) -> dict:
    """获取权重，支持自定义度数"""
    if ally_count <= 1:
        stage = 'early'
    elif ally_count == 2:
        stage = 'mid'
    elif ally_count == 3:
        stage = 'mid_late'
    else:
        stage = 'late'

    if custom_degrees and stage in custom_degrees:
        deg = custom_degrees[stage]
    else:
        deg = DEFAULT_DEGREES[stage]

    return _degrees_to_weights(deg['hero'], deg['team'], deg['comp'], has_pool)


# ── 能力标签定义 ──
# 用于"能力覆盖分"维度，检查阵容是否缺少关键能力
CAPABILITY_TAGS = ['Disabler', 'Initiator', 'Pusher', 'Durable']
CAPABILITY_CN = {'Disabler': '控制', 'Initiator': '先手', 'Pusher': '推进', 'Durable': '前排'}


# ── 内存缓存 ──
# 简单的 TTL 缓存，格式: {key: (timestamp, value)}
_cache: dict[str, tuple[float, any]] = {}
CACHE_TTL = 3600  # 缓存有效期1小时

# 数据文件目录
DATA_DIR = Path(__file__).parent.parent / "data"

# 静态数据（启动时加载到内存）
_synergy_data: dict = {}    # 英雄配合胜率数据 {hero_id_str: {partner_id_str: {games, wins, win_rate}}}
_lane_roles: dict = {}       # 英雄分路数据 {hero_id_str: {safe, mid, off}}
_hero_db_cache: Optional[list] = None  # 英雄数据库缓存
_hero_db_ts: float = 0       # 英雄数据库缓存时间戳


def _load_static():
    """
    加载静态数据文件到内存
    
    读取 hero_synergy.json（配合数据）和 hero_lane_roles.json（分路数据）
    这些数据更新频率低，启动时加载一次即可，通过 /api/reload-data 接口热重载
    """
    global _synergy_data, _lane_roles
    synergy_path = DATA_DIR / "hero_synergy.json"
    lane_path = DATA_DIR / "hero_lane_roles.json"
    if synergy_path.exists():
        with open(synergy_path, "r") as f:
            raw = json.load(f)
            _synergy_data = raw.get("data", raw)
    if lane_path.exists():
        with open(lane_path, "r") as f:
            _lane_roles = json.load(f)

# 模块导入时立即加载静态数据
_load_static()


def _get_heroes_db() -> list[dict]:
    """
    获取英雄数据库（带5分钟缓存）
    
    避免每次推荐请求都查询 SQLite，减少 IO 开销
    """
    global _hero_db_cache, _hero_db_ts
    now = time.time()
    if _hero_db_cache is None or now - _hero_db_ts > 300:
        _hero_db_cache = database.get_all_heroes()
        _hero_db_ts = now
    return _hero_db_cache


def _clamp(v, lo=0, hi=100):
    """将数值限制在 [lo, hi] 范围内"""
    return max(lo, min(hi, v))


def _normalize_winrate(wr: float) -> float:
    """
    将胜率归一化到 0-100 分
    
    映射关系：40% → 0分, 50% → 50分, 60% → 100分
    使得胜率差异在评分中有合理的区分度
    """
    return _clamp((wr - 40) / 20 * 100)


def _get_cache(key):
    """从内存缓存获取数据，过期返回 None"""
    if key in _cache:
        ts, val = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return val
    return None


def _set_cache(key, val):
    """写入内存缓存"""
    _cache[key] = (time.time(), val)


def _build_hero_map(heroes_db: list[dict]) -> dict:
    """构建 {hero_id: hero_dict} 映射，方便按ID快速查找英雄"""
    return {h['id']: h for h in heroes_db}


def _get_roles(hero: dict) -> list[str]:
    """解析英雄的角色标签列表（数据库中 roles 字段可能是 JSON 字符串）"""
    roles_raw = hero.get('roles', '[]')
    if isinstance(roles_raw, str):
        try:
            return json.loads(roles_raw)
        except:
            return []
    return roles_raw


def _cn_name(hero: dict) -> str:
    """获取英雄中文名，优先使用数据库中的 cn_name，否则从映射表查找"""
    return hero.get('cn_name') or HERO_NAMES_CN.get(hero.get('localized_name', ''), hero.get('localized_name', ''))


def _cn_name_by_id(hero_id: int, hero_map: dict) -> str:
    """根据英雄ID获取中文名"""
    h = hero_map.get(hero_id)
    return _cn_name(h) if h else f"英雄{hero_id}"


# ── 位置匹配算法 ──

def _hero_position_scores(hero_id: int, roles: list[str]) -> dict[int, float]:
    """
    计算英雄在每个位置（1-5号位）的适合度得分
    
    基于 hero_lane_roles.json 中的分路数据（safe/mid/off）和英雄的 Carry/Support 角色标签：
    - 1号位（安全路核心）：safe × has_carry
    - 2号位（中路）：mid（不限角色）
    - 3号位（劣势路核心）：off × has_carry
    - 4号位（劣势路辅助/游走）：off × has_support
    - 5号位（安全路辅助）：safe × has_support
    """
    lane = _lane_roles.get(str(hero_id), {"safe": 33, "mid": 33, "off": 33})
    has_carry = 'Carry' in roles
    has_support = 'Support' in roles
    # 如果既不是 Carry 也不是 Support，则视为两者皆可
    if not has_carry and not has_support:
        has_carry = True
        has_support = True

    safe = lane.get('safe', 0)
    mid = lane.get('mid', 0)
    off = lane.get('off', 0)

    return {
        1: safe if has_carry else 0,    # 1号位：安全路核心
        2: mid,                          # 2号位：中路
        3: off if has_carry else 0,      # 3号位：劣势路核心
        4: off if has_support else 0,    # 4号位：劣势路辅助
        5: safe if has_support else 0,   # 5号位：安全路辅助
    }


def _best_position_match(hero_ids: list[int], hero_map: dict) -> tuple[float, dict[int, int]]:
    """
    二分图最优位置匹配
    
    对给定的英雄列表，通过全排列暴力搜索找到最优的位置分配方案，
    使得所有英雄的位置适合度得分总和最大。
    
    注意：当英雄数 <= 5 时，排列数最多 5! = 120，暴力搜索可以接受。
    
    参数:
        hero_ids: 英雄ID列表
        hero_map: 英雄信息映射
    
    返回:
        (avg_score, assignment): 平均位置得分和最优分配 {hero_id: position}
    """
    if not hero_ids:
        return 50, {}

    # 计算每个英雄在每个位置的得分
    hero_pos = {}
    for hid in hero_ids:
        h = hero_map.get(hid)
        if h:
            hero_pos[hid] = _hero_position_scores(hid, _get_roles(h))
        else:
            hero_pos[hid] = {1: 20, 2: 20, 3: 20, 4: 20, 5: 20}

    positions = [1, 2, 3, 4, 5]
    n = len(hero_ids)
    best_score = -1
    best_assign = {}

    # 遍历所有位置排列，找到总分最高的分配方案
    for perm in permutations(positions, min(n, 5)):
        total = 0
        for i, hid in enumerate(hero_ids[:5]):
            pos = perm[i]
            total += hero_pos[hid].get(pos, 0)
        if total > best_score:
            best_score = total
            best_assign = {hero_ids[i]: perm[i] for i in range(min(n, 5))}

    avg = best_score / n if n > 0 else 50
    return avg, best_assign


# ── OpenDota API 数据获取 ──

async def _fetch_matchups(hero_id: int) -> dict:
    """
    获取指定英雄的对位胜率数据（带缓存）
    
    返回: {对手hero_id: {wins, games, win_rate}}
    """
    cache_key = f"matchups_{hero_id}"
    cached = _get_cache(cache_key)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"https://api.opendota.com/api/heroes/{hero_id}/matchups")
            resp.raise_for_status()
            data = resp.json()
        result = {}
        for m in data:
            gp = m.get('games_played', 0)
            if gp > 0:
                result[m['hero_id']] = {'wins': m['wins'], 'games': gp, 'win_rate': m['wins'] / gp * 100}
        _set_cache(cache_key, result)
        return result
    except Exception:
        return {}


async def _fetch_hero_stats_raw() -> list[dict]:
    """获取 OpenDota heroStats 全量数据（各段位的选取率和胜率，带缓存）"""
    cache_key = "hero_stats_raw"
    cached = _get_cache(cache_key)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get("https://api.opendota.com/api/heroStats")
            resp.raise_for_status()
            data = resp.json()
        _set_cache(cache_key, data)
        return data
    except Exception:
        return []


async def _fetch_personal_pool(player_id: int) -> dict:
    """
    获取单个玩家的完整英雄池数据（带缓存）
    
    返回: {hero_id: {games, wins, win_rate}}
    """
    cache_key = f"personal_pool_{player_id}"
    cached = _get_cache(cache_key)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"https://api.opendota.com/api/players/{player_id}/heroes"
            )
            resp.raise_for_status()
            data = resp.json()
        result = {}
        for h in data:
            hid = h.get('hero_id', 0)
            games = h.get('games', 0)
            if hid > 0 and games > 0:
                wins = h.get('win', 0)
                result[hid] = {
                    'games': games,
                    'wins': wins,
                    'win_rate': round(wins / games * 100, 1)
                }
        _set_cache(cache_key, result)
        return result
    except Exception:
        return {}


# ── 6维度评分函数 ──

async def _prefetch_counter_data(enemy_picks: list[int]) -> dict:
    """
    并行预加载敌方所有英雄的 matchup 数据
    
    一次性拉取所有敌方英雄的对位数据，避免在遍历候选英雄时重复请求
    """
    if not enemy_picks:
        return {}
    import asyncio
    tasks = {eid: _fetch_matchups(eid) for eid in enemy_picks}
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    return {eid: (r if not isinstance(r, Exception) else {}) 
            for eid, r in zip(tasks.keys(), results)}


def _counter_score_from_cache(candidate_id: int, enemy_picks: list[int], 
                               counter_cache: dict, hero_map: dict) -> tuple[float, dict]:
    """
    从预加载数据中计算候选英雄的克制分
    
    计算逻辑：
    1. 从敌方每个英雄的 matchup 数据中找到候选英雄的对位胜率
    2. 注意：matchup 数据是"敌方视角"，需要用 100 - win_rate 转换为候选英雄的胜率
    3. 取所有对位胜率的平均值，归一化为 0-100 分
    4. 记录克制效果最好的敌方英雄作为推荐理由
    """
    detail = {}
    if not enemy_picks:
        return 50, detail

    wrs = []
    best_wr = -1
    best_enemy_id = None
    for eid in enemy_picks:
        enemy_matchups = counter_cache.get(eid, {})
        entry = enemy_matchups.get(candidate_id)
        if entry:
            # 注意：这里查的是敌方英雄的 matchup，所以胜率要反转
            # enemy 对 candidate 的胜率 = entry['win_rate']
            # candidate 对 enemy 的胜率 = 100 - entry['win_rate']  
            wr = 100 - entry['win_rate']
            wrs.append(wr)
            if wr > best_wr:
                best_wr = wr
                best_enemy_id = eid

    if not wrs:
        return 50, detail

    avg_wr = sum(wrs) / len(wrs)
    score = _normalize_winrate(avg_wr)

    if best_enemy_id is not None:
        detail = {
            'best_against': _cn_name_by_id(best_enemy_id, hero_map),
            'best_against_id': best_enemy_id,
            'best_against_winrate': round(best_wr, 1),
        }
    return score, detail


async def _meta_score(candidate_id: int, rank_tier: int) -> tuple[float, dict]:
    """
    计算候选英雄在当前段位的强势程度（段位分）
    
    返回: (score, {rank_winrate, rank_picks})
    """
    stats = await _fetch_hero_stats_raw()
    if not stats:
        return 50, {}

    rank_str = str(rank_tier)
    for s in stats:
        if s.get('id') == candidate_id:
            picks = s.get(f'{rank_str}_pick', 0) or 0
            wins = s.get(f'{rank_str}_win', 0) or 0
            if picks > 0:
                wr = wins / picks * 100
                return _normalize_winrate(wr), {'rank_winrate': round(wr, 1), 'rank_picks': picks}
            return 50, {}
    return 50, {}


async def _fetch_all_personal_pools(player_ids: list[int]) -> dict:
    """
    一次性拉取所有绑定账号的英雄池，合并为统一视图
    
    多账号场景下，同一英雄取得分最高的账号数据。
    得分 = 熟练度（场次/30, 上限1.0）× 50% + 胜率分 × 50%
    
    返回: {hero_id: {games, win_rate, score}}
    """
    if not player_ids:
        return {}
    
    cache_key = f"personal_pools_{'_'.join(str(p) for p in sorted(player_ids))}"
    cached = _get_cache(cache_key)
    if cached is not None:
        return cached
    
    merged = {}  # hero_id -> {games, win_rate, score}
    for pid in player_ids:
        pool = await _fetch_personal_pool(pid)
        for hid, data in pool.items():
            games = data['games']
            wr = data['win_rate']
            # 熟练度：场次/30，上限1.0（30场及以上视为充分熟练）
            proficiency = min(games / 30, 1.0) * 100
            wr_score = _normalize_winrate(wr)
            # 综合得分：熟练度和胜率各占一半
            score = proficiency * 0.5 + wr_score * 0.5
            # 多账号取最高分
            if hid not in merged or score > merged[hid]['score']:
                merged[hid] = {'games': games, 'win_rate': round(wr, 1), 'score': score}
    
    _set_cache(cache_key, merged)
    return merged


def _personal_score(candidate_id: int, personal_pools: dict) -> tuple[float, dict]:
    """从预加载的英雄池中查找候选英雄的个人分"""
    data = personal_pools.get(candidate_id)
    if data:
        return data['score'], {'games': data['games'], 'win_rate': data['win_rate']}
    return 0, {}


def _position_detail(candidate_id: int, hero_map: dict) -> dict:
    """返回候选英雄最擅长的 TOP2 位置信息，用于推荐理由展示"""
    h = hero_map.get(candidate_id)
    if not h:
        return {}
    pos_scores = _hero_position_scores(candidate_id, _get_roles(h))
    sorted_pos = sorted(pos_scores.items(), key=lambda x: x[1], reverse=True)
    top2 = [(p, round(s, 1)) for p, s in sorted_pos if s > 0][:2]
    return {'top_positions': [{'position': p, 'score': s} for p, s in top2]}


def _capability_score(candidate_id: int, ally_picks: list[int], hero_map: dict) -> tuple[float, dict]:
    """
    计算能力覆盖分：候选英雄能否补齐阵容缺少的关键能力
    
    检查4种关键能力（控制/先手/推进/前排），对每种能力：
    - 己方无人拥有 → 权重1.0（急需）
    - 己方1人拥有 → 权重0.7（仍需补充）
    - 己方2人拥有 → 权重0.3（不太需要）
    - 己方3人+ → 权重0（已经充足）
    
    候选英雄拥有急需能力时得分更高
    """
    candidate = hero_map.get(candidate_id)
    if not candidate:
        return 50, {}

    candidate_roles = _get_roles(candidate)
    score = 0
    filled = []

    for tag in CAPABILITY_TAGS:
        # 统计己方已有多少英雄拥有此能力
        count = 0
        for aid in ally_picks:
            ally = hero_map.get(aid)
            if ally and tag in _get_roles(ally):
                count += 1

        # 根据己方已有数量确定需求权重
        if count == 0:
            weight = 1.0
        elif count == 1:
            weight = 0.7
        elif count == 2:
            weight = 0.3
        else:
            weight = 0

        # 候选英雄拥有此能力且阵容需要时加分
        if tag in candidate_roles and weight > 0:
            score += weight
            filled.append(CAPABILITY_CN.get(tag, tag))

    # 归一化到 0-100 分（满分为4种能力全部补充且全部急需）
    return _clamp(score / 4 * 100), {'filled_capabilities': filled}


def _synergy_score(candidate_id: int, ally_picks: list[int], hero_map: dict) -> tuple[float, dict]:
    """
    计算配合分：候选英雄与己方已选英雄的同队胜率
    
    从预加载的 hero_synergy.json 数据中查找候选英雄与每个己方英雄的配合胜率，
    取平均值归一化为得分，并记录配合最佳的队友作为推荐理由
    """
    if not ally_picks:
        return 50, {}

    cid_str = str(candidate_id)
    hero_synergy = _synergy_data.get(cid_str, {})
    if not hero_synergy:
        return 50, {}

    wrs = []
    best_wr = -1
    best_ally_id = None
    for aid in ally_picks:
        aid_str = str(aid)
        entry = hero_synergy.get(aid_str)
        if entry:
            wr = entry.get('win_rate', 50)
            wrs.append(wr)
            if wr > best_wr:
                best_wr = wr
                best_ally_id = aid

    if not wrs:
        return 50, {}

    avg_wr = sum(wrs) / len(wrs)
    score = _normalize_winrate(avg_wr)

    detail = {}
    if best_ally_id is not None:
        detail = {
            'best_partner': _cn_name_by_id(best_ally_id, hero_map),
            'best_partner_id': best_ally_id,
            'best_partner_winrate': round(best_wr, 1),
        }
    return score, detail


# ── 推荐理由生成 ──

def _generate_reasons(scores: dict, details: dict, hero_map: dict) -> list[dict]:
    """
    生成固定6条推荐理由（每个维度一条），用于前端理由面板展示
    
    每条理由包含 type（维度类型）和 text（人类可读的描述文字）
    """
    reasons = []

    # 1. 克制理由
    cd = details.get('counter', {})
    reasons.append({
        'type': 'counter',
        'text': f"克制{cd['best_against']}({cd['best_against_winrate']}%)" if cd.get('best_against') else '无克制数据'
    })

    # 2. 段位理由（含冷门标记）
    md = details.get('meta', {})
    if md.get('rank_winrate'):
        pop = md.get('popularity', 100)
        pop_tag = '(冷门)' if pop < 40 else '(小众)' if pop < 80 else ''
        reasons.append({
            'type': 'meta',
            'text': f"段位胜率{md['rank_winrate']}%{pop_tag}"
        })
    else:
        reasons.append({'type': 'meta', 'text': '无段位数据'})

    # 3. 位置理由
    pd = details.get('position', {})
    top_pos = pd.get('top_positions', [])
    reasons.append({
        'type': 'position',
        'text': f"擅长{'、'.join([str(p['position'])+'号位' for p in top_pos])}" if top_pos else '无位置数据'
    })

    # 4. 能力覆盖理由
    capd = details.get('capability', {})
    filled = capd.get('filled_capabilities', [])
    reasons.append({
        'type': 'capability',
        'text': f"补充{'、'.join(filled)}" if filled else '无能力补充'
    })

    # 5. 配合理由
    sd = details.get('synergy', {})
    reasons.append({
        'type': 'synergy',
        'text': f"配合{sd['best_partner']}({sd['best_partner_winrate']}%)" if sd.get('best_partner') else '无配合数据'
    })

    # 6. 个人英雄池理由
    psd = details.get('personal', {})
    reasons.append({
        'type': 'personal',
        'text': f"{psd['games']}场 胜率{psd['win_rate']}%" if psd.get('games') else '无个人数据'
    })

    return reasons


# ── 主推荐函数 ──

async def recommend(
    ally_picks: list[int],
    enemy_picks: list[int],
    bans: list[int],
    rank_tier: int = 5,
    player_ids: Optional[list[int]] = None,
    custom_degrees: Optional[dict] = None,
) -> list[dict]:
    """
    核心推荐函数：根据当前 BP 状态返回 TOP10 推荐英雄
    
    流程：
    1. 确定动态权重（根据 BP 阶段）
    2. 排除已选/已Ban的英雄，得到候选列表
    3. 并行预加载所有外部数据（个人池 + 克制 + 段位统计）
    4. 遍历所有候选英雄，计算6维度得分
    5. 加权求和得到总分，排序取 TOP10
    6. 生成推荐理由
    
    参数:
        ally_picks: 己方已选英雄ID列表
        enemy_picks: 敌方已选英雄ID列表
        bans: 已Ban英雄ID列表
        rank_tier: 段位等级（1-8）
        player_ids: 绑定的玩家账号ID列表
    
    返回:
        list[dict]: TOP10 推荐结果，每个包含 hero_id, name_cn, total_score, scores, reasons 等
    """
    player_ids = player_ids or []
    has_pool = len(player_ids) > 0
    weights = _get_weights(len(ally_picks), len(enemy_picks), has_pool, custom_degrees)

    heroes_db = _get_heroes_db()
    hero_map = _build_hero_map(heroes_db)

    # 排除已选和已Ban的英雄
    excluded = set(ally_picks) | set(enemy_picks) | set(bans)
    candidates = [h['id'] for h in heroes_db if h['id'] not in excluded]

    # 并行预加载所有外部数据（个人池 + 克制 + 段位统计）
    import asyncio as _aio

    async def _empty_dict():
        return {}

    tasks = [
        _fetch_all_personal_pools(player_ids) if has_pool else _empty_dict(),
        _prefetch_counter_data(enemy_picks),
        _fetch_hero_stats_raw(),
    ]
    pool_result, counter_cache, hero_stats = await _aio.gather(*tasks, return_exceptions=True)
    personal_pools = pool_result if isinstance(pool_result, dict) else {}
    counter_cache = counter_cache if isinstance(counter_cache, dict) else {}
    hero_stats = hero_stats if isinstance(hero_stats, list) else []

    # 解析段位数据，构建 {hero_id: {winrate, picks}} 映射
    hero_stats = await _fetch_hero_stats_raw()
    rank_str = str(rank_tier)
    meta_wr_map = {}
    all_picks = []
    for s in hero_stats:
        picks = s.get(f'{rank_str}_pick', 0) or 0
        wins = s.get(f'{rank_str}_win', 0) or 0
        if picks > 0:
            meta_wr_map[s['id']] = {'winrate': wins / picks * 100, 'picks': picks}
            all_picks.append(picks)
    # 计算场次中位数，用于冷门惩罚基准
    all_picks.sort()
    median_picks = all_picks[len(all_picks) // 2] if all_picks else 10000

    results = []

    for cid in candidates:
        details = {}

        # ① 克制分：候选英雄对敌方英雄的对位胜率
        counter, details['counter'] = _counter_score_from_cache(cid, enemy_picks, counter_cache, hero_map)

        # ② 段位分：当前段位的英雄胜率（融合冷门惩罚）
        meta_info = meta_wr_map.get(cid)
        if meta_info:
            raw_meta = _normalize_winrate(meta_info['winrate'])
            # 冷门惩罚：场次低于中位数的英雄，段位分按比例打折
            # popularity = min(picks / median, 1.0)，场次 >= 中位数不打折
            popularity = min(meta_info['picks'] / median_picks, 1.0)
            meta = raw_meta * (0.5 + 0.5 * popularity)  # 最低打5折
            details['meta'] = {
                'rank_winrate': round(meta_info['winrate'], 1),
                'rank_picks': meta_info['picks'],
                'popularity': round(popularity * 100, 1)
            }
        else:
            meta = 50
            details['meta'] = {}

        # ③ 个人分：玩家英雄池中的熟练度 × 胜率
        personal = 0
        if has_pool:
            personal, details['personal'] = _personal_score(cid, personal_pools)
        else:
            details['personal'] = {}

        # ④ 位置需求分：加入候选英雄后阵容的最优位置匹配得分
        test_team = ally_picks + [cid]
        pos_avg, pos_assign = _best_position_match(test_team, hero_map)
        position = pos_avg
        recommended_pos = pos_assign.get(cid, 0)  # 该候选英雄的推荐位置
        details['position'] = _position_detail(cid, hero_map)

        # ⑤ 能力覆盖分：补充阵容缺少的控制/先手/推进/前排能力
        capability, details['capability'] = _capability_score(cid, ally_picks, hero_map)

        # ⑥ 配合分：与己方已选英雄的同队胜率
        synergy, details['synergy'] = _synergy_score(cid, ally_picks, hero_map)

        # 汇总6个维度的得分
        score_dict = {
            'counter': round(counter, 1),
            'meta': round(meta, 1),
            'personal': round(personal, 1),
            'position': round(position, 1),
            'capability': round(capability, 1),
            'synergy': round(synergy, 1),
        }

        # 加权求和计算总分
        total = sum(score_dict[k] * weights[k] for k in weights)

        # 生成推荐理由
        reasons = _generate_reasons(score_dict, details, hero_map)

        results.append({
            'hero_id': cid,
            'name_cn': _cn_name(hero_map.get(cid, {})),
            'img': hero_map.get(cid, {}).get('img', ''),
            'total_score': round(total, 1),
            'recommended_position': recommended_pos,
            'scores': score_dict,
            'details': details,
            'reasons': reasons,
        })

    # 按总分降序排列，返回 TOP10
    results.sort(key=lambda x: x['total_score'], reverse=True)
    return results[:10]
