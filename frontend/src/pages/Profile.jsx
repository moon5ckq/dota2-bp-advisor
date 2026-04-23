/**
 * Profile.jsx — 个人中心页
 * 
 * 本页面负责用户设置和账号管理，包括：
 * 1. 段位选择：设置当前段位（影响推荐权重和统计展示）
 * 2. 多账号管理：添加/删除 Dota2 账号（支持好友ID和 Steam64 ID 自动转换）
 * 3. 英雄池分析：展示每个账号最近200场的 TOP10 常用英雄及胜率
 * 
 * 所有设置持久化到 localStorage：
 * - dota2_rank_tier: 段位等级（1-8）
 * - dota2_player_ids: 玩家账号列表 JSON
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchPlayerProfile, fetchPlayerHeroPool, fetchDefaultDegrees } from '../api';
import DataFooter from '../components/DataFooter.jsx';

// Steam64 ID 基础偏移量，用于将 Steam64 ID 转换为 Dota2 好友 ID
const STEAM_ID_BASE = 76561197960265728n;

// localStorage 存储键
const LS_KEY = 'dota2_player_ids';       // 玩家ID列表
const RANK_LS_KEY = 'dota2_rank_tier';   // 段位设置
const DEGREES_LS_KEY = 'dota2_custom_degrees';

const STAGES = [
  { key: 'early', label: '早期', desc: '己方0-1人' },
  { key: 'mid', label: '中期', desc: '己方2人' },
  { key: 'mid_late', label: '中后期', desc: '己方3人' },
  { key: 'late', label: '后期', desc: '己方4人' },
];

const FALLBACK_DEGREES = {
  early: { hero: 50, team: 30, comp: 20 },
  mid: { hero: 25, team: 50, comp: 25 },
  mid_late: { hero: 15, team: 35, comp: 50 },
  late: { hero: 10, team: 30, comp: 60 },
};

// 段位配置列表
const RANKS = [
  { tier: 1, name: '先锋' },
  { tier: 2, name: '卫士' },
  { tier: 3, name: '中军' },
  { tier: 4, name: '统帅' },
  { tier: 5, name: '传奇' },
  { tier: 6, name: '万古' },
  { tier: 7, name: '超凡' },
  { tier: 8, name: '冠绝' },
];

/**
 * 从 localStorage 加载已保存的玩家列表
 */
function loadPlayers() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * 保存玩家列表到 localStorage
 */
function savePlayers(players) {
  localStorage.setItem(LS_KEY, JSON.stringify(players));
}

/**
 * 从 localStorage 加载段位设置
 */
function loadRank() {
  try {
    const v = localStorage.getItem(RANK_LS_KEY);
    const n = v ? parseInt(v, 10) : 5;
    return n >= 1 && n <= 8 ? n : 5;
  } catch { return 5; }
}

