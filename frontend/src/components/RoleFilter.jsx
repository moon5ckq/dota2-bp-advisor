/**
 * RoleFilter.jsx — 角色筛选器组件
 * 
 * 横向滚动的角色标签按钮组，用于首页按英雄角色筛选。
 * 选中的角色按钮高亮为金色（Dota2 风格）。
 * 
 * 角色对应 OpenDota API 返回的 roles 字段中的值。
 */

// 角色筛选配置：key 为空字符串表示"全部"
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

/**
 * @param {string} value - 当前选中的角色 key
 * @param {function} onChange - 角色切换回调
 */
export default function RoleFilter({ value, onChange }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
      {ROLES.map((role) => (
        <button
          key={role.key}
          onClick={() => onChange(role.key)}
          className={`shrink-0 px-3.5 py-2 rounded text-sm font-medium transition-all ${
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
