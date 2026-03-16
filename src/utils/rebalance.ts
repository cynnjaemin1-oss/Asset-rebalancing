import { Asset, Category, RebalanceAction } from '../types';

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

    actions.push({
      asset,
      category,
      currentValue,
      currentPercent,
      targetPercent: assetTargetPercent,
      diffPercent,
      action,
      actionAmount: Math.abs(diff),
      actionShares: asset.currentPrice > 0 ? Math.abs(diff) / asset.currentPrice : 0,
    });
  }

  return actions.sort((a, b) => Math.abs(b.diffPercent) - Math.abs(a.diffPercent));
}

export function formatKRW(value: number): string {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}억`;
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(0)}만`;
  }
  return value.toLocaleString('ko-KR');
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}
