import { Asset, Category } from '../types';
import { formatKRW } from '../utils/rebalance';

interface Props {
  assets: Asset[];
  categories: Category[];
}

export default function Dashboard({ assets, categories }: Props) {
  const totalValue = assets.reduce((s, a) => s + a.shares * a.currentPrice, 0);
  const totalCost = assets.reduce((s, a) => s + a.shares * a.averagePrice, 0);
  const totalGain = totalValue - totalCost;
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  // Category breakdown
  const catData = categories.map((cat) => {
    const value = assets
      .filter((a) => a.categoryId === cat.id)
      .reduce((s, a) => s + a.shares * a.currentPrice, 0);
    const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
    return { ...cat, value, pct };
  });

  return (
    <div className="p-4 space-y-5">
      {/* Summary card */}
      <div className="bg-black text-white rounded-3xl p-5 space-y-1">
        <div className="text-xs text-white/60 uppercase tracking-wider">총 평가금액</div>
        <div className="text-3xl font-bold">₩{formatKRW(totalValue)}</div>
        <div className={`text-sm font-medium ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {totalGain >= 0 ? '+' : ''}₩{formatKRW(Math.abs(totalGain))} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%)
        </div>
      </div>

      {/* Category breakdown */}
      {catData.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4 shadow-sm">
          <h3 className="font-semibold text-sm">카테고리별 현황</h3>

          {/* Stacked bar */}
          <div className="flex rounded-full overflow-hidden h-2.5">
            {catData.map((cat) => (
              <div
                key={cat.id}
                style={{ width: `${cat.pct}%`, backgroundColor: cat.color }}
                className="transition-all"
              />
            ))}
          </div>

          <div className="space-y-2">
            {catData.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="flex-1 text-sm">{cat.name}</span>
                <span className="text-sm font-semibold">₩{formatKRW(cat.value)}</span>
                <span className="text-xs text-gray-400 w-12 text-right">{cat.pct.toFixed(1)}%</span>
                <span className="text-xs text-gray-300 w-12 text-right">목표 {cat.targetPercent}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Asset count */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
          <div className="text-2xl font-bold">{assets.length}</div>
          <div className="text-xs text-gray-400 mt-1">보유 종목</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
          <div className="text-2xl font-bold">{categories.length}</div>
          <div className="text-xs text-gray-400 mt-1">카테고리</div>
        </div>
      </div>

      {assets.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          자산 탭에서 종목을 추가하세요
        </div>
      )}
    </div>
  );
}
