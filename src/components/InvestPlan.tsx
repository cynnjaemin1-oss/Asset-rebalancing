import { useState, useMemo } from 'react';
import { Asset, Category } from '../types';
import { formatKRW, formatShares, isFractionalAsset } from '../utils/rebalance';

interface Props {
  assets: Asset[];
  categories: Category[];
  bandThreshold: number;
}

interface PlanRow {
  asset: Asset;
  category: Category;
  currentValue: number;
  currentPct: number;
  targetPct: number;
  catDeviation: number;
  buyAmount: number;
  buyShares: number;
  newValue: number;
  newPct: number;
  capped: boolean;
}

// investCap을 존중하며 budget을 자산 그룹에 분배
function distributeBudget(
  group: Asset[],
  budget: number,
  allocations: Map<string, number>,
  capped: Set<string>,
): void {
  const cappedWithRemaining: { a: Asset; remaining: number }[] = [];
  const uncappedAssets: Asset[] = [];

  for (const a of group) {
    if (a.investCap != null) {
      const costBasis = a.averagePrice * a.shares;
      const remaining = Math.max(0, a.investCap - costBasis);
      if (remaining <= 0) {
        allocations.set(a.id, 0);
        capped.add(a.id);
      } else {
        cappedWithRemaining.push({ a, remaining });
      }
    } else {
      uncappedAssets.push(a);
    }
  }

  let remainingBudget = budget;
  for (const { a, remaining } of cappedWithRemaining) {
    const isCappedByLimit = remaining <= remainingBudget;
    const allocated = Math.min(remaining, remainingBudget);
    allocations.set(a.id, allocated);
    remainingBudget -= allocated;
    if (isCappedByLimit) capped.add(a.id);
  }

  if (uncappedAssets.length > 0 && remainingBudget > 0) {
    const perUncapped = remainingBudget / uncappedAssets.length;
    for (const a of uncappedAssets) {
      allocations.set(a.id, perUncapped);
    }
  }
}

