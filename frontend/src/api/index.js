/**
 * API 调用封装模块
 * 
 * 本模块封装了前端与后端所有 API 的通信接口，包括：
 * - 英雄数据获取（列表、统计、别名）
 * - 数据同步触发
 * - 玩家信息查询（个人资料、英雄池）
 * - 推荐引擎调用
 * 
 * 所有接口使用相对路径 '/api'，由 Vite 开发服务器或生产环境的反向代理转发
 */

// API 基础路径（生产环境由 FastAPI 直接提供，开发环境通过 Vite proxy 转发）
const API_BASE = '/api';

/**
 * 获取所有英雄基础信息列表
 * @returns {Promise<Array>} 英雄列表
 */
export async function fetchHeroes() {
  const res = await fetch(`${API_BASE}/heroes`);
  if (!res.ok) throw new Error('Failed to fetch heroes');
  return res.json();
}

/**
 * 获取英雄统计数据（胜率、场次等）
 * @param {number} [rank] - 段位等级（1-8），不传返回所有段位
 * @returns {Promise<Array>} 英雄统计列表
 */
export async function fetchHeroStats(rank) {
  const params = rank ? `?rank=${rank}` : '';
  const res = await fetch(`${API_BASE}/heroes/stats${params}`);
  if (!res.ok) throw new Error('Failed to fetch hero stats');
  return res.json();
}

/**
 * 触发英雄数据同步（从 OpenDota API 拉取最新数据写入本地数据库）
 * @returns {Promise<Object>} {status, heroes_count, stats_count}
 */
export async function syncHeroes() {
  const res = await fetch(`${API_BASE}/sync/heroes`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to sync heroes');
  return res.json();
}

/**
 * 获取英雄别名数据（包含中英文名、拼音别名，用于搜索功能）
 * @returns {Promise<Array>} 英雄别名列表
 */
export async function fetchHeroAliases() {
  const res = await fetch(`${API_BASE}/heroes/aliases`);
  if (!res.ok) throw new Error('Failed to fetch hero aliases');
  return res.json();
}

/**
 * 获取玩家基本信息（昵称、头像、段位）
 * @param {number} accountId - Dota2 账号ID
 * @returns {Promise<Object>} 玩家信息
 */
export async function fetchPlayerProfile(accountId) {
  const res = await fetch(`${API_BASE}/player/${accountId}/profile`);
  if (!res.ok) throw new Error('Failed to fetch player profile');
  return res.json();
}

/**
 * 获取玩家英雄池分析（最近200场 TOP10 常用英雄）
 * @param {number} accountId - Dota2 账号ID
 * @returns {Promise<Object>} {total_matches, heroes: [...]}
 */
export async function fetchPlayerHeroPool(accountId) {
  const res = await fetch(`${API_BASE}/player/${accountId}/hero-pool`);
  if (!res.ok) throw new Error('Failed to fetch hero pool');
  return res.json();
}

/**
 * 调用推荐引擎，获取英雄推荐结果
 * 
 * 设置30秒超时，防止网络问题导致无限等待
 * 
 * @param {Object} data - 推荐请求参数
 * @param {number[]} data.radiant_picks - 天辉已选英雄ID列表
 * @param {number[]} data.dire_picks - 夜魇已选英雄ID列表
 * @param {number[]} data.bans - 已Ban英雄ID列表
 * @param {number} data.rank_tier - 段位等级
 * @param {number[]} data.player_ids - 绑定的玩家账号ID列表
 * @returns {Promise<Object>} {radiant: [...], dire: [...]}
 */
export async function fetchRecommend(data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30秒超时
  try {
    const res = await fetch(`${API_BASE}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Failed to fetch recommendations');
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}
