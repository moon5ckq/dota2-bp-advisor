/**
 * Navbar.jsx — 顶部导航栏组件
 * 
 * 固定在页面顶部的导航栏，包含：
 * - 应用标题和图标
 * - 「同步数据」按钮：点击后从 OpenDota API 同步最新英雄数据到本地数据库
 * 
 * 使用 sticky 定位和 backdrop-blur 实现半透明毛玻璃效果
 */

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-[#1a1d2e]/95 backdrop-blur border-b border-white/5">
      <div className="max-w-7xl mx-auto px-3 h-10 flex items-center justify-between">
        {/* 应用标题 */}
        <div className="flex items-center gap-1.5">
          <span className="text-base font-bold text-[#e04a32]">⚔️</span>
          <span className="text-sm font-bold tracking-tight">Dota2 BP Advisor</span>
        </div>
        {/* 同步数据按钮：触发 /api/sync/heroes 接口 */}
        <button
          className="text-[10px] bg-[#e04a32] hover:bg-[#c7392a] text-white px-2 py-1 rounded font-medium transition-colors"
          onClick={async () => {
            try {
              const { syncHeroes } = await import('../api/index.js');
              const r = await syncHeroes();
              alert(`同步完成: ${r.heroes_count} 英雄, ${r.stats_count} 条统计`);
              window.location.reload(); // 刷新页面以展示最新数据
            } catch {
              alert('同步失败，请稍后重试');
            }
          }}
        >
          同步数据
        </button>
      </div>
    </nav>
  );
}
