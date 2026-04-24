/**
 * Navbar.jsx — 顶部导航栏组件
 * 
 * 固定在页面顶部的导航栏，显示应用标题和图标
 * 使用 sticky 定位和 backdrop-blur 实现半透明毛玻璃效果
 */

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-[#1a1d2e]/95 backdrop-blur border-b border-white/5">
      <div className="px-4 h-11 flex items-center">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-[#e04a32]">⚔️</span>
          <span className="text-base font-bold tracking-tight">Dota2 BP Advisor</span>
        </div>
      </div>
    </nav>
  );
}
