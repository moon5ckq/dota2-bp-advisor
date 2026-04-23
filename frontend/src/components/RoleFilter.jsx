const ROLES = [
  { key: '', label: '全部' },
  { key: 'Carry', label: '核心' },
  { key: 'Support', label: '辅助' },
  { key: 'Nuker', label: '爆发' },
  { key: 'Disabler', label: '控制' },
  { key: 'Durable', label: '肉盾' },
  { key: 'Escape', label: '逃生' },
  { key: 'Pusher', label: '推进' },
  { key: 'Initiator', label: '先手' },
];

export default function RoleFilter({ value, onChange }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
      {ROLES.map((role) => (
        <button
          key={role.key}
          onClick={() => onChange(role.key)}
          className={`shrink-0 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            value === role.key
              ? 'bg-[#f5c542] text-[#0f1118]'
              : 'bg-[#232638] text-[#8b8fa3] hover:bg-[#2d3048]'
          }`}
        >
          {role.label}
        </button>
      ))}
    </div>
  );
}
