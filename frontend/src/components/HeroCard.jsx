const CDN = 'https://cdn.cloudflare.steamstatic.com';

export default function HeroCard({ hero }) {
  const imgUrl = hero.img ? `${CDN}${hero.img}` : '';
  const displayName = hero.cn_name || hero.localized_name;
  const winRate = hero.win_rate != null ? hero.win_rate.toFixed(1) : '--';
  const picks = hero.picks != null ? hero.picks.toLocaleString() : '--';

  const winColor =
    hero.win_rate >= 53 ? 'text-green-400' : hero.win_rate < 47 ? 'text-red-400' : 'text-[#e8e6e3]';

  return (
    <div className="bg-[#232638] rounded-lg overflow-hidden hover:ring-1 hover:ring-[#e04a32]/50 transition-all group">
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
        <div className="absolute inset-0 bg-gradient-to-t from-[#232638] via-transparent to-transparent" />
      </div>
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
