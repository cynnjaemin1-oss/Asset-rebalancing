import { Asset, PriceSource } from '../types';

// CORS 프록시 (브라우저에서 Yahoo Finance 직접 호출 불가)
const CORS_PROXY = 'https://corsproxy.io/?url=';

// Yahoo Finance: 한국 주식/ETF (.KS suffix)
async function fetchYahooPrice(symbol: string): Promise<number> {
  const yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const url = `${CORS_PROXY}${encodeURIComponent(yahooUrl)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yahoo Finance 오류: ${res.status}`);
  const data = await res.json();
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!price) throw new Error('가격 데이터 없음');
  return price;
}

// Upbit: 암호화폐 (KRW 마켓)
async function fetchUpbitPrice(coin: string): Promise<number> {
  const market = `KRW-${coin.toUpperCase()}`;
  const url = `https://api.upbit.com/v1/ticker?markets=${market}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Upbit 오류: ${res.status}`);
  const data = await res.json();
  const price = data?.[0]?.trade_price;
  if (!price) throw new Error('가격 데이터 없음');
  return price;
}

export async function fetchPrice(source: PriceSource): Promise<number> {
  switch (source.type) {
    case 'yahoo_kr':
      // KRX 코드 → {code}.KS  (예: 305540 → 305540.KS)
      return fetchYahooPrice(`${source.symbol}.KS`);
    case 'yahoo_us':
      return fetchYahooPrice(source.symbol);
    case 'upbit':
      return fetchUpbitPrice(source.symbol);
    case 'manual':
      throw new Error('수동 입력');
    default:
      throw new Error('알 수 없는 소스');
  }
}

export interface PriceFetchResult {
  assetId: string;
  price?: number;
  error?: string;
}

export async function fetchAllPrices(assets: Asset[]): Promise<PriceFetchResult[]> {
  const linked = assets.filter(
    (a) => a.priceSource && a.priceSource.type !== 'manual'
  );

  return Promise.all(
    linked.map(async (asset) => {
      try {
        const price = await fetchPrice(asset.priceSource!);
        return { assetId: asset.id, price };
      } catch (e) {
        return {
          assetId: asset.id,
          error: e instanceof Error ? e.message : '오류',
        };
      }
    })
  );
}

export const PRICE_SOURCE_LABELS: Record<string, string> = {
  manual: '수동 입력',
  yahoo_kr: '국내 주식/ETF (KRX)',
  yahoo_us: '미국 주식 (NYSE/NASDAQ)',
  upbit: '암호화폐 (업비트)',
};

// 잘 알려진 심볼 힌트
export const SYMBOL_HINTS: Record<string, string> = {
  yahoo_kr: '예: 305540 (TIGER 미국테크TOP10), 381170 (TIGER 반도체TOP10), 132030 (KRX 금현물)',
  yahoo_us: '예: AAPL, MSFT, SPY, QQQ',
  upbit: '예: BTC, ETH, XRP',
};
