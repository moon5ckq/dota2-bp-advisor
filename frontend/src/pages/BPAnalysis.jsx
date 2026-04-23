/**
 * BPAnalysis.jsx — BP 分析页面（核心功能页）
 * 
 * 本页面是 Dota2 BP Advisor 的主要功能页，负责：
 * 1. 英雄选择：支持三种模式（天辉 Pick / 夜魇 Pick / Ban）
 * 2. 推荐引擎：根据当前 BP 状态实时计算 TOP10 推荐英雄
 * 3. 理由面板：展示每个推荐英雄的6维度评分和推荐理由
 * 4. 英雄搜索：支持中英文名、昵称、拼音模糊搜索
 * 5. 英雄按属性分组展示（力量/敏捷/智力/全才）
 * 
 * 交互方式：
 * - 点击英雄头像：添加到当前模式（Pick 或 Ban）
 * - 双击 BP 区域的英雄：取消选择
 * - 推荐区：单击查看理由 / 双击 Ban / 长按选择
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fetchHeroAliases, fetchRecommend } from '../api';
import DataFooter from '../components/DataFooter.jsx';

// Steam CDN 基础地址，用于加载英雄头像图片
const CDN = 'https://cdn.cloudflare.steamstatic.com';

// 英雄属性分组配置
const ATTR_GROUPS = [
  { key: 'str', label: '💪 力量' },
  { key: 'agi', label: '🏹 敏捷' },
  { key: 'int', label: '🧠 智力' },
  { key: 'all', label: '⭐ 全才' },
];

// 段位等级名称映射
const RANK_NAMES = {
  1: '先锋', 2: '卫士', 3: '中军', 4: '统帅',
  5: '传奇', 6: '万古', 7: '超凡', 8: '冠绝',
};

// 推荐理由类型对应的图标和中文标签
const REASON_ICONS = {
  counter: '⚔️ 克制',
  meta: '📊 段位',
  position: '📍 位置',
  capability: '🛡️ 能力',
  synergy: '🤝 配合',
  personal: '👤 个人',
};

export default function BPAnalysis() {
  // ── 状态定义 ──
  const [heroes, setHeroes] = useState([]);                    // 英雄别名数据列表
  const [loading, setLoading] = useState(true);                // 英雄数据加载状态
  const [mode, setMode] = useState('pick_radiant');            // 当前操作模式：pick_radiant / pick_dire / ban
  const [bans, setBans] = useState([]);                        // 已 Ban 英雄列表
  const [radiantPicks, setRadiantPicks] = useState([]);        // 天辉已选英雄列表
  const [direPicks, setDirePicks] = useState([]);              // 夜魇已选英雄列表
  const [searchText, setSearchText] = useState('');            // 搜索框文本
  const [recommendations, setRecommendations] = useState({ radiant: [], dire: [] }); // 推荐结果
  const [recLoading, setRecLoading] = useState(false);         // 推荐加载状态
  const [selectedRecommendId, setSelectedRecommendId] = useState(null); // 当前展开查看理由的推荐英雄ID

  // 页面加载时获取英雄别名数据
  useEffect(() => {
    fetchHeroAliases()
      .then(setHeroes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 已选中的英雄ID集合（用于禁用已选英雄的点击）
  const selectedIds = useMemo(() => {
    const ids = new Set();
    bans.forEach(h => ids.add(h.hero_id));
    radiantPicks.forEach(h => ids.add(h.hero_id));
    direPicks.forEach(h => ids.add(h.hero_id));
    return ids;
  }, [bans, radiantPicks, direPicks]);

  // ── 推荐 API 调用（防抖 + 自动重试） ──
  const debounceRef = useRef(null);      // 防抖定时器
  const retryRef = useRef(null);         // 重试定时器
  const retryCountRef = useRef(0);       // 当前重试次数

  /**
   * 发起推荐请求，失败时自动重试（最多2次）
   */
  const doFetchRecommend = (data) => {
    setRecLoading(true);
    fetchRecommend(data)
      .then(res => {
        if (res && (res.radiant?.length || res.dire?.length)) {
          setRecommendations(res);
          retryCountRef.current = 0;
        }
        // API 返回空结果时保留旧推荐，不清空
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

  // BP 状态变化时，300ms 防抖后触发推荐请求
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (retryRef.current) clearTimeout(retryRef.current);
    retryCountRef.current = 0;

    debounceRef.current = setTimeout(() => {
      // 从 localStorage 读取段位设置
      let rankTier = 5;
      try { rankTier = parseInt(localStorage.getItem('dota2_rank_tier')) || 5; } catch {}
      // 从 localStorage 读取绑定的玩家ID列表
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

  /**
   * 英雄搜索匹配：支持中文名、英文名、别名模糊搜索
   */
  const matchesSearch = (hero) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    if (hero.name_cn.toLowerCase().includes(q)) return true;
    if (hero.name_en.toLowerCase().includes(q)) return true;
    return hero.aliases.some(a => a.toLowerCase().includes(q));
  };

  /**
   * 处理英雄选择（根据当前模式添加到对应列表）
   */
  const handleSelect = useCallback((hero) => {
    if (selectedIds.has(hero.hero_id)) return; // 已选中的英雄不可重复选择
    if (mode === 'ban') {
      setBans(prev => [...prev, hero]);
    } else if (mode === 'pick_radiant') {
      if (radiantPicks.length >= 5) return; // 天辉最多5人
      setRadiantPicks(prev => [...prev, hero]);
    } else {
      if (direPicks.length >= 5) return; // 夜魇最多5人
      setDirePicks(prev => [...prev, hero]);
    }
  }, [selectedIds, mode, radiantPicks.length, direPicks.length]);

  /**
   * 从推荐区域 Ban 英雄（双击推荐英雄触发）
   */
  const handleBanFromRecommend = useCallback((hero) => {
    if (selectedIds.has(hero.hero_id)) return;
    setBans(prev => [...prev, hero]);
  }, [selectedIds]);

  /**
   * 从 BP 状态区域移除英雄（双击已选英雄触发）
   */
  const handleRemove = (hero, list) => {
    if (list === 'ban') setBans(prev => prev.filter(h => h.hero_id !== hero.hero_id));
    else if (list === 'radiant') setRadiantPicks(prev => prev.filter(h => h.hero_id !== hero.hero_id));
    else setDirePicks(prev => prev.filter(h => h.hero_id !== hero.hero_id));
  };

  // 按属性分组英雄（力量/敏捷/智力/全才）
  const herosByAttr = useMemo(() => {
    const map = { str: [], agi: [], int: [], all: [] };
    heroes.forEach(h => {
      const attr = map[h.primary_attr] ? h.primary_attr : 'all';
      map[attr].push(h);
    });
    return map;
  }, [heroes]);

  // 当前模式对应的推荐列表（过滤已选英雄，最多10个）
  const currentRecs = useMemo(() => {
    if (mode === 'ban') return []; // Ban 模式不显示推荐
    // 当前阵营已满5人则不推荐
    if (mode === 'pick_radiant' && radiantPicks.length >= 5) return [];
    if (mode === 'pick_dire' && direPicks.length >= 5) return [];
    const list = mode === 'pick_radiant' ? recommendations.radiant : recommendations.dire;
    if (!list) return [];
    return list.filter(r => !selectedIds.has(r.hero_id)).slice(0, 10);
  }, [mode, recommendations, selectedIds]);

  // 当前选中查看理由的推荐英雄数据
  const selectedRecHero = useMemo(() => {
    if (!selectedRecommendId) return null;
    return currentRecs.find(r => r.hero_id === selectedRecommendId) || null;
  }, [selectedRecommendId, currentRecs]);

  // 切换模式时重置选中的推荐英雄
  useEffect(() => { setSelectedRecommendId(null); }, [mode]);

  // 从 localStorage 读取段位设置（用于推荐区显示）
  const rankTier = useMemo(() => {
    try { return parseInt(localStorage.getItem('dota2_rank_tier')) || 5; } catch { return 5; }
  }, []);

  // 加载中显示转圈动画
  if (loading) {
    return (
      <div className="px-4 pt-4 pb-20 flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#e04a32] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── 内部子组件 ──

  /**
   * MiniHero: 带渐变蒙版的小头像组件（BP 状态区域用）
   * 双击可取消选择
   */
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

  /**
   * SlotEmpty: 空槽位占位组件（虚线边框）
   */
  const SlotEmpty = ({ onClick }) => (
    <div
      className="rounded border border-dashed border-[#8b8fa3]/40 hover:border-[#8b8fa3]/80 transition-colors cursor-pointer"
      style={{ width: 44, height: 26 }}
      onClick={onClick}
    />
  );

  /**
   * RadiantSection: 天辉阵营 Pick 区域
   * 点击切换到天辉选择模式，显示已选英雄和空槽位
   */
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

  /**
   * DireSection: 夜魇阵营 Pick 区域
   */
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

  /**
   * BanSection: Ban 区域
   * 显示已 Ban 英雄列表，无数量限制
   */
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

  // ── 页面渲染 ──
  return (
    <div className="px-2 pt-2 pb-20 max-w-2xl mx-auto">
      {/* 推荐英雄区（仅在 Pick 模式且阵营未满时显示） */}
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

      {/* BP 状态区（天辉 / 夜魇 / Ban） */}
      <div className="flex flex-col gap-1.5 mb-1.5">
        <RadiantSection />
        <DireSection />
        <BanSection />
      </div>

      <div className="text-[9px] text-[#8b8fa3] text-center mb-1.5">点击区域切换模式 · 双击头像取消</div>

      {/* 英雄搜索框 */}
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

      {/* 英雄选择网格：按属性分组，英雄名嵌入头像内 */}
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
                    {/* 底部黑色渐变蒙版 + 英雄中文名 */}
                    <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/85 to-transparent" />
                    <span className="absolute bottom-0 inset-x-0 text-center text-[8px] text-white leading-tight pb-[1px] truncate px-[1px]">
                      {hero.name_cn}
                    </span>
                    {/* 已选中的英雄覆盖红色蒙版 */}
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
      <DataFooter />
    </div>
  );
}

/**
 * RecommendSection: 推荐英雄区域组件
 * 
 * 显示 TOP10 推荐英雄（分2行5列），支持：
 * - 单击查看推荐理由
 * - 双击 Ban 该英雄
 * - 长按选择该英雄
 */
function RecommendSection({ recs, loading, mode, rankTier, selectedRecommendId, setSelectedRecommendId, selectedRecHero, handleSelect, handleBan }) {
  const isRadiant = mode === 'pick_radiant';
  const title = isRadiant ? '☀️ 天辉推荐' : '🌙 夜魇推荐';
  const rankName = RANK_NAMES[rankTier] || '传奇';

  // 补齐到10个槽位
  const slots = [...recs];
  while (slots.length < 10) slots.push(null);
  const row1 = slots.slice(0, 5);   // 第一行（TOP 1-5）
  const row2 = slots.slice(5, 10);  // 第二行（TOP 6-10）

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
          {/* 推荐英雄网格（2行5列） */}
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
      {/* 推荐理由面板（选中某个推荐英雄时显示） */}
      {selectedRecHero && (
        <ReasonPanel hero={selectedRecHero} />
      )}
    </div>
  );
}

/**
 * RecHeroSlot: 单个推荐英雄槽位组件
 * 
 * 实现三种交互手势：
 * - 单击（<300ms）：展开/收起理由面板
 * - 双击（300ms内两次点击）：Ban 该英雄
 * - 长按（>500ms）：选择该英雄到当前阵营
 */
function RecHeroSlot({ rec, selectedRecommendId, setSelectedRecommendId, handleSelect, handleBan }) {
  const pressTimer = useRef(null);    // 长按计时器
  const longPressed = useRef(false);  // 是否触发了长按
  const clickTimer = useRef(null);    // 双击判定计时器
  const clickCount = useRef(0);       // 连续点击次数

  // 空槽位渲染
  if (!rec) {
    return (
      <div className="rounded border border-dashed border-[#8b8fa3]/20 aspect-[16/9]" />
    );
  }

  // 开始按压（长按检测）
  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      handleSelect(rec); // 长按500ms触发选择
    }, 500);
  };

  // 结束按压
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  // 点击处理（区分单击和双击）
  const handleClick = (e) => {
    e.preventDefault();
    if (longPressed.current) { longPressed.current = false; return; } // 长按后不触发点击
    clickCount.current += 1;
    if (clickCount.current === 1) {
      clickTimer.current = setTimeout(() => {
        // 单击：切换理由面板显示
        if (clickCount.current === 1) {
          setSelectedRecommendId(prev => prev === rec.hero_id ? null : rec.hero_id);
        }
        clickCount.current = 0;
      }, 300);
    } else if (clickCount.current >= 2) {
      // 双击：Ban 该英雄
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
      {/* 底部渐变蒙版 + 总分 */}
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/85 to-transparent" />
      <span className="absolute bottom-0 inset-x-0 text-center text-[8px] text-white font-bold leading-tight pb-[1px]">
        {Math.round(rec.total_score)}
      </span>
    </div>
  );
}

/**
 * ReasonPanel: 推荐理由面板组件
 * 
 * 展示选中推荐英雄的6维度评分详情：
 * - 每个维度显示图标标签、理由文字和评分进度条
 * - 进度条颜色根据分数变化：>70绿色 / 40-70黄色 / <40红色
 */
function ReasonPanel({ hero }) {
  /**
   * 获取指定维度的评分
   */
  const scoreForType = (type) => {
    return hero.scores && hero.scores[type] != null ? hero.scores[type] : 0;
  };

  /**
   * 根据分数返回进度条颜色
   */
  const barColor = (val) => {
    if (val > 70) return 'bg-[#4ade80]';   // 高分：绿色
    if (val >= 40) return 'bg-[#facc15]';  // 中等：黄色
    return 'bg-[#ef4444]';                  // 低分：红色
  };

  return (
    <div className="mt-2 bg-[#171929] rounded-lg p-2 border border-[#8b8fa3]/10 animate-[fadeIn_0.2s_ease-out]">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {/* 英雄头像 + 名称 + 总分 */}
      <div className="flex items-center gap-2 mb-2">
        <img src={`${CDN}${hero.img}`} alt={hero.name_cn} className="w-10 h-6 object-cover rounded" />
        <span className="text-[10px] text-[#e8e6e3] font-bold">{hero.name_cn}</span>
        <span className="text-[10px] text-[#4ade80] font-bold ml-auto">{Math.round(hero.total_score)}分</span>
      </div>
      {/* 6维度理由列表 */}
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
