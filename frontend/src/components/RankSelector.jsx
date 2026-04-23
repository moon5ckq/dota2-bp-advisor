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

export default function RankSelector({ value, onChange }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
      {RANKS.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`shrink-0 px-3 py-1.5 rounded text-xs font-medium transition-all ${
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
