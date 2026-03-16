import { Asset, PriceSource } from '../types';

// ── 멀티-프록시 — Promise.any() 동시 경쟁 ────────────────────────────────────
async function fetchWithProxy(url: string): Promise<unknown> {
  const enc = encodeURIComponent(url);

  const attempts: Promise<unknown>[] = [
    // 1) corsproxy.io
    fetch(`https://corsproxy.io/?${url}`, { signal: AbortSignal.timeout(10_000) })
      .then((r) => { if (!r.ok) throw new Error(`corsproxy ${r.status}`); return r.json(); }),

    // 2) allorigins
    fetch(`https://api.allorigins.win/get?url=${enc}`, { signal: AbortSignal.timeout(12_000) })
      .then((r) => r.json())
      .then((w) => { if (!w?.contents) throw new Error('allorigins empty'); return JSON.parse(w.contents); }),

    // 3) codetabs — Naver 허용 여부 양호
    fetch(`https://api.codetabs.com/v1/proxy?quest=${enc}`, { signal: AbortSignal.timeout(12_000) })
      .then((r) => { if (!r.ok) throw new Error(`codetabs ${r.status}`); return r.json(); }),
  ];

  try {
    return await Promise.any(attempts);
  } catch (agg) {
    const msgs = (agg as AggregateError)?.errors
      ?.map((e: unknown) => (e instanceof Error ? e.message : 'err'))
      .join(' / ') ?? '모든 프록시 실패';
    throw new Error(`프록시 연결 실패 (${msgs})`);
  }
}

// ── Naver Finance (국내 주식/ETF) ─────────────────────────────────────────────
async function fetchNaverPrice(code: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await fetchWithProxy(
    `https://m.stock.naver.com/api/stock/${code}/basic`,
  )) as any;
  const raw = data?.closePrice ?? data?.stockEndPrice ?? data?.price;
  if (raw == null) throw new Error('가격 데이터 없음 (코드 확인 필요)');
  const price = typeof raw === 'string' ? Number(raw.replace(/,/g, '')) : Number(raw);
  if (isNaN(price) || price === 0) throw new Error('가격 파싱 실패');
  return price;
}

// ── KRX 금현물 (원/g) ─────────────────────────────────────────────────────────
// Binance PAXG-USDT: PAX Gold = 금 1트로이온스 기반 토큰, CORS 허용, 인증 불필요
// 원/g = PAXG_USD ÷ 31.1035 × USDT/KRW
async function fetchKrxGoldPrice(): Promise<number> {
  const [goldUsd, usdKrw] = await Promise.all([fetchGoldUsdPerOz(), fetchUsdKrwRate()]);
  return Math.round((goldUsd / 31.1035) * usdKrw);
}

async function fetchGoldUsdPerOz(): Promise<number> {
  // Binance Public API — CORS 허용, 인증 불필요
  // PAXG(PAX Gold) = 금 실물 1트로이온스 기반, 스팟 금 시세와 0.1% 이내 차이
  const res = await fetch(
    'https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT',
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const data = await res.json();
  const price = parseFloat(data?.price);
  if (isNaN(price) || price === 0) throw new Error('PAXG 가격 없음');
  return price;
}

// ── Upbit (암호화폐) ──────────────────────────────────────────────────────────
async function fetchUpbitPrice(coin: string): Promise<number> {
  const market = `KRW-${coin.toUpperCase()}`;
  const res = await fetch(
    `https://api.upbit.com/v1/ticker?markets=${market}`,
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!res.ok) throw new Error(`Upbit 오류: ${res.status}`);
  const data = await res.json();
  const price = data?.[0]?.trade_price;
  if (!price) throw new Error('가격 데이터 없음');
  return price;
}

// ── USD/KRW (Upbit KRW-USDT) ─────────────────────────────────────────────────
let cachedUsdKrw: { rate: number; ts: number } | null = null;
async function fetchUsdKrwRate(): Promise<number> {
  if (cachedUsdKrw && Date.now() - cachedUsdKrw.ts < 60_000) return cachedUsdKrw.rate;
  const rate = await fetchUpbitPrice('USDT');
  cachedUsdKrw = { rate, ts: Date.now() };
  return rate;
}

// ── Yahoo Finance (미국 주식) — via proxy ─────────────────────────────────────
async function fetchYahooUsdPrice(symbol: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await fetchWithProxy(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
  )) as any;
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!price) throw new Error('가격 없음 (심볼 확인)');
  return price;
}

// ── Public ────────────────────────────────────────────────────────────────────
export interface PriceFetchResult {
  assetId: string;
  price?: number;
  priceUsd?: number;
  usdKrwRate?: number;
  error?: string;
}

export async function fetchPrice(
  source: PriceSource,
  _apiKey?: string,
): Promise<{ price: number; priceUsd?: number; usdKrwRate?: number }> {
  switch (source.type) {
    case 'yahoo_kr':
      return { price: await fetchNaverPrice(source.symbol) };

    case 'krx_gold':
      return { price: await fetchKrxGoldPrice() };

    case 'yahoo_us': {
      const [priceUsd, usdKrwRate] = await Promise.all([
        fetchYahooUsdPrice(source.symbol),
        fetchUsdKrwRate(),
      ]);
      return { price: Math.round(priceUsd * usdKrwRate), priceUsd, usdKrwRate };
    }

    case 'upbit':
      return { price: await fetchUpbitPrice(source.symbol) };

    default:
      throw new Error('수동 입력');
  }
}

export async function fetchAllPrices(
  assets: Asset[],
  apiKey?: string,
): Promise<PriceFetchResult[]> {
  const linked = assets.filter((a) => a.priceSource && a.priceSource.type !== 'manual');
  return Promise.all(
    linked.map(async (asset) => {
      try {
        const result = await fetchPrice(asset.priceSource!, apiKey);
        return { assetId: asset.id, ...result };
      } catch (e) {
        return { assetId: asset.id, error: e instanceof Error ? e.message : '오류' };
      }
    }),
  );
}

export const PRICE_SOURCE_LABELS: Record<string, string> = {
  manual: '수동 입력',
  yahoo_kr: '국내 주식/ETF (네이버 금융)',
  yahoo_us: '미국 주식 — USD→KRW 자동환산',
  upbit: '암호화폐 (업비트)',
  krx_gold: 'KRX 금현물 (원/g)',
};

export const SYMBOL_HINTS: Record<string, string> = {
  yahoo_kr: '예: 396500 (TIGER 반도체TOP10), 305540 (TIGER 미국테크TOP10)',
  yahoo_us: '예: QQQ, AAPL, MSFT, SPY',
  upbit: '예: BTC, ETH, XRP',
  krx_gold: '심볼 불필요 — Binance PAXG 기준 원/g 자동계산 | 수량: 보유 g 수 입력',
};
