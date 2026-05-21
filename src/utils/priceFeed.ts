import { Asset, PriceSource } from '../types';

// ── 멀티-프록시 — 4개 프록시 동시 경쟁, 최대 12초 ────────────────────────────
// retry 없음: 실패하면 즉시 에러 반환 (무한로딩 방지)
async function fetchWithProxy(url: string): Promise<unknown> {
  const enc = encodeURIComponent(url);

  const attempts: Promise<unknown>[] = [
    fetch(`https://corsproxy.io/?${url}`, { signal: AbortSignal.timeout(12_000) })
      .then((r) => { if (!r.ok) throw new Error(`corsproxy ${r.status}`); return r.json(); }),

    fetch(`https://api.allorigins.win/get?url=${enc}`, { signal: AbortSignal.timeout(12_000) })
      .then((r) => r.json())
      .then((w) => { if (!w?.contents) throw new Error('allorigins empty'); return JSON.parse(w.contents); }),

    fetch(`https://api.codetabs.com/v1/proxy?quest=${enc}`, { signal: AbortSignal.timeout(12_000) })
      .then((r) => { if (!r.ok) throw new Error(`codetabs ${r.status}`); return r.json(); }),

    fetch(`https://thingproxy.freeboard.io/fetch/${url}`, { signal: AbortSignal.timeout(12_000) })
      .then((r) => { if (!r.ok) throw new Error(`thingproxy ${r.status}`); return r.json(); }),
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
async function fetchKrxGoldPrice(): Promise<number> {
  const [goldUsd, usdKrw] = await Promise.all([fetchGoldUsdPerOz(), fetchUsdKrwRate()]);
  return Math.round((goldUsd / 31.1035) * usdKrw);
}

async function fetchGoldUsdPerOz(): Promise<number> {
  const res = await fetch(
    'https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT',
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const data = await res.json();
  const price = parseFloat(data?.price);
  if (isNaN(price) || price === 0) throw new Error('PAXG 가격 없음');
  return price;
}

// ── Upbit 배치 조회 (모든 코인 + USDT를 단일 API 호출) ───────────────────────
async function fetchUpbitBatch(coins: string[]): Promise<Record<string, number>> {
  const markets = [...new Set(coins.map((c) => `KRW-${c.toUpperCase()}`))]
    .join(',');
  const res = await fetch(
    `https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(markets)}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`Upbit 오류: ${res.status}`);
  const data = (await res.json()) as { market: string; trade_price: number }[];
  return Object.fromEntries(
    data.map((d) => [d.market.replace('KRW-', ''), d.trade_price]),
  );
}

// ── USD/KRW 실시간 환율 ───────────────────────────────────────────────────────
// Upbit USDT/KRW 우선 (CORS 직접 호출 → 프록시 캐시 없음, 실시간)
// 실패 시 Yahoo Finance USDKRW=X fallback (proxy 경유, 캐시 있을 수 있음)
let cachedUsdKrw: { rate: number; ts: number } | null = null;

async function fetchUsdKrwRate(): Promise<number> {
  if (cachedUsdKrw && Date.now() - cachedUsdKrw.ts < 30_000) return cachedUsdKrw.rate;

  let rate: number;
  try {
    // Primary: Upbit USDT — 프록시 불필요, 매 초 업데이트, 실환율과 오차 ±1~2원
    const prices = await fetchUpbitBatch(['USDT']);
    const r = prices['USDT'];
    if (!r || r < 900 || r > 2500) throw new Error('invalid upbit usdt rate');
    rate = r;
  } catch {
    // Fallback: Yahoo Finance USDKRW=X (proxy 경유 → 캐시 지연 가능성 있음)
    const d = await fetchWithProxy(
      'https://query1.finance.yahoo.com/v8/finance/chart/USDKRW=X?interval=1d&range=1d',
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (d as any)?.chart?.result?.[0]?.meta?.regularMarketPrice as number;
    if (!r || r < 900 || r > 2500) throw new Error('환율 조회 실패');
    rate = r;
  }

  cachedUsdKrw = { rate, ts: Date.now() };
  return rate;
}

// ── Yahoo Finance (미국 주식) + Upbit USDT (환율) 병렬 조회 ──────────────────
// 주식 가격: Yahoo v7/v8 경쟁 (proxy)
// 환율: Upbit USDT 직접 호출 (실시간, proxy 캐시 없음)
async function fetchYahooUsdAndFx(symbol: string): Promise<{ priceUsd: number; usdKrwRate: number }> {
  const sym = encodeURIComponent(symbol);

  // 주식 가격 — v7(quote)와 v8(chart) 병렬 경쟁
  const stockPromise = Promise.any([
    fetchWithProxy(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${sym}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ).then((d) => {
      const p = (d as any)?.quoteResponse?.result?.[0]?.regularMarketPrice as number;
      if (!p) throw new Error('no price v7');
      return p;
    }),
    fetchWithProxy(
      `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ).then((d) => {
      const p = (d as any)?.chart?.result?.[0]?.meta?.regularMarketPrice as number;
      if (!p) throw new Error('no price v8');
      return p;
    }),
  ]).catch(() => { throw new Error('가격 없음 (심볼 확인)'); });

  // 환율 — Upbit USDT (직접 호출, 실시간) → Yahoo fallback
  const fxPromise = fetchUpbitBatch(['USDT'])
    .then((p) => {
      const r = p['USDT'];
      if (!r || r < 900 || r > 2500) throw new Error('invalid upbit usdt');
      return r;
    })
    .catch(() => fetchUsdKrwRate());

  const [priceUsd, usdKrwRate] = await Promise.all([stockPromise, fxPromise]);
  return { priceUsd, usdKrwRate };
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
      const { priceUsd, usdKrwRate } = await fetchYahooUsdAndFx(source.symbol);
      // update cache so subsequent assets reuse this fresh rate
      cachedUsdKrw = { rate: usdKrwRate, ts: Date.now() };
      return { price: Math.round(priceUsd * usdKrwRate), priceUsd, usdKrwRate };
    }

    case 'upbit': {
      const prices = await fetchUpbitBatch([source.symbol]);
      const price = prices[source.symbol.toUpperCase()];
      if (!price) throw new Error('가격 데이터 없음');
      return { price };
    }

    default:
      throw new Error('수동 입력');
  }
}

