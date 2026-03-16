export interface Category {
  id: string;
  name: string;
  targetPercent: number;
  color: string;
}

export interface Asset {
  id: string;
  name: string;
  ticker: string;
  categoryId: string;
  shares: number;
  averagePrice: number;
  currentPrice: number;
}

export interface RebalanceAction {
  asset: Asset;
  category: Category;
  currentValue: number;
  currentPercent: number;
  targetPercent: number;
  diffPercent: number;
  action: 'buy' | 'sell' | 'hold';
  actionAmount: number;
  actionShares: number;
}
