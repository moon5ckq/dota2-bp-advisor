/**
 * HeroCard.jsx — 英雄卡片组件
 * 
 * 首页英雄排行榜中的单个英雄展示卡片，包含：
 * - 英雄头像（Steam CDN 加载，支持懒加载）
 * - 中文名和英文名
 * - 胜率（绿色>53%，红色<47%，白色介于之间）
 * - 场次统计
 * 
 * 鼠标悬停时显示 Dota2 红色边框效果和图片放大动画
 */

// Steam CDN 基础地址
const CDN = 'https://cdn.cloudflare.steamstatic.com';

/**
 * @param {Object} hero - 英雄数据（含 img, cn_name, localized_name, win_rate, picks）
 */
export default function HeroCard({ hero }) {
  const imgUrl = hero.img ? `${CDN}${hero.img}` : '';
  const displayName = hero.cn_name || hero.localized_name;
  const winRate = hero.win_rate != null ? hero.win_rate.toFixed(1) : '--';
  const picks = hero.picks != null ? hero.picks.toLocaleString() : '--';

  // 胜率颜色：高胜率绿色，低胜率红色
  const winColor =
    hero.win_rate >= 53 ? 'text-green-400' : hero.win_rate < 47 ? 'text-red-400' : 'text-[#e8e6e3]';

  return (
    <div className="bg-[#232638] rounded-lg overflow-hidden hover:ring-1 hover:ring-[#e04a32]/50 transition-all group">
      {/* 英雄头像区域 */}
      <div className="relative aspect-[16/9] overflow-hidden bg-[#1a1d2e]">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#8b8fa3] text-xs">
            无图片
          </div>
        )}
        {/* 底部渐变蒙版，使文字区域过渡自然 */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#232638] via-transparent to-transparent" />
      </div>
      {/* 英雄信息区域 */}
      <div className="p-2.5">
        <div className="font-semibold text-sm truncate mb-0.5">{displayName}</div>
        <div className="text-[10px] text-[#8b8fa3] truncate mb-1.5">{hero.localized_name}</div>
        <div className="flex justify-between text-xs">
          <span className={winColor}>胜率 {winRate}%</span>
          <span className="text-[#8b8fa3]">{picks}场</span>
        </div>
      </div>
    </div>
  );
}
