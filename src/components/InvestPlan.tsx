import { useState, useMemo } from 'react';
import { Asset, Category } from '../types';
import { formatKRW, formatShares, isFractionalAsset } from '../utils/rebalance';

interface Props {
  assets: Asset[];
  categories: Category[];
}

interface PlanRow {
  asset: Asset;
  category: Category;
  currentValue: number;
  currentPct: number;
  targetPct: number;    // 자산 단위 목표 비율 (카테고리 내 균등 분배)
  buyAmount: number;    // 추천 매수 금액
  buyShares: number;    // 추천 매수 수량
  newValue: number;     // 매수 후 평가금액
  newPct: number;       // 매수 후 비율
  capped: boolean;      // 투자 한도에 의해 금액이 제한됨
}

export default function InvestPlan({ assets, categories }: Props) {
  const [inputStr, setInputStr] = useState('');

  const investAmount = useMemo(() => {
    const raw = inputStr.replace(/,/g, '');
    const n = Number(raw);
    return isNaN(n) || n <= 0 ? 0 : n;
  }, [inputStr]);

  const totalCurrent = useMemo(
    () => assets.reduce((s, a) => s + a.shares * a.currentPrice, 0),
    [assets]
  );

  const plan = useMemo<PlanRow[]>(() => {
    if (investAmount === 0 || assets.length === 0) return [];

    const newTotal = totalCurrent + investAmount;

    // 카테고리별 자산 목록
    const catAssets: Record<string, Asset[]> = {};
    for (const a of assets) {
      if (!catAssets[a.categoryId]) catAssets[a.categoryId] = [];
      catAssets[a.categoryId].push(a);
    }

    // 카테고리별: 균등 분배 기준 gap 계산 → investCap 적용 → 초과분 재배분
    const effectiveGaps: Map<string, number> = new Map();
    const cappedAssets: Set<string> = new Set();

    for (const cat of categories) {
      const group = catAssets[cat.id] ?? [];
      if (group.length === 0) continue;
      const catTarget = newTotal * (cat.targetPercent / 100);
      const perAsset = catTarget / group.length;

      // 1단계: 균등 분배 기준 raw gap 계산
      let freed = 0;
      const uncapped: Asset[] = [];
      for (const a of group) {
        const current = a.shares * a.currentPrice;
        const rawGap = Math.max(0, perAsset - current);
        if (a.investCap != null && rawGap > a.investCap) {
          effectiveGaps.set(a.id, a.investCap);
          freed += rawGap - a.investCap;
          cappedAssets.add(a.id);
        } else {
          effectiveGaps.set(a.id, rawGap);
          uncapped.push(a);
        }
      }

      // 2단계: 초과분을 같은 카테고리 uncapped 자산에 gap 비례로 재배분
      if (freed > 0 && uncapped.length > 0) {
        const uncappedGapTotal = uncapped.reduce((s, a) => s + (effectiveGaps.get(a.id) ?? 0), 0);
        if (uncappedGapTotal > 0) {
          for (const a of uncapped) {
            const share = (effectiveGaps.get(a.id) ?? 0) / uncappedGapTotal;
            effectiveGaps.set(a.id, (effectiveGaps.get(a.id) ?? 0) + freed * share);
          }
        } else {
          // uncapped 자산들도 gap 0 → 균등 분배
          const perU = freed / uncapped.length;
          for (const a of uncapped) {
            effectiveGaps.set(a.id, (effectiveGaps.get(a.id) ?? 0) + perU);
          }
        }
      }
    }

    // 전체 투자금 한도 내 비례 배분
    const totalGap = [...effectiveGaps.values()].reduce((s, g) => s + g, 0);
    const scale = totalGap > 0 ? Math.min(1, investAmount / totalGap) : 0;

    const rows: PlanRow[] = assets.map((a) => {
      const cat = categories.find((c) => c.id === a.categoryId)!;
      const currentValue = a.shares * a.currentPrice;
      const rawBuy = (effectiveGaps.get(a.id) ?? 0) * scale;
      const rawShares = a.currentPrice > 0 ? rawBuy / a.currentPrice : 0;
      // 암호화폐만 소수점 수량 허용, 나머지는 정수 절사 후 금액 재계산
      const buyShares = isFractionalAsset(a) ? rawShares : Math.floor(rawShares);
      const buyAmount = isFractionalAsset(a)
        ? Math.floor(rawBuy)
        : Math.floor(buyShares * a.currentPrice);
      const newValue = currentValue + buyAmount;
      const group = catAssets[a.categoryId] ?? [];
      const targetPct = cat ? cat.targetPercent / group.length : 0;

      return {
        asset: a,
        category: cat ?? { id: '', name: '-', targetPercent: 0, color: '#999' },
        currentValue,
        currentPct: totalCurrent > 0 ? (currentValue / totalCurrent) * 100 : 0,
        targetPct,
        buyAmount,
        buyShares,
        newValue,
        newPct: newTotal > 0 ? (newValue / newTotal) * 100 : 0,
        capped: cappedAssets.has(a.id),
      };
    });

    return rows.sort((a, b) => b.buyAmount - a.buyAmount);
  }, [assets, categories, investAmount, totalCurrent]);

  const totalBuyAmount = plan.reduce((s, r) => s + r.buyAmount, 0);
  const surplus = investAmount - totalBuyAmount;

  function handleInput(val: string) {
    // 숫자만 허용, 콤마 자동 포맷
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
          투자금을 목표 비율에 맞게 분배합니다 (현재 부족한 자산 위주로 매수)
        </p>
      </div>

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
          {plan.map((row) => (
            <div key={row.asset.id}
              className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-2">
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
                    초과
                  </span>
                )}
              </div>

              {/* 비율 진행 바: 현재 → 매수 후 */}
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
              <div className="flex justify-between text-xs text-gray-400">
                <span>현재 {row.currentPct.toFixed(1)}%</span>
                <span className="text-blue-500 font-medium">→ {row.newPct.toFixed(1)}%</span>
                <span>목표 {row.targetPct.toFixed(1)}%</span>
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
                    목표 비율 초과 — 이번 투자에서 제외
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-xs pt-0.5 border-t border-gray-200">
                    <span className="text-gray-500">평가금액</span>
                    <span className="font-semibold text-gray-700">₩{formatKRW(row.currentValue)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 잔여금 안내 */}
          {surplus > 200 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-700">
              <strong>₩{formatKRW(surplus)}</strong> 잔여금이 있습니다.
              <br />
              <span className="text-xs">모든 자산이 이미 목표 비율을 초과했거나,
              현재가 데이터 확인이 필요합니다.</span>
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
