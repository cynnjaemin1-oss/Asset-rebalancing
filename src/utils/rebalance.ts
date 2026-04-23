import { Asset, Category, RebalanceAction, CategoryRebalanceAction } from '../types';

/** 업비트 암호화폐만 소수점 수량 허용, 나머지(주식/ETF/금)는 정수 절사 */
export function isFractionalAsset(asset: Asset): boolean {
  return asset.priceSource?.type === 'upbit';
}

/** 자산 종류에 맞는 수량 포맷 (주식→주, 암호화폐→개, 금→g) */
export function formatShares(shares: number, asset: Asset): string {
  if (asset.priceSource?.type === 'upbit') {
    return shares >= 1 ? `${shares.toFixed(4)}개` : `${shares.toFixed(6)}개`;
  }
  if (asset.priceSource?.type === 'krx_gold') return `${Math.floor(shares)}g`;
  return `${Math.floor(shares)}주`;
}

export function calculateRebalance(
  assets: Asset[],
  categories: Category[]
): RebalanceAction[] {
  const totalValue = assets.reduce(
    (sum, a) => sum + a.shares * a.currentPrice,
    0
  );
  if (totalValue === 0) return [];

  // Group assets by category
  const categoryValues: Record<string, number> = {};
  for (const asset of assets) {
    const val = asset.shares * asset.currentPrice;
    categoryValues[asset.categoryId] = (categoryValues[asset.categoryId] || 0) + val;
  }

  const actions: RebalanceAction[] = [];

  for (const asset of assets) {
    const category = categories.find((c) => c.id === asset.categoryId);
    if (!category) continue;

    const currentValue = asset.shares * asset.currentPrice;
    const currentPercent = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;

    // Distribute target % proportionally among assets in same category
    const categoryAssets = assets.filter((a) => a.categoryId === asset.categoryId);
    const assetTargetPercent = category.targetPercent / categoryAssets.length;

    const targetValue = (assetTargetPercent / 100) * totalValue;
    const diff = targetValue - currentValue;
    const diffPercent = currentPercent - assetTargetPercent;

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    if (Math.abs(diffPercent) > 1) {
      action = diff > 0 ? 'buy' : 'sell';
    }

    // 암호화폐만 소수점, 나머지는 정수 절사
    const rawShares = asset.currentPrice > 0 ? Math.abs(diff) / asset.currentPrice : 0;
    const actionShares = isFractionalAsset(asset) ? rawShares : Math.floor(rawShares);
    const actionAmount = isFractionalAsset(asset)
      ? Math.abs(diff)
      : actionShares * asset.currentPrice;

    actions.push({
      asset,
      category,
      currentValue,
      currentPercent,
      targetPercent: assetTargetPercent,
      diffPercent,
      action,
      actionAmount,
      actionShares,
    });
  }

  return actions.sort((a, b) => Math.abs(b.diffPercent) - Math.abs(a.diffPercent));
}

/** 카테고리 단위 리밸런싱: 개별 자산 균등분배 없이 카테고리 전체 비중만 비교 */
export function calculateCategoryRebalance(
  assets: Asset[],
  categories: Category[],
): CategoryRebalanceAction[] {
  const totalValue = assets.reduce((s, a) => s + a.shares * a.currentPrice, 0);
  if (totalValue === 0) return [];

  return categories
    .map((cat) => {
      const catAssets = assets.filter((a) => a.categoryId === cat.id);
      if (catAssets.length === 0) return null;
      const currentValue = catAssets.reduce((s, a) => s + a.shares * a.currentPrice, 0);
      const currentPercent = (currentValue / totalValue) * 100;
      const diffPercent = currentPercent - cat.targetPercent;
      const action: 'buy' | 'sell' | 'hold' =
        Math.abs(diffPercent) > 1 ? (diffPercent < 0 ? 'buy' : 'sell') : 'hold';
      return {
        category: cat,
        assets: catAssets,
        currentValue,
        currentPercent,
        targetPercent: cat.targetPercent,
        diffPercent,
        action,
        actionAmount: Math.abs(diffPercent / 100) * totalValue,
      };
    })
    .filter((r): r is CategoryRebalanceAction => r !== null)
    .sort((a, b) => Math.abs(b.diffPercent) - Math.abs(a.diffPercent));
}

export function formatKRW(value: number): string {
  return Math.round(value).toLocaleString('ko-KR');
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}
