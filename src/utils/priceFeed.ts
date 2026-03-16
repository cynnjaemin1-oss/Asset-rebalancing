import { Asset, PriceSource } from '../types';

// ── USD/KRW 환율 (Upbit KRW-USDT, API키 불필요) ───────────────────────────────
let cachedUsdKrw: { rate: number; ts: number } | null = null;

async function fetchUsdKrwRate(): Promise<number> {
  // 1분 캐시
  if (cachedUsdKrw && Date.now() - cachedUsdKrw.ts < 60_000) return cachedUsdKrw.rate;
  const res = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-USDT');
  if (!res.ok) throw new Error('환율 조회 실패');
  const data = await res.json();
  const rate = data?.[0]?.trade_price;
  if (!rate) throw new Error('환율 데이터 없음');
  cachedUsdKrw = { rate, ts: Date.now() };
  return rate;
}

// ── Alpha Vantage 공통 헬퍼 ────────────────────────────────────────────────────
async function fetchAlphaVantageQuote(symbol: string, apiKey: string): Promise<number> {
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

async function fetchAlphaVantageXauUsd(apiKey: string): Promise<number> {
  const url =
    `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE` +
    `&from_currency=XAU&to_currency=USD&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage 오류: ${res.status}`);
  const data = await res.json();
  if (data?.Note) throw new Error('API 호출 한도 초과');
  const rate = data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'];
  if (!rate) throw new Error('금 시세 데이터 없음');
  return Number(rate);
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

// ── 공개 인터페이스 ───────────────────────────────────────────────────────────
export interface PriceFetchResult {
  assetId: string;
  price?: number;        // KRW 기준 현재가
  priceUsd?: number;     // 미국 주식: USD 원가
  usdKrwRate?: number;   // 미국 주식 / 금: 사용된 환율
  error?: string;
}

export async function fetchPrice(
  source: PriceSource,
  apiKey?: string
): Promise<{ price: number; priceUsd?: number; usdKrwRate?: number }> {
  switch (source.type) {
    case 'yahoo_kr': {
      if (!apiKey) throw new Error('API 키 필요 — 우측 상단 ⚙️ 설정에서 입력하세요.');
      const price = await fetchAlphaVantageQuote(`${source.symbol}.KS`, apiKey);
      return { price }; // 이미 KRW
    }
    case 'yahoo_us': {
      if (!apiKey) throw new Error('API 키 필요 — 우측 상단 ⚙️ 설정에서 입력하세요.');
      const [priceUsd, usdKrwRate] = await Promise.all([
        fetchAlphaVantageQuote(source.symbol, apiKey),
        fetchUsdKrwRate(),
      ]);
      return { price: priceUsd * usdKrwRate, priceUsd, usdKrwRate };
    }
    case 'krx_gold': {
      if (!apiKey) throw new Error('API 키 필요 — 우측 상단 ⚙️ 설정에서 입력하세요.');
      const [xauUsd, usdKrwRate] = await Promise.all([
        fetchAlphaVantageXauUsd(apiKey),
        fetchUsdKrwRate(),
      ]);
      // 1 troy oz = 31.1035g → 100g 가격
      const price = (xauUsd / 31.1035) * 100 * usdKrwRate;
      return { price, priceUsd: (xauUsd / 31.1035) * 100, usdKrwRate };
    }
    case 'upbit': {
      const price = await fetchUpbitPrice(source.symbol);
      return { price };
    }
    case 'manual':
      throw new Error('수동 입력');
    default:
      throw new Error('알 수 없는 소스');
  }
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
        const result = await fetchPrice(asset.priceSource!, apiKey);
        return { assetId: asset.id, ...result };
      } catch (e) {
        return { assetId: asset.id, error: e instanceof Error ? e.message : '오류' };
      }
    })
  );
}

export const PRICE_SOURCE_LABELS: Record<string, string> = {
  manual: '수동 입력',
  yahoo_kr: '국내 주식/ETF (Alpha Vantage)',
  yahoo_us: '미국 주식 — USD→KRW 자동환산',
  upbit: '암호화폐 (업비트)',
  krx_gold: 'KRX 금현물 100g',
};

export const SYMBOL_HINTS: Record<string, string> = {
  yahoo_kr: '예: 396500 (TIGER 반도체TOP10), 305540 (TIGER 미국테크TOP10)',
  yahoo_us: '예: QQQ, AAPL, MSFT, SPY',
  upbit: '예: BTC, ETH, XRP',
  krx_gold: '심볼 불필요 — XAU/USD × USD/KRW 자동계산',
};
