import { Asset, PriceSource } from '../types';

// ── Alpha Vantage (한국/미국 주식) ────────────────────────────────────────────
// CORS 완전 지원 | 무료 API 키: https://www.alphavantage.co/support/#api-key
async function fetchAlphaVantagePrice(symbol: string, apiKey: string): Promise<number> {
  const url =
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE` +
    `&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage 오류: ${res.status}`);
  const data = await res.json();
  if (data?.Note) throw new Error('API 호출 한도 초과 (하루 25회). 잠시 후 재시도하세요.');
  if (data?.['Error Message']) throw new Error('잘못된 심볼입니다.');
  const price = data?.['Global Quote']?.['05. price'];
  if (!price) throw new Error('가격 데이터 없음 (심볼 확인 필요)');
  return Number(price);
}

// ── Upbit (암호화폐) ── CORS 지원, API 키 불필요 ──────────────────────────────
async function fetchUpbitPrice(coin: string): Promise<number> {
  const market = `KRW-${coin.toUpperCase()}`;
  const res = await fetch(`https://api.upbit.com/v1/ticker?markets=${market}`);
  if (!res.ok) throw new Error(`Upbit 오류: ${res.status}`);
  const data = await res.json();
  const price = data?.[0]?.trade_price;
  if (!price) throw new Error('가격 데이터 없음');
  return price;
}

// ── 공개 API ──────────────────────────────────────────────────────────────────
export async function fetchPrice(source: PriceSource, apiKey?: string): Promise<number> {
  switch (source.type) {
    case 'yahoo_kr': {
      if (!apiKey) throw new Error('API 키 필요 — 우측 상단 ⚙️ 설정에서 입력하세요.');
      return fetchAlphaVantagePrice(`${source.symbol}.KS`, apiKey);
    }
    case 'yahoo_us': {
      if (!apiKey) throw new Error('API 키 필요 — 우측 상단 ⚙️ 설정에서 입력하세요.');
      return fetchAlphaVantagePrice(source.symbol, apiKey);
    }
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

export async function fetchAllPrices(
  assets: Asset[],
  apiKey?: string
): Promise<PriceFetchResult[]> {
  const linked = assets.filter(
    (a) => a.priceSource && a.priceSource.type !== 'manual'
  );
  return Promise.all(
    linked.map(async (asset) => {
      try {
        const price = await fetchPrice(asset.priceSource!, apiKey);
        return { assetId: asset.id, price };
      } catch (e) {
        return { assetId: asset.id, error: e instanceof Error ? e.message : '오류' };
      }
    })
  );
}

export const PRICE_SOURCE_LABELS: Record<string, string> = {
  manual: '수동 입력',
  yahoo_kr: '국내 주식/ETF (Alpha Vantage)',
  yahoo_us: '미국 주식 (Alpha Vantage)',
  upbit: '암호화폐 (업비트)',
};

export const SYMBOL_HINTS: Record<string, string> = {
  yahoo_kr: '예: 396500 (TIGER 반도체TOP10), 305540 (TIGER 미국테크TOP10), 132030 (KRX 금현물)',
  yahoo_us: '예: AAPL, MSFT, SPY, QQQ',
  upbit: '예: BTC, ETH, XRP',
};
