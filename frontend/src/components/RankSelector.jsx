/**
 * RankSelector.jsx — 段位选择器组件
 * 
 * 横向滚动的段位按钮组，用于首页按段位筛选英雄胜率数据。
 * 选中的段位按钮高亮为 Dota2 红色主题。
 */

// 段位配置：value 对应后端的 rank_tier 参数
const RANKS = [
  { value: 1, label: '先锋' },
  { value: 2, label: '卫士' },
  { value: 3, label: '中军' },
  { value: 4, label: '传奇' },
  { value: 5, label: '万古' },
  { value: 6, label: '超凡' },
  { value: 7, label: '冠绝' },
  { value: 8, label: '万古以上' },
];

/**
 * @param {number} value - 当前选中的段位值
 * @param {function} onChange - 段位切换回调
 */
export default function RankSelector({ value, onChange }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
      {RANKS.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`shrink-0 px-3.5 py-2 rounded text-sm font-medium transition-all ${
            value === r.value
              ? 'bg-[#e04a32] text-white shadow-lg shadow-[#e04a32]/20'
              : 'bg-[#232638] text-[#8b8fa3] hover:bg-[#2d3048]'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
