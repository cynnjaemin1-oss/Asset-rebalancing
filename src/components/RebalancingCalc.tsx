import { Asset, Category } from '../types';
import { calculateRebalance, formatKRW, formatShares } from '../utils/rebalance';

interface Props {
  assets: Asset[];
  categories: Category[];
}

export default function RebalancingCalc({ assets, categories }: Props) {
  const actions = calculateRebalance(assets, categories);
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

      {actions.map(({ asset, action, currentPercent, targetPercent, actionAmount, actionShares, diffPercent }) => {
        const isOverweight = action === 'sell';
        const isUnderweight = action === 'buy';

        return (
          <div key={asset.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="font-bold text-sm">{asset.ticker}</span>
                <span className="text-xs text-gray-400 ml-2">{asset.name}</span>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isUnderweight
                    ? 'bg-blue-50 text-blue-600'
                    : isOverweight
                    ? 'bg-red-50 text-red-500'
                    : 'bg-green-50 text-green-600'
                }`}
              >
                {isUnderweight ? '매수' : isOverweight ? '매도' : '유지'}
              </span>
            </div>

            {/* Progress bar */}
            <div className="relative h-2 bg-gray-100 rounded-full mb-2">
              <div
                className="absolute h-2 bg-gray-800 rounded-full"
                style={{ width: `${Math.min(currentPercent, 100)}%` }}
              />
              <div
                className="absolute h-4 w-0.5 bg-red-400 top-1/2 -translate-y-1/2"
                style={{ left: `${Math.min(targetPercent, 100)}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-gray-500 mb-3">
              <span>현재 {currentPercent.toFixed(1)}%</span>
              <span className={Math.abs(diffPercent) > 1 ? 'text-orange-500 font-semibold' : ''}>
                {diffPercent > 0 ? '+' : ''}{diffPercent.toFixed(1)}%
              </span>
              <span>목표 {targetPercent.toFixed(1)}%</span>
            </div>

            {action !== 'hold' && (
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-sm font-semibold">
                  {isUnderweight ? '▲ 매수' : '▼ 매도'} ₩{formatKRW(actionAmount)}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  ≈ {formatShares(actionShares, asset)} (현재가 ₩{formatKRW(asset.currentPrice)})
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
