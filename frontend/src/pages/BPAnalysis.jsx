import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fetchHeroAliases, fetchRecommend } from '../api';

const CDN = 'https://cdn.cloudflare.steamstatic.com';

const ATTR_GROUPS = [
  { key: 'str', label: '💪 力量' },
  { key: 'agi', label: '🏹 敏捷' },
  { key: 'int', label: '🧠 智力' },
  { key: 'all', label: '⭐ 全才' },
];

const RANK_NAMES = {
  1: '先锋', 2: '卫士', 3: '中军', 4: '统帅',
  5: '传奇', 6: '万古', 7: '超凡', 8: '冠绝',
};

const REASON_ICONS = {
  counter: '⚔️ 克制',
  meta: '📊 段位',
  position: '📍 位置',
  capability: '🛡️ 能力',
  synergy: '🤝 配合',
  personal: '👤 个人',
};

export default function BPAnalysis() {
  const [heroes, setHeroes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('pick_radiant');
  const [bans, setBans] = useState([]);
  const [radiantPicks, setRadiantPicks] = useState([]);
  const [direPicks, setDirePicks] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [recommendations, setRecommendations] = useState({ radiant: [], dire: [] });
  const [recLoading, setRecLoading] = useState(false);
  const [selectedRecommendId, setSelectedRecommendId] = useState(null);

  useEffect(() => {
    fetchHeroAliases()
      .then(setHeroes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const selectedIds = useMemo(() => {
    const ids = new Set();
    bans.forEach(h => ids.add(h.hero_id));
    radiantPicks.forEach(h => ids.add(h.hero_id));
    direPicks.forEach(h => ids.add(h.hero_id));
    return ids;
  }, [bans, radiantPicks, direPicks]);

  // Debounced recommend API with retry
  const debounceRef = useRef(null);
  const retryRef = useRef(null);
  const retryCountRef = useRef(0);

  const doFetchRecommend = (data) => {
    setRecLoading(true);
    fetchRecommend(data)
      .then(res => {
        if (res && (res.radiant?.length || res.dire?.length)) {
          setRecommendations(res);
          retryCountRef.current = 0;
        } else {
          // API返回空结果，保留旧推荐不清空
        }
      })
      .catch(() => {
        // 请求失败，保留旧推荐，自动重试（最多2次）
        if (retryCountRef.current < 2) {
          retryCountRef.current++;
          retryRef.current = setTimeout(() => doFetchRecommend(data), 2000);
        }
      })
      .finally(() => setRecLoading(false));
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (retryRef.current) clearTimeout(retryRef.current);
    retryCountRef.current = 0;

    debounceRef.current = setTimeout(() => {
      let rankTier = 5;
      try { rankTier = parseInt(localStorage.getItem('dota2_rank_tier')) || 5; } catch {}
      let playerIds = [];
      try {
        const raw = JSON.parse(localStorage.getItem('dota2_player_ids') || '[]');
        playerIds = raw.map(p => Number(p.account_id || p.id)).filter(Boolean);
      } catch {}

      const data = {
        radiant_picks: radiantPicks.map(h => h.hero_id),
        dire_picks: direPicks.map(h => h.hero_id),
        bans: bans.map(h => h.hero_id),
        rank_tier: rankTier,
        player_ids: playerIds,
      };
      doFetchRecommend(data);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [radiantPicks, direPicks, bans]);

  const matchesSearch = (hero) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    if (hero.name_cn.toLowerCase().includes(q)) return true;
    if (hero.name_en.toLowerCase().includes(q)) return true;
    return hero.aliases.some(a => a.toLowerCase().includes(q));
  };

  const handleSelect = useCallback((hero) => {
    if (selectedIds.has(hero.hero_id)) return;
    if (mode === 'ban') {
      setBans(prev => [...prev, hero]);
    } else if (mode === 'pick_radiant') {
      if (radiantPicks.length >= 5) return;
      setRadiantPicks(prev => [...prev, hero]);
    } else {
      if (direPicks.length >= 5) return;
      setDirePicks(prev => [...prev, hero]);
    }
  }, [selectedIds, mode, radiantPicks.length, direPicks.length]);

  const handleBanFromRecommend = useCallback((hero) => {
    if (selectedIds.has(hero.hero_id)) return;
    setBans(prev => [...prev, hero]);
  }, [selectedIds]);

  const handleRemove = (hero, list) => {
    if (list === 'ban') setBans(prev => prev.filter(h => h.hero_id !== hero.hero_id));
    else if (list === 'radiant') setRadiantPicks(prev => prev.filter(h => h.hero_id !== hero.hero_id));
    else setDirePicks(prev => prev.filter(h => h.hero_id !== hero.hero_id));
  };

  const herosByAttr = useMemo(() => {
    const map = { str: [], agi: [], int: [], all: [] };
    heroes.forEach(h => {
      const attr = map[h.primary_attr] ? h.primary_attr : 'all';
      map[attr].push(h);
    });
    return map;
  }, [heroes]);

  // Current recommend list based on mode
  const currentRecs = useMemo(() => {
    if (mode === 'ban') return [];
    // 当前阵营已满5人则不推荐
    if (mode === 'pick_radiant' && radiantPicks.length >= 5) return [];
    if (mode === 'pick_dire' && direPicks.length >= 5) return [];
    const list = mode === 'pick_radiant' ? recommendations.radiant : recommendations.dire;
    if (!list) return [];
    return list.filter(r => !selectedIds.has(r.hero_id)).slice(0, 10);
  }, [mode, recommendations, selectedIds]);

  const selectedRecHero = useMemo(() => {
    if (!selectedRecommendId) return null;
    return currentRecs.find(r => r.hero_id === selectedRecommendId) || null;
  }, [selectedRecommendId, currentRecs]);

  // Reset selected recommend when mode changes
  useEffect(() => { setSelectedRecommendId(null); }, [mode]);

  const rankTier = useMemo(() => {
    try { return parseInt(localStorage.getItem('dota2_rank_tier')) || 5; } catch { return 5; }
  }, []);

  if (loading) {
    return (
      <div className="px-4 pt-4 pb-20 flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#e04a32] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 带渐变蒙版的小头像（BP状态区用）
  const MiniHero = ({ hero, onDoubleClick }) => (
    <div
      className="relative cursor-pointer group rounded overflow-hidden"
      onDoubleClick={onDoubleClick}
      title="双击取消选择"
      style={{ width: 44, height: 26 }}
    >
      <img src={`${CDN}${hero.img}`} alt={hero.name_cn} className="w-full h-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-black/80 to-transparent" />
      <span className="absolute bottom-0 inset-x-0 text-center text-[7px] text-white leading-tight pb-px truncate px-px">
        {hero.name_cn}
      </span>
    </div>
  );

  const SlotEmpty = ({ onClick }) => (
    <div
      className="rounded border border-dashed border-[#8b8fa3]/40 hover:border-[#8b8fa3]/80 transition-colors cursor-pointer"
      style={{ width: 44, height: 26 }}
      onClick={onClick}
    />
  );

  // 天辉
  const RadiantSection = () => {
    const isActive = mode === 'pick_radiant';
    return (
      <div
        className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${
          isActive ? 'bg-[#4ade80]/10 ring-2 ring-[#4ade80]/60' : 'bg-[#1a1d2e]'
        }`}
        onClick={() => setMode('pick_radiant')}
      >
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] font-bold" style={{ color: '#4ade80' }}>☀️ 天辉</span>
          <span className="text-[9px] text-[#8b8fa3]">{radiantPicks.length}/5</span>
          {isActive && <span className="text-[9px] text-[#4ade80] ml-auto">● 选择中</span>}
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}>
              {radiantPicks[i] ? (
                <MiniHero hero={radiantPicks[i]} onDoubleClick={(e) => { e.stopPropagation(); handleRemove(radiantPicks[i], 'radiant'); }} />
              ) : (
                <SlotEmpty onClick={() => setMode('pick_radiant')} />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 夜魇
  const DireSection = () => {
    const isActive = mode === 'pick_dire';
    return (
      <div
        className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${
          isActive ? 'bg-[#e04a32]/10 ring-2 ring-[#e04a32]/60' : 'bg-[#1a1d2e]'
        }`}
        onClick={() => setMode('pick_dire')}
      >
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] font-bold" style={{ color: '#e04a32' }}>🌙 夜魇</span>
          <span className="text-[9px] text-[#8b8fa3]">{direPicks.length}/5</span>
          {isActive && <span className="text-[9px] text-[#e04a32] ml-auto">● 选择中</span>}
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}>
              {direPicks[i] ? (
                <MiniHero hero={direPicks[i]} onDoubleClick={(e) => { e.stopPropagation(); handleRemove(direPicks[i], 'dire'); }} />
              ) : (
                <SlotEmpty onClick={() => setMode('pick_dire')} />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Ban
  const BanSection = () => {
    const isActive = mode === 'ban';
    return (
      <div
        className={`px-2 py-1.5 rounded-lg transition-all cursor-pointer ${
          isActive ? 'bg-[#6b7280]/10 ring-2 ring-[#6b7280]/60' : 'bg-[#1a1d2e]'
        }`}
        onClick={() => setMode('ban')}
      >
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] font-bold text-[#9ca3af]">🚫 Ban</span>
          <span className="text-[9px] text-[#8b8fa3]">{bans.length}</span>
          {isActive && <span className="text-[9px] text-[#9ca3af] ml-auto">● 选择中</span>}
        </div>
        {bans.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {bans.map(h => (
              <MiniHero key={h.hero_id} hero={h} onDoubleClick={(e) => { e.stopPropagation(); handleRemove(h, 'ban'); }} />
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5 items-center">
            {Array.from({ length: 3 }).map((_, i) => (
              <SlotEmpty key={i} onClick={() => setMode('ban')} />
            ))}
            <span className="text-[9px] text-[#8b8fa3]/50 ml-1">点击添加</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-2 pt-2 pb-20 max-w-2xl mx-auto">
      {/* 推荐英雄区 */}
      {mode !== 'ban' && (mode === 'pick_radiant' ? radiantPicks.length < 5 : direPicks.length < 5) && (
        <RecommendSection
          recs={currentRecs}
          loading={recLoading}
          mode={mode}
          rankTier={rankTier}
          selectedRecommendId={selectedRecommendId}
          setSelectedRecommendId={setSelectedRecommendId}
          selectedRecHero={selectedRecHero}
          handleSelect={handleSelect}
          handleBan={handleBanFromRecommend}
        />
      )}

      {/* BP 状态区 */}
      <div className="flex flex-col gap-1.5 mb-1.5">
        <RadiantSection />
        <DireSection />
        <BanSection />
      </div>

      <div className="text-[9px] text-[#8b8fa3] text-center mb-1.5">点击区域切换模式 · 双击头像取消</div>

      {/* 搜索框 */}
      <div className="relative mb-2">
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="搜索英雄（名称/昵称/拼音）"
          className="w-full bg-[#232638] text-[#e8e6e3] text-xs px-3 py-1.5 rounded-lg border border-[#8b8fa3]/20 focus:outline-none focus:border-[#4ade80]/50 placeholder-[#8b8fa3]"
        />
        {searchText && (
          <button
            onClick={() => setSearchText('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8b8fa3] text-sm leading-none hover:text-white"
          >
            ×
          </button>
        )}
      </div>

      {/* 英雄选择网格：名字嵌入头像内 */}
      {ATTR_GROUPS.map(group => {
        const groupHeroes = herosByAttr[group.key] || [];
        const visibleHeroes = groupHeroes.filter(h => matchesSearch(h));
        if (visibleHeroes.length === 0) return null;
        return (
          <div key={group.key} className="mb-2">
            <div className="text-[10px] font-bold text-[#e8e6e3] mb-1">
              {group.label}
              <span className="text-[#8b8fa3] font-normal ml-1">({visibleHeroes.length})</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {visibleHeroes.map(hero => {
                const isSelected = selectedIds.has(hero.hero_id);
                return (
                  <div
                    key={hero.hero_id}
                    className={`relative cursor-pointer rounded overflow-hidden ${
                      isSelected ? 'opacity-35 ring-1 ring-red-500' : 'hover:ring-1 hover:ring-white/30'
                    }`}
                    onClick={() => handleSelect(hero)}
                  >
                    <img
                      src={`${CDN}${hero.img}`}
                      alt={hero.name_cn}
                      className="w-full aspect-[16/9] object-cover"
                      loading="lazy"
                    />
                    {/* 黑色渐变蒙版 + 名字 */}
                    <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/85 to-transparent" />
                    <span className="absolute bottom-0 inset-x-0 text-center text-[8px] text-white leading-tight pb-[1px] truncate px-[1px]">
                      {hero.name_cn}
                    </span>
                    {isSelected && (
                      <div className="absolute inset-0 bg-red-900/30" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Recommend Section Component ─── */
function RecommendSection({ recs, loading, mode, rankTier, selectedRecommendId, setSelectedRecommendId, selectedRecHero, handleSelect, handleBan }) {
  const isRadiant = mode === 'pick_radiant';
  const title = isRadiant ? '☀️ 天辉推荐' : '🌙 夜魇推荐';
  const rankName = RANK_NAMES[rankTier] || '传奇';

  // Pad to 10 slots
  const slots = [...recs];
  while (slots.length < 10) slots.push(null);
  const row1 = slots.slice(0, 5);
  const row2 = slots.slice(5, 10);

  return (
    <div className="mb-1.5 rounded-lg bg-[#1e2135] border border-[#8b8fa3]/15 px-2 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-[#e8e6e3]">{title}</span>
        <span className="text-[9px] text-[#8b8fa3]">{rankName}</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-[#4ade80] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-1.5 mb-1.5">
            {row1.map((rec, i) => (
              <RecHeroSlot key={rec ? rec.hero_id : `e1-${i}`} rec={rec} selectedRecommendId={selectedRecommendId} setSelectedRecommendId={setSelectedRecommendId} handleSelect={handleSelect} handleBan={handleBan} />
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {row2.map((rec, i) => (
              <RecHeroSlot key={rec ? rec.hero_id : `e2-${i}`} rec={rec} selectedRecommendId={selectedRecommendId} setSelectedRecommendId={setSelectedRecommendId} handleSelect={handleSelect} handleBan={handleBan} />
            ))}
          </div>
          <div className="text-[8px] text-[#8b8fa3]/60 text-center mt-1">单击查看理由 · 双击Ban · 长按选择</div>
        </>
      )}
      {/* Reason panel */}
      {selectedRecHero && (
        <ReasonPanel hero={selectedRecHero} />
      )}
    </div>
  );
}

/* ─── Single Recommend Hero Slot ─── */
function RecHeroSlot({ rec, selectedRecommendId, setSelectedRecommendId, handleSelect, handleBan }) {
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
  const clickTimer = useRef(null);
  const clickCount = useRef(0);

  if (!rec) {
    return (
      <div className="rounded border border-dashed border-[#8b8fa3]/20 aspect-[16/9]" />
    );
  }

  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      handleSelect(rec);
    }, 500);
  };

  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleClick = (e) => {
    e.preventDefault();
    if (longPressed.current) { longPressed.current = false; return; }
    clickCount.current += 1;
    if (clickCount.current === 1) {
      clickTimer.current = setTimeout(() => {
        // single click
        if (clickCount.current === 1) {
          setSelectedRecommendId(prev => prev === rec.hero_id ? null : rec.hero_id);
        }
        clickCount.current = 0;
      }, 300);
    } else if (clickCount.current >= 2) {
      // double click
      clearTimeout(clickTimer.current);
      clickCount.current = 0;
      handleBan(rec);
    }
  };

  const isExpanded = selectedRecommendId === rec.hero_id;

  return (
    <div
      className={`relative cursor-pointer rounded overflow-hidden ${isExpanded ? 'ring-1 ring-[#4ade80]/60' : 'hover:ring-1 hover:ring-white/20'}`}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onClick={handleClick}
    >
      <img
        src={`${CDN}${rec.img}`}
        alt={rec.name_cn}
        className="w-full aspect-[16/9] object-cover"
        loading="lazy"
      />
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/85 to-transparent" />
      <span className="absolute bottom-0 inset-x-0 text-center text-[8px] text-white font-bold leading-tight pb-[1px]">
        {Math.round(rec.total_score)}
      </span>
    </div>
  );
}

/* ─── Reason Panel ─── */
function ReasonPanel({ hero }) {
  const scoreForType = (type) => {
    return hero.scores && hero.scores[type] != null ? hero.scores[type] : 0;
  };

  const barColor = (val) => {
    if (val > 70) return 'bg-[#4ade80]';
    if (val >= 40) return 'bg-[#facc15]';
    return 'bg-[#ef4444]';
  };

  return (
    <div className="mt-2 bg-[#171929] rounded-lg p-2 border border-[#8b8fa3]/10 animate-[fadeIn_0.2s_ease-out]">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div className="flex items-center gap-2 mb-2">
        <img src={`${CDN}${hero.img}`} alt={hero.name_cn} className="w-10 h-6 object-cover rounded" />
        <span className="text-[10px] text-[#e8e6e3] font-bold">{hero.name_cn}</span>
        <span className="text-[10px] text-[#4ade80] font-bold ml-auto">{Math.round(hero.total_score)}分</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {(hero.reasons || []).map((reason, i) => {
          const score = scoreForType(reason.type);
          const label = REASON_ICONS[reason.type] || reason.type;
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[8px] text-[#8b8fa3] w-[52px] shrink-0 truncate">{label}</span>
              <span className="text-[8px] text-[#c0bdb8] flex-1 truncate">{reason.text}</span>
              <div className="w-12 h-1.5 bg-[#2a2d42] rounded-full overflow-hidden shrink-0">
                <div className={`h-full rounded-full ${barColor(score)}`} style={{ width: `${Math.min(100, score)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
