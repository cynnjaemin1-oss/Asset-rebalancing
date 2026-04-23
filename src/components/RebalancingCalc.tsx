import { Asset, Category } from '../types';
import { calculateCategoryRebalance, formatKRW, formatShares } from '../utils/rebalance';

interface Props {
  assets: Asset[];
  categories: Category[];
}

export default function RebalancingCalc({ assets, categories }: Props) {
  const actions = calculateCategoryRebalance(assets, categories);
  const totalValue = assets.reduce((s, a) => s + a.shares * a.currentPrice, 0);

  const totalTargetPct = categories.reduce((s, c) => s + c.targetPercent, 0);

  if (assets.length === 0) {
    return (
      <div className="p-4 text-center py-16 text-gray-400 text-sm">
        자산을 먼저 추가해주세요
      </div>
    );
  }

  if (totalTargetPct !== 100) {
    return (
      <div className="p-4 text-center py-16 text-red-400 text-sm">
        목표 배분 합계가 100%가 아닙니다 (현재 {totalTargetPct}%)
        <br />배분 탭에서 수정해주세요
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base">리밸런싱 계획</h2>
        <span className="text-xs text-gray-400">총 ₩{formatKRW(totalValue)}</span>
      </div>

      {actions.map(({ category, assets: catAssets, currentPercent, targetPercent, diffPercent, action, actionAmount }) => {
        const isOverweight = action === 'sell';
        const isUnderweight = action === 'buy';

        return (
          <div key={category.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
            {/* 카테고리 헤더 */}
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{category.name}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                isUnderweight ? 'bg-blue-50 text-blue-600'
                : isOverweight ? 'bg-red-50 text-red-500'
                : 'bg-green-50 text-green-600'
              }`}>
                {isUnderweight ? '매수 필요' : isOverweight ? '매도 필요' : '목표 달성'}
              </span>
            </div>

            {/* 비중 진행 바 */}
            <div className="relative h-2 bg-gray-100 rounded-full">
              <div
                className="absolute h-2 bg-gray-800 rounded-full"
                style={{ width: `${Math.min(currentPercent, 100)}%` }}
              />
              <div
                className="absolute h-4 w-0.5 bg-red-400 top-1/2 -translate-y-1/2"
                style={{ left: `${Math.min(targetPercent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>현재 {currentPercent.toFixed(1)}%</span>
              <span className={Math.abs(diffPercent) > 1 ? (isOverweight ? 'text-red-500 font-semibold' : 'text-blue-500 font-semibold') : ''}>
                {diffPercent > 0 ? '+' : ''}{diffPercent.toFixed(1)}%
              </span>
              <span>목표 {targetPercent.toFixed(1)}%</span>
            </div>

            {/* 액션 금액 */}
            {action !== 'hold' && (
              <div className={`rounded-xl p-3 text-center ${isUnderweight ? 'bg-blue-50' : 'bg-red-50'}`}>
                <div className={`text-sm font-semibold ${isUnderweight ? 'text-blue-700' : 'text-red-600'}`}>
                  {isUnderweight ? '▲ 매수' : '▼ 매도'} ₩{formatKRW(actionAmount)}
                </div>
              </div>
            )}

            {/* 카테고리 내 개별 자산 목록 */}
            <div className="border-t border-gray-100 pt-2 space-y-1.5">
              {catAssets.map((a) => {
                const value = a.shares * a.currentPrice;
                const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
                return (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-700">{a.ticker}</span>
                      <span className="text-gray-400">{a.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-gray-700">₩{formatKRW(value)}</span>
                      <span className="text-gray-400 ml-1.5">
                        {formatShares(a.shares, a)} · {pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
