export interface Category {
  id: string;
  name: string;
  targetPercent: number;
  color: string;
}

export type PriceSourceType = 'manual' | 'yahoo_kr' | 'yahoo_us' | 'upbit' | 'krx_gold';

export interface PriceSource {
  type: PriceSourceType;
  symbol: string; // KRX 코드(yahoo_kr), 미국티커(yahoo_us), 코인심볼(upbit)
}

export interface Asset {
  id: string;
  name: string;
  ticker: string;
  categoryId: string;
  shares: number;
  averagePrice: number;
  currentPrice: number;
  priceSource?: PriceSource;
  investCap?: number; // 이번 투자에서의 최대 매수 금액 한도 (ISA 등)
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