export async function fetchAllPrices(
  assets: Asset[],
  apiKey?: string,
): Promise<PriceFetchResult[]> {
  const linked = assets.filter((a) => a.priceSource && a.priceSource.type !== 'manual');

  // Upbit 자산(암호화폐)을 단일 배치 호출로 통합 → rate limit 방지
  const upbitAssets = linked.filter((a) => a.priceSource?.type === 'upbit');
  // 암호화폐만 배치로 묶음. USDT는 포함하지 않음 —
  // USDT로 cachedUsdKrw를 선점하면 fetchUsdKrwRate()가 캐시 히트 후
  // Yahoo Finance USDKRW=X를 건너뛰어 stale한 Upbit USDT 환율이 고착됨
  const upbitCoins = upbitAssets.map((a) => a.priceSource!.symbol.toUpperCase());

  let upbitMap: Record<string, number> = {};
  if (upbitCoins.length > 0) {
    try {
      upbitMap = await fetchUpbitBatch(upbitCoins);
    } catch {
      // 실패 시 개별 처리로 폴백
    }
  }

  // 자산당 최대 15초 하드 타임아웃 — 프록시가 무한 대기해도 UI 안 걸림
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('조회 시간 초과')), ms))]);

  return Promise.all(
    linked.map(async (asset) => {
      try {
        const src = asset.priceSource!;

        // 이미 배치 조회한 Upbit 자산은 캐시에서 바로 반환
        if (src.type === 'upbit') {
          const price = upbitMap[src.symbol.toUpperCase()];
          if (price) return { assetId: asset.id, price };
        }

        const result = await withTimeout(fetchPrice(src, apiKey), 15_000);
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