function loadDegrees() {
  try {
    const raw = localStorage.getItem(DEGREES_LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Dual-thumb slider: splits a bar into 3 colored segments */
function DualSlider({ hero, team, comp, onChange }) {
  const trackRef = useRef(null);
  const dragging = useRef(null); // 'left' | 'right' | null
  const MIN = 5;

  const getPos = useCallback((e) => {
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const handleMove = useCallback((e) => {
    if (!dragging.current) return;
    e.preventDefault();
    const pos = getPos(e);
    let h = hero, t = team, c = comp;
    if (dragging.current === 'left') {
      h = Math.round(Math.max(MIN, Math.min(100 - MIN - MIN, pos)));
      // keep right thumb (h+t) stable if possible
      const rightEdge = hero + team;
      t = Math.max(MIN, rightEdge - h);
      c = 100 - h - t;
      if (c < MIN) { c = MIN; t = 100 - h - c; }
      if (t < MIN) { t = MIN; h = 100 - t - c; }
    } else {
      // right thumb at hero+team position
      const rightPos = Math.round(Math.max(hero + MIN, Math.min(100 - MIN, pos)));
      t = rightPos - hero;
      if (t < MIN) t = MIN;
      c = 100 - hero - t;
      if (c < MIN) { c = MIN; t = 100 - hero - c; }
      h = hero; // hero stays
    }
    onChange(h, t, c);
  }, [hero, team, comp, getPos, onChange]);

  const handleEnd = useCallback(() => { dragging.current = null; }, []);

  useEffect(() => {
    const onMove = (e) => handleMove(e);
    const onEnd = () => handleEnd();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [handleMove, handleEnd]);

  const leftPos = hero;
  const rightPos = hero + team;

  return (
    <div className="relative" style={{ height: 30 }}>
      {/* Track */}
      <div ref={trackRef} className="absolute top-[2px] left-0 right-0 h-2 rounded-full overflow-hidden" style={{ background: '#232638' }}>
        <div className="absolute h-full" style={{ left: 0, width: `${leftPos}%`, background: '#3b82f6' }} />
        <div className="absolute h-full" style={{ left: `${leftPos}%`, width: `${team}%`, background: '#ef4444' }} />
        <div className="absolute h-full" style={{ left: `${rightPos}%`, width: `${comp}%`, background: '#22c55e' }} />
      </div>
      {/* Left thumb */}
      <div
        className="absolute top-[-2px] w-[16px] h-[16px] rounded-full border-2 border-white cursor-grab active:scale-110 z-10"
        style={{ left: `calc(${leftPos}% - 8px)`, background: '#3b82f6', touchAction: 'none' }}
        onMouseDown={() => { dragging.current = 'left'; }}
        onTouchStart={() => { dragging.current = 'left'; }}
      />
      {/* Right thumb */}
      <div
        className="absolute top-[-2px] w-[16px] h-[16px] rounded-full border-2 border-white cursor-grab active:scale-110 z-10"
        style={{ left: `calc(${rightPos}% - 8px)`, background: '#22c55e', touchAction: 'none' }}
        onMouseDown={() => { dragging.current = 'right'; }}
        onTouchStart={() => { dragging.current = 'right'; }}
      />
      {/* Percentage labels - below track */}
      <div className="absolute top-[16px] text-[9px] font-medium" style={{ left: `${leftPos / 2}%`, transform: 'translateX(-50%)', color: '#3b82f6' }}>{hero}%</div>
      <div className="absolute top-[16px] text-[9px] font-medium" style={{ left: `${leftPos + team / 2}%`, transform: 'translateX(-50%)', color: '#ef4444' }}>{team}%</div>
      <div className="absolute top-[16px] text-[9px] font-medium" style={{ left: `${rightPos + comp / 2}%`, transform: 'translateX(-50%)', color: '#22c55e' }}>{comp}%</div>
    </div>
  );
}

function WeightEditor() {
  const [degrees, setDegrees] = useState(() => loadDegrees() || { ...FALLBACK_DEGREES });

  const saveDegrees = (d) => {
    setDegrees(d);
    localStorage.setItem(DEGREES_LS_KEY, JSON.stringify(d));
  };

  const handleChange = (stageKey, hero, team, comp) => {
    saveDegrees({ ...degrees, [stageKey]: { hero, team, comp } });
  };

  const handleReset = async () => {
    try {
      const defaults = await fetchDefaultDegrees();
      saveDegrees(defaults);
    } catch {
      saveDegrees({ ...FALLBACK_DEGREES });
    }
    localStorage.removeItem(DEGREES_LS_KEY);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium" style={{ color: '#8b8fa3' }}>⚖️ 推荐权重</div>
        <button onClick={handleReset} className="text-[10px] px-2 py-0.5 rounded" style={{ color: '#8b8fa3', background: '#1a1d2e' }}>恢复默认</button>
      </div>
      <div className="rounded-lg px-3 py-2 space-y-1" style={{ background: '#1a1d2e' }}>
        {/* 图例+说明 */}
        <div className="flex justify-center gap-3 pb-1 border-b border-[#232638]">
          <span className="text-[9px]" style={{ color: '#3b82f6' }}>🔵 英雄度(熟练+胜率)</span>
          <span className="text-[9px]" style={{ color: '#ef4444' }}>🔴 团队度(克制+配合)</span>
          <span className="text-[9px]" style={{ color: '#22c55e' }}>🟢 补位度(位置+能力)</span>
        </div>
        {STAGES.map(s => {
          const d = degrees[s.key] || FALLBACK_DEGREES[s.key];
          return (
            <div key={s.key}>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium" style={{ color: '#e8e6e3', minWidth: 36 }}>{s.label}</span>
                <span className="text-[9px]" style={{ color: '#6b7280' }}>{s.desc}</span>
              </div>
              <DualSlider hero={d.hero} team={d.team} comp={d.comp} onChange={(h, t, c) => handleChange(s.key, h, t, c)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Profile() {
  // ── 状态定义 ──
  const [players, setPlayers] = useState(loadPlayers);      // 已绑定的玩家列表
  const [rankTier, setRankTier] = useState(loadRank);       // 当前段位设置
  const [input, setInput] = useState('');                    // ID 输入框内容
  const [adding, setAdding] = useState(false);              // 添加中状态
  const [addError, setAddError] = useState('');             // 添加错误信息
  const [selectedId, setSelectedId] = useState(null);       // 当前展开查看英雄池的玩家ID
  const [heroPool, setHeroPool] = useState(null);           // 英雄池数据
  const [poolLoading, setPoolLoading] = useState(false);    // 英雄池加载状态
  const [poolError, setPoolError] = useState('');           // 英雄池加载错误

  // 玩家列表变化时自动保存到 localStorage
  useEffect(() => { savePlayers(players); }, [players]);
  // 段位变化时自动保存到 localStorage
  useEffect(() => { localStorage.setItem(RANK_LS_KEY, String(rankTier)); }, [rankTier]);

  /**
   * 将用户输入的ID转换为 Dota2 好友 ID
   * 支持两种格式：
   * - 纯数字（好友ID）：直接使用
   * - 17位以上大数字（Steam64 ID）：减去 STEAM_ID_BASE 转换为好友ID
   */
  function convertId(raw) {
    const trimmed = raw.trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) return null;
    const n = BigInt(trimmed);
    if (trimmed.length >= 17 && n > STEAM_ID_BASE) {
      return Number(n - STEAM_ID_BASE);
    }
    return Number(n);
  }

  /**
   * 添加新账号：转换ID → 检查重复 → 调用 API 获取玩家信息 → 保存
   */
  async function handleAdd() {
    setAddError('');
    const id = convertId(input);
    if (!id || id <= 0) { setAddError('请输入有效的 Dota2 好友 ID'); return; }
    if (players.some(p => p.account_id === id)) { setAddError('该 ID 已添加'); return; }
    setAdding(true);
    try {
      const profile = await fetchPlayerProfile(id);
      setPlayers(prev => [...prev, profile]);
      setInput('');
    } catch {
      setAddError('无法获取该玩家信息，请检查 ID');
    } finally { setAdding(false); }
  }

  /**
   * 删除已绑定的账号
   */
  function handleRemove(id) {
    setPlayers(prev => prev.filter(p => p.account_id !== id));
    if (selectedId === id) { setSelectedId(null); setHeroPool(null); }
  }

  /**
   * 选择/取消选择玩家卡片，展开时加载英雄池数据
   */
  async function handleSelect(id) {
    if (selectedId === id) { setSelectedId(null); setHeroPool(null); return; }
    setSelectedId(id);
    setHeroPool(null);
    setPoolError('');
    setPoolLoading(true);
    try {
      const data = await fetchPlayerHeroPool(id);
      if (data.error === 'no_data') {
        setPoolError(data.message || '该账号未公开比赛数据');
        setHeroPool(null);
      } else {
        setHeroPool(data);
      }
    } catch {
      setPoolError('加载失败，请稍后重试');
    } finally { setPoolLoading(false); }
  }

  /**
   * 根据胜率返回对应颜色：>=55% 绿色 / <45% 红色 / 其他白色
   */
  function winRateColor(rate) {
    if (rate >= 55) return '#4ade80';
    if (rate < 45) return '#e04a32';
    return '#e8e6e3';
  }

  return (
    <div className="px-3 pt-3 pb-20" style={{ background: '#0f1118', minHeight: '100vh' }}>
      {/* 段位选择器 */}
      <div className="mb-4">
        <div className="text-xs font-medium mb-2" style={{ color: '#8b8fa3' }}>我的段位</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {RANKS.map(r => (
            <button
              key={r.tier}
              onClick={() => setRankTier(r.tier)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0"
              style={{
                background: rankTier === r.tier ? '#e04a3222' : '#1a1d2e',
                border: rankTier === r.tier ? '1px solid #e04a32' : '1px solid #232638',
                color: rankTier === r.tier ? '#e04a32' : '#8b8fa3',
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {/* 权重自定义 */}
      <WeightEditor />

      {/* 账号ID输入区 */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !adding && handleAdd()}
          placeholder="输入 Dota2 好友 ID"
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: '#1a1d2e', color: '#e8e6e3', border: '1px solid #232638' }}
        />
        <button
          onClick={handleAdd}
          disabled={adding}
          className="px-4 py-2 rounded-lg text-sm font-medium shrink-0"
          style={{
            background: adding ? '#232638' : '#e04a32',
            color: '#e8e6e3',
            opacity: adding ? 0.6 : 1,
          }}
        >
          {adding ? '...' : '添加'}
        </button>
      </div>
      {addError && <p className="text-xs mb-2" style={{ color: '#e04a32' }}>{addError}</p>}

      {/* 玩家列表 */}
      {players.length === 0 ? (
        // 空状态提示
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🎮</div>
          <p className="text-sm" style={{ color: '#8b8fa3' }}>
            添加你的 Dota2 好友 ID，查看英雄池分析
          </p>
          <p className="text-xs mt-2" style={{ color: '#8b8fa355' }}>
            Steam 个人主页 URL 末尾的数字，或好友 ID
          </p>
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {players.map(p => (
            <div key={p.account_id}>
              {/* 玩家卡片：头像 + 昵称 + ID + 删除按钮 */}
              <div
                onClick={() => handleSelect(p.account_id)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                style={{
                  background: selectedId === p.account_id ? '#232638' : '#1a1d2e',
                  border: selectedId === p.account_id ? '1px solid #e04a3266' : '1px solid transparent',
                }}
              >
                <img
                  src={p.avatar}
                  alt=""
                  className="w-8 h-8 rounded-full shrink-0"
                  style={{ background: '#232638' }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: '#e8e6e3' }}>
                    {p.personaname}
                  </div>
                  <div className="text-xs" style={{ color: '#8b8fa3' }}>ID: {p.account_id}</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleRemove(p.account_id); }}
                  className="text-xs px-2 py-1 rounded shrink-0"
                  style={{ color: '#8b8fa3', background: '#0f1118' }}
                >
                  删除
                </button>
              </div>

              {/* 英雄池展开面板（选中该玩家时显示） */}
              {selectedId === p.account_id && (
                <div className="mt-1 rounded-lg px-3 py-3" style={{ background: '#1a1d2e' }}>
                  {/* 加载状态 */}
                  {poolLoading && (
                    <div className="text-center py-6">
                      <div className="text-sm" style={{ color: '#8b8fa3' }}>正在加载...</div>
                    </div>
                  )}
                  {/* 错误状态 */}
                  {poolError && (
                    <div className="text-center py-4">
                      <p className="text-xs leading-relaxed" style={{ color: '#e04a32' }}>
                        {poolError.includes('未公开')
                          ? '该账号未公开比赛数据，请在 Dota2 游戏内设置 → 社交 → 勾选「公开比赛数据」后等待几分钟再试'
                          : poolError}
                      </p>
                    </div>
                  )}
                  {/* 英雄池数据展示 */}
                  {heroPool && (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium" style={{ color: '#e8e6e3' }}>
                          最近 200 场常用英雄 TOP10
                        </span>
                        <span className="text-xs" style={{ color: '#8b8fa3' }}>
                          共 {heroPool.total_matches} 场
                        </span>
                      </div>
                      {/* 英雄池列表 */}
                      <div className="space-y-1">
                        {heroPool.heroes.map((h, i) => (
                          <div
                            key={h.hero_id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded"
                            style={{ background: '#232638' }}
                          >
                            {/* 排名序号 */}
                            <span className="text-xs w-4 text-center shrink-0" style={{ color: '#8b8fa3' }}>
                              {i + 1}
                            </span>
                            {/* 英雄头像 */}
                            <img
                              src={h.img ? `https://cdn.cloudflare.steamstatic.com${h.img}` : ''}
                              alt=""
                              className="h-5 rounded shrink-0"
                              style={{ aspectRatio: '16/9', objectFit: 'cover', background: '#1a1d2e' }}
                              onError={e => { e.target.style.display = 'none'; }}
                            />
                            {/* 英雄中文名 */}
                            <span className="text-xs flex-1 truncate" style={{ color: '#e8e6e3' }}>
                              {h.name_cn}
                            </span>
                            {/* 场次 */}
                            <span className="text-xs shrink-0" style={{ color: '#8b8fa3' }}>
                              {h.games}场
                            </span>
                            {/* 胜率进度条 + 数值 */}
                            <div className="w-16 shrink-0 flex items-center gap-1">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#0f1118' }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${h.win_rate}%`,
                                    background: winRateColor(h.win_rate),
                                    opacity: 0.7,
                                  }}
                                />
                              </div>
                              <span className="text-xs w-9 text-right" style={{ color: winRateColor(h.win_rate) }}>
                                {h.win_rate}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <DataFooter />
    </div>
  );
}