export default function InvestPlan({ assets, categories, bandThreshold }: Props) {
  const [inputStr, setInputStr] = useState('');

  const investAmount = useMemo(() => {
    const raw = inputStr.replace(/,/g, '');
    const n = Number(raw);
    return isNaN(n) || n <= 0 ? 0 : n;
  }, [inputStr]);

  const totalCurrent = useMemo(
    () => assets.reduce((s, a) => s + a.shares * a.currentPrice, 0),
    [assets],
  );

  // 카테고리별 편차: currentCatPct - targetPct
  const catDeviations = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const cat of categories) {
      const catValue = assets
        .filter((a) => a.categoryId === cat.id)
        .reduce((s, a) => s + a.shares * a.currentPrice, 0);
      const catPct = totalCurrent > 0 ? (catValue / totalCurrent) * 100 : 0;
      map.set(cat.id, catPct - cat.targetPercent);
    }
    return map;
  }, [assets, categories, totalCurrent]);

  // 포트폴리오가 없거나 모든 카테고리가 밴드 내 → normal, 아니면 corrective
  const mode = useMemo<'normal' | 'corrective'>(() => {
    if (totalCurrent === 0) return 'normal';
    const maxAbs = Math.max(0, ...[...catDeviations.values()].map(Math.abs));
    return maxAbs >= bandThreshold ? 'corrective' : 'normal';
  }, [catDeviations, bandThreshold, totalCurrent]);

  // 밴드 이탈 카테고리 목록 (배너용)
  const outOfBandCats = useMemo(() => {
    return [...catDeviations.entries()]
      .filter(([, dev]) => Math.abs(dev) >= bandThreshold)
      .map(([catId, dev]) => {
        const cat = categories.find((c) => c.id === catId);
        const sign = dev > 0 ? '+' : '';
        return `${cat?.name ?? ''} ${sign}${dev.toFixed(1)}%p`;
      });
  }, [catDeviations, bandThreshold, categories]);

  const plan = useMemo<PlanRow[]>(() => {
    if (investAmount === 0 || assets.length === 0) return [];

    const newTotal = totalCurrent + investAmount;

    const catAssets: Record<string, Asset[]> = {};
    for (const a of assets) {
      if (!catAssets[a.categoryId]) catAssets[a.categoryId] = [];
      catAssets[a.categoryId].push(a);
    }

    const effectiveAllocations = new Map<string, number>();
    const cappedAssets = new Set<string>();

    if (mode === 'normal') {
      // Mode 1: 투자금을 목표 비중 그대로 분배
      for (const cat of categories) {
        const group = catAssets[cat.id] ?? [];
        if (group.length === 0) continue;
        const catBudget = investAmount * (cat.targetPercent / 100);
        distributeBudget(group, catBudget, effectiveAllocations, cappedAssets);
      }
    } else {
      // Mode 2: corrective — 부족한 자산 우선 매수 (기존 로직)
      for (const cat of categories) {
        const group = catAssets[cat.id] ?? [];
        if (group.length === 0) continue;
        const catCurrentValue = group.reduce((s, a) => s + a.shares * a.currentPrice, 0);
        const catTarget = newTotal * (cat.targetPercent / 100);
        const catGap = Math.max(0, catTarget - catCurrentValue);
        distributeBudget(group, catGap, effectiveAllocations, cappedAssets);
      }
      // 전체 investAmount에 맞게 비례 축소
      const totalGap = [...effectiveAllocations.values()].reduce((s, g) => s + g, 0);
      const scale = totalGap > 0 ? Math.min(1, investAmount / totalGap) : 0;
      if (scale < 1) {
        for (const [id, v] of effectiveAllocations) {
          effectiveAllocations.set(id, v * scale);
        }
      }
    }

    const rows: PlanRow[] = assets.map((a) => {
      const cat = categories.find((c) => c.id === a.categoryId)!;
      const currentValue = a.shares * a.currentPrice;
      const rawBuy = effectiveAllocations.get(a.id) ?? 0;
      const rawShares = a.currentPrice > 0 ? rawBuy / a.currentPrice : 0;
      const buyShares = isFractionalAsset(a) ? rawShares : Math.floor(rawShares);
      const buyAmount = isFractionalAsset(a)
        ? Math.floor(rawBuy)
        : Math.floor(buyShares * a.currentPrice);
      const newValue = currentValue + buyAmount;

      return {
        asset: a,
        category: cat ?? { id: '', name: '-', targetPercent: 0, color: '#999' },
        currentValue,
        currentPct: totalCurrent > 0 ? (currentValue / totalCurrent) * 100 : 0,
        targetPct: cat ? cat.targetPercent : 0,
        catDeviation: catDeviations.get(cat?.id ?? '') ?? 0,
        buyAmount,
        buyShares,
        newValue,
        newPct: newTotal > 0 ? (newValue / newTotal) * 100 : 0,
        capped: cappedAssets.has(a.id),
      };
    });

    return rows.sort((a, b) => b.buyAmount - a.buyAmount);
  }, [assets, categories, investAmount, totalCurrent, mode, catDeviations]);

  const totalBuyAmount = plan.reduce((s, r) => s + r.buyAmount, 0);
  const surplus = investAmount - totalBuyAmount;

  function handleInput(val: string) {
    const raw = val.replace(/[^0-9]/g, '');
    if (raw === '') { setInputStr(''); return; }
    setInputStr(Number(raw).toLocaleString());
  }

  if (assets.length === 0) {
    return (
      <div className="p-4 text-center py-16 text-gray-400 text-sm">
        자산을 먼저 추가해주세요
      </div>
    );
  }

  const totalTargetPct = categories.reduce((s, c) => s + c.targetPercent, 0);
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
      {/* 헤더 */}
      <div>
        <h2 className="font-bold text-base">적립식 투자 계획</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          밴드 기반 하이브리드 리밸런싱 (임계값 ±{bandThreshold}%p)
        </p>
      </div>

      {/* 모드 배너 */}
      {mode === 'normal' ? (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
          <span className="text-green-500 text-lg leading-none">✓</span>
          <div>
            <div className="text-sm font-semibold text-green-700">밴드 내 정상 — 목표 비중대로 분배 중</div>
            <div className="text-xs text-green-600 mt-0.5">
              모든 자산이 목표 비중 ±{bandThreshold}%p 이내입니다
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
          <span className="text-orange-500 text-lg leading-none mt-0.5">⚠</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-orange-700">밴드 이탈 감지 — 부족 자산 우선 매수 중</div>
            <div className="text-xs text-orange-500 mt-0.5 break-words">
              이탈: {outOfBandCats.join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* 투자금 입력 */}
      <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
          이번 달 투자금
        </label>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-medium">₩</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="20,000,000"
            className="flex-1 bg-white border border-black/10 rounded-xl px-4 py-3 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-black/20"
            value={inputStr}
            onChange={(e) => handleInput(e.target.value)}
          />
        </div>
        {investAmount > 0 && (
          <p className="text-xs text-gray-400">
            현재 포트폴리오 ₩{formatKRW(totalCurrent)} +
            투자금 ₩{formatKRW(investAmount)} = ₩{formatKRW(totalCurrent + investAmount)}
          </p>
        )}
      </div>

      {/* 배분 결과 */}
      {investAmount > 0 && plan.length > 0 && (
        <>
          {/* 요약 바 */}
          <div className="bg-black text-white rounded-2xl p-4 flex justify-between text-sm">
            <div>
              <div className="text-xs text-gray-400 mb-0.5">배분 합계</div>
              <div className="font-bold">₩{formatKRW(totalBuyAmount)}</div>
            </div>
            {surplus > 0 && (
              <div className="text-right">
                <div className="text-xs text-gray-400 mb-0.5">잔여 (과매수 없음)</div>
                <div className="font-bold text-yellow-300">₩{formatKRW(surplus)}</div>
              </div>
            )}
          </div>

          {/* 자산별 카드 */}
          {plan.map((row) => {
            const isOutOfBand = Math.abs(row.catDeviation) >= bandThreshold;
            const devSign = row.catDeviation > 0 ? '+' : '';

            return (
              <div key={row.asset.id}
                className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-2">
                {/* 자산 헤더 */}
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-bold text-sm">{row.asset.ticker}</span>
                    <span className="text-xs text-gray-400 ml-2">{row.asset.name}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-gray-400">{row.category.name}</span>
                      {row.capped && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500 font-medium">
                          한도 적용
                        </span>
                      )}
                    </div>
                  </div>
                  {row.buyAmount > 0 ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      매수
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                      {mode === 'corrective' ? '초과' : '제외'}
                    </span>
                  )}
                </div>

                {/* 비율 진행 바 */}
                <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="absolute h-2 bg-gray-300 rounded-full"
                    style={{ width: `${Math.min(row.currentPct, 100)}%` }}
                  />
                  <div
                    className="absolute h-2 bg-blue-500 rounded-full transition-all"
                    style={{
                      left: `${Math.min(row.currentPct, 100)}%`,
                      width: `${Math.min(row.newPct - row.currentPct, 100 - row.currentPct)}%`,
                    }}
                  />
                  {/* 목표선 */}
                  <div
                    className="absolute h-4 w-0.5 bg-red-400 top-1/2 -translate-y-1/2"
                    style={{ left: `${Math.min(row.targetPct, 100)}%` }}
                  />
                </div>

                {/* 비율 텍스트: 현재%(편차) → 매수 후% | 목표% */}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">
                    현재 {row.currentPct.toFixed(1)}%
                    <span className={`ml-1 font-medium ${isOutOfBand ? 'text-red-500' : 'text-gray-400'}`}>
                      ({devSign}{row.catDeviation.toFixed(1)}%p)
                    </span>
                  </span>
                  <span className="text-blue-500 font-medium">→ {row.newPct.toFixed(1)}%</span>
                  <span className="text-gray-400">목표 {row.targetPct.toFixed(1)}%</span>
                </div>

                {/* 매수 상세 */}
                {row.buyAmount > 0 && (
                  <div className="bg-blue-50 rounded-xl p-3 space-y-1.5">
                    <div className="flex justify-between text-sm font-semibold text-blue-700">
                      <span>▲ ₩{formatKRW(row.buyAmount)}</span>
                      <span>{formatShares(row.buyShares, row.asset)}</span>
                    </div>
                    <div className="text-xs text-blue-400">
                      현재가 ₩{formatKRW(row.asset.currentPrice)} 기준
                    </div>
                    <div className="flex items-center gap-1.5 text-xs pt-0.5 border-t border-blue-100">
                      <span className="text-gray-500">평가금액</span>
                      <span className="font-medium text-gray-600">₩{formatKRW(row.currentValue)}</span>
                      <span className="text-blue-400">→</span>
                      <span className="font-semibold text-blue-700">₩{formatKRW(row.newValue)}</span>
                    </div>
                  </div>
                )}

                {row.buyAmount === 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                    <div className="text-xs text-gray-400 text-center">
                      {row.capped
                        ? '투자 한도 소진 — 이번 투자에서 제외'
                        : mode === 'corrective'
                        ? '목표 비율 초과 — 이번 투자에서 제외'
                        : '해당 없음'}
                    </div>
                    <div className="flex items-center justify-center gap-1.5 text-xs pt-0.5 border-t border-gray-200">
                      <span className="text-gray-500">평가금액</span>
                      <span className="font-semibold text-gray-700">₩{formatKRW(row.currentValue)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* 잔여금 안내 */}
          {surplus > 200 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-700">
              <strong>₩{formatKRW(surplus)}</strong> 잔여금이 있습니다.
              <br />
              <span className="text-xs">
                {mode === 'corrective'
                  ? '모든 자산이 이미 목표 비율을 초과했거나, 현재가 데이터 확인이 필요합니다.'
                  : '투자 한도(ISA 등)로 일부 자산의 매수가 제한되었습니다.'}
              </span>
            </div>
          )}
        </>
      )}

      {investAmount > 0 && plan.every((r) => r.buyAmount === 0) && (
        <div className="text-center py-8 text-gray-400 text-sm">
          현재 모든 자산이 목표 비율을 초과하고 있습니다.
          <br />자산을 추가하거나 목표 비율을 조정해주세요.
        </div>
      )}
    </div>
  );
}
