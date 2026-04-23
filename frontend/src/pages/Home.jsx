import { useState, useEffect, useMemo } from 'react';
import { fetchHeroes, fetchHeroStats } from '../api/index.js';
import HeroCard from '../components/HeroCard.jsx';
import RankSelector from '../components/RankSelector.jsx';
import RoleFilter from '../components/RoleFilter.jsx';

export default function Home() {
  const [heroes, setHeroes] = useState([]);
  const [stats, setStats] = useState([]);
  const [rank, setRank] = useState(5);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHeroes().then(setHeroes).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchHeroStats(rank)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [rank]);

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

  const filtered = useMemo(() => {
    let list = merged;
    if (role) {
      list = list.filter((h) => h.roles_parsed.includes(role));
    }
    return list.sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0));
  }, [merged, role]);

  return (
    <div className="px-4 pt-4 pb-20">
      <RankSelector value={rank} onChange={setRank} />
      <div className="mt-3">
        <RoleFilter value={role} onChange={setRole} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#e04a32] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-[#8b8fa3]">
          <p className="text-lg mb-2">暂无数据</p>
          <p className="text-sm">请点击右上角「同步数据」按钮获取最新英雄数据</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((h) => (
            <HeroCard key={h.id} hero={h} />
          ))}
        </div>
      )}
    </div>
  );
}
