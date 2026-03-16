import { Asset, PriceSource } from '../types';

// ── Naver Finance (한국 주식/ETF) ─────────────────────────────────────────────
// m.stock.naver.com API는 모바일 웹용으로 CORS 허용
async function fetchNaverPrice(code: string): Promise<number> {
  const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Naver 오류: ${res.status}`);
  const data = await res.json();
  // closePrice는 "32,510" 형태의 문자열
  const raw = data?.closePrice ?? data?.stockEndPrice;
  if (raw === undefined || raw === null) throw new Error('가격 데이터 없음');
  const price = typeof raw === 'string' ? Number(raw.replace(/,/g, '')) : Number(raw);
  if (isNaN(price) || price === 0) throw new Error('가격 파싱 실패');
  return price;
}

// ── Upbit (암호화폐) ──────────────────────────────────────────────────────────
async function fetchUpbitPrice(coin: string): Promise<number> {
  const market = `KRW-${coin.toUpperCase()}`;
  const res = await fetch(`https://api.upbit.com/v1/ticker?markets=${market}`);
  if (!res.ok) throw new Error(`Upbit 오류: ${res.status}`);
  const data = await res.json();
  const price = data?.[0]?.trade_price;
  if (!price) throw new Error('가격 데이터 없음');
  return price;
}

// ── Yahoo Finance (미국 주식) via allorigins proxy ────────────────────────────
async function fetchYahooPrice(symbol: string): Promise<number> {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`프록시 오류: ${res.status}`);
  const wrapper = await res.json();
  if (!wrapper.contents) throw new Error('응답 없음');
  const data = JSON.parse(wrapper.contents);
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!price) throw new Error('가격 데이터 없음');
  return price;
}

// ── 공개 API ──────────────────────────────────────────────────────────────────
export async function fetchPrice(source: PriceSource): Promise<number> {
  switch (source.type) {
    case 'yahoo_kr':
      return fetchNaverPrice(source.symbol);
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
        return { assetId: asset.id, error: e instanceof Error ? e.message : '오류' };
      }
    })
  );
}

export const PRICE_SOURCE_LABELS: Record<string, string> = {
  manual: '수동 입력',
  yahoo_kr: '국내 주식/ETF (네이버 금융)',
  yahoo_us: '미국 주식 (NYSE/NASDAQ)',
  upbit: '암호화폐 (업비트)',
};

export const SYMBOL_HINTS: Record<string, string> = {
  yahoo_kr: '예: 396500 (TIGER 반도체TOP10), 305540 (TIGER 미국테크TOP10), 132030 (KRX 금현물)',
  yahoo_us: '예: AAPL, MSFT, SPY, QQQ',
  upbit: '예: BTC, ETH, XRP',
};
