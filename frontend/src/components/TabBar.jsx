const tabs = [
  { id: 'home', label: '首页', icon: '🏠' },
  { id: 'bp', label: 'BP分析', icon: '📊' },
  { id: 'me', label: '我的', icon: '👤' },
];

export default function TabBar({ active, onChange }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1d2e]/95 backdrop-blur border-t border-white/5 safe-bottom">
      <div className="max-w-7xl mx-auto flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex-1 flex flex-col items-center py-1 text-[10px] transition-colors ${
              active === tab.id ? 'text-[#e04a32]' : 'text-[#8b8fa3]'
            }`}
          >
            <span className="text-sm mb-0">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
