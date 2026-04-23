/**
 * Home.jsx — 首页
 * 
 * 展示英雄胜率排行榜，支持：
 * 1. 按段位筛选（RankSelector 组件）
 * 2. 按角色筛选（RoleFilter 组件，如核心/辅助/控制等）
 * 3. 英雄卡片展示（HeroCard 组件，含胜率和场次）
 * 
 * 数据流程：
 * - 页面加载时获取英雄列表和统计数据
 * - 切换段位时重新拉取统计数据
 * - 将英雄信息和统计数据合并后按胜率降序展示
 */

import { useState, useEffect, useMemo } from 'react';
import { fetchHeroes, fetchHeroStats } from '../api/index.js';
import HeroCard from '../components/HeroCard.jsx';
import RankSelector from '../components/RankSelector.jsx';
import RoleFilter from '../components/RoleFilter.jsx';
import DataFooter from '../components/DataFooter.jsx';

export default function Home() {
  const [heroes, setHeroes] = useState([]);     // 英雄基础信息列表
  const [stats, setStats] = useState([]);       // 英雄统计数据列表
  const [rank, setRank] = useState(5);          // 当前选择的段位（默认5=传奇）
  const [role, setRole] = useState('');          // 当前选择的角色筛选
  const [loading, setLoading] = useState(true); // 加载状态

  // 页面加载时获取英雄列表
  useEffect(() => {
    fetchHeroes().then(setHeroes).catch(() => {});
  }, []);

  // 段位切换时重新获取统计数据
  useEffect(() => {
    setLoading(true);
    fetchHeroStats(rank)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [rank]);

  /**
   * 合并英雄基础信息和统计数据
   * 将 roles JSON 字符串解析为数组，并填充中文名和胜率信息
   */
  const merged = useMemo(() => {
    const statsMap = new Map();
    for (const s of stats) {
      statsMap.set(s.hero_id, s);
    }
    return heroes.map((h) => {
      const s = statsMap.get(h.id);
      return {
        ...h,
        cn_name: s?.cn_name || h.cn_name || h.localized_name,
        roles_parsed: (() => { try { return JSON.parse(h.roles); } catch { return []; } })(),
        win_rate: s?.win_rate ?? null,
        picks: s?.picks ?? null,
      };
    });
  }, [heroes, stats]);

  /**
   * 按角色筛选并按胜率排序
   */
  const filtered = useMemo(() => {
    let list = merged;
    if (role) {
      list = list.filter((h) => h.roles_parsed.includes(role));
    }
    return list.sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0));
  }, [merged, role]);

  return (
    <div className="px-4 pt-4 pb-20">
      {/* 段位选择器 */}
      <RankSelector value={rank} onChange={setRank} />
      {/* 角色筛选器 */}
      <div className="mt-3">
        <RoleFilter value={role} onChange={setRole} />
      </div>

      {loading ? (
        // 加载中动画
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#e04a32] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        // 无数据提示
        <div className="text-center py-20 text-[#8b8fa3]">
          <p className="text-lg mb-2">暂无数据</p>
          <p className="text-sm">英雄数据将自动更新</p>
        </div>
      ) : (
        // 英雄卡片网格（响应式列数）
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((h) => (
            <HeroCard key={h.id} hero={h} />
          ))}
        </div>
      )}
      <DataFooter />
    </div>
  );
}
