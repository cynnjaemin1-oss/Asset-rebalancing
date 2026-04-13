import { useState, useEffect, FormEvent } from 'react';
import { Asset, Category, PriceSourceType } from '../types';
import { generateId } from '../utils/rebalance';
import { PRICE_SOURCE_LABELS, SYMBOL_HINTS, fetchPrice } from '../utils/priceFeed';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (asset: Asset) => void;
  categories: Category[];
  editAsset?: Asset | null;
  apiKey?: string;
}

interface FormState {
  name: string;
  ticker: string;
  categoryId: string;
  shares: string;        // 문자열로 관리 → 소수점 입력 가능
  averagePrice: string;
  currentPrice: string;
  priceSourceType: PriceSourceType;
  priceSymbol: string;
  investCapEnabled: boolean;
  investCap: string;     // 투자 한도 (원), 비어있으면 무제한
}

function toStr(n: number) {
  return n === 0 ? '' : String(n);
}

export default function AssetModal({ isOpen, onClose, onSave, categories, editAsset, apiKey }: Props) {
  const empty: FormState = {
    name: '', ticker: '', categoryId: categories[0]?.id ?? '',
    shares: '', averagePrice: '', currentPrice: '',
    priceSourceType: 'manual', priceSymbol: '',
    investCapEnabled: false, investCap: '',
  };

  const [form, setForm] = useState<FormState>(empty);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [fetchNote, setFetchNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editAsset) {
      setForm({
        name: editAsset.name,
        ticker: editAsset.ticker,
        categoryId: editAsset.categoryId,
        shares: toStr(editAsset.shares),
        averagePrice: toStr(editAsset.averagePrice),
        currentPrice: toStr(editAsset.currentPrice),
        priceSourceType: editAsset.priceSource?.type ?? 'manual',
        priceSymbol: editAsset.priceSource?.symbol ?? '',
        investCapEnabled: editAsset.investCap != null,
        investCap: editAsset.investCap != null ? String(editAsset.investCap) : '',
      });
    } else {
      setForm({ ...empty, categoryId: categories[0]?.id ?? '' });
    }
    setFetchError('');
    setFetchNote('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const needsSymbol = !['manual', 'krx_gold'].includes(form.priceSourceType);
  const isLinked = form.priceSourceType !== 'manual';

  async function handleFetchPrice() {
    setFetching(true);
    setFetchError('');
    setFetchNote('');
    try {
      const result = await fetchPrice(
        { type: form.priceSourceType, symbol: form.priceSymbol.trim() },
        apiKey
      );
      setForm((f) => ({ ...f, currentPrice: String(Math.round(result.price)) }));
      if (result.usdKrwRate) {
        const label = form.priceSourceType === 'krx_gold'
          ? `원/g`
          : `$${result.priceUsd?.toFixed(2)}`;
        setFetchNote(`${label} × ₩${Math.round(result.usdKrwRate).toLocaleString()}/$ 적용`);
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : '가격 조회 실패');
    } finally {
      setFetching(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const capVal = form.investCapEnabled ? parseFloat(form.investCap.replace(/,/g, '')) : NaN;
    onSave({
      id: editAsset?.id ?? generateId(),
      name: form.name,
      ticker: form.ticker,
      categoryId: form.categoryId,
      shares: parseFloat(form.shares) || 0,
      averagePrice: parseFloat(form.averagePrice) || 0,
      currentPrice: parseFloat(form.currentPrice) || 0,
      priceSource:
        form.priceSourceType !== 'manual'
          ? { type: form.priceSourceType, symbol: form.priceSymbol.trim() }
          : undefined,
      investCap: form.investCapEnabled && !isNaN(capVal) && capVal > 0 ? capVal : undefined,
    });
    onClose();
  }

  const inputCls =
    'w-full px-4 py-3 rounded-2xl border border-black/10 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-black/20';
  const labelCls = 'text-xs font-bold uppercase tracking-wider text-gray-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-t-3xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{editAsset ? '자산 수정' : '자산 추가'}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelCls}>종목명</label>
              <input type="text" required placeholder="e.g. Apple Inc." className={inputCls}
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>티커</label>
              <input type="text" required placeholder="e.g. AAPL" className={inputCls}
                value={form.ticker}
                onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>카테고리</label>
            <select required className={inputCls} value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelCls}>
                보유 수량
                {form.priceSourceType === 'krx_gold' && (
                  <span className="ml-1 normal-case font-normal text-blue-500">(g)</span>
                )}
              </label>
              {/* 소수점 자유 입력: type="text" + inputmode="decimal" */}
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                className={inputCls}
                value={form.shares}
                onChange={(e) => {
                  // 숫자, 소수점, 마이너스만 허용
                  if (/^-?\d*\.?\d*$/.test(e.target.value) || e.target.value === '') {
                    setForm({ ...form, shares: e.target.value });
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>평균단가 (원)</label>
              <input type="text" inputMode="decimal" placeholder="0" className={inputCls}
                value={form.averagePrice}
                onChange={(e) => {
                  if (/^\d*\.?\d*$/.test(e.target.value) || e.target.value === '')
                    setForm({ ...form, averagePrice: e.target.value });
                }} />
            </div>
          </div>

          {/* 현재가 연동 */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="space-y-1.5">
              <label className={labelCls}>현재가 연동</label>
              <select className={inputCls} value={form.priceSourceType}
                onChange={(e) => setForm({ ...form, priceSourceType: e.target.value as PriceSourceType, priceSymbol: '' })}>
                {(Object.keys(PRICE_SOURCE_LABELS) as PriceSourceType[]).map((key) => (
                  <option key={key} value={key}>{PRICE_SOURCE_LABELS[key]}</option>
                ))}
              </select>
            </div>

            {isLinked && needsSymbol && (
              <div className="space-y-1.5">
                <label className={labelCls}>심볼 / 코드</label>
                <div className="flex gap-2">
                  <input type="text" className={`${inputCls} flex-1`}
                    placeholder={SYMBOL_HINTS[form.priceSourceType]}
                    value={form.priceSymbol}
                    onChange={(e) => setForm({ ...form, priceSymbol: e.target.value })} />
                  <button type="button" onClick={handleFetchPrice}
                    disabled={fetching || !form.priceSymbol.trim()}
                    className="px-4 py-2 bg-black text-white rounded-2xl text-sm font-medium disabled:opacity-40 whitespace-nowrap">
                    {fetching ? '조회중' : '조회'}
                  </button>
                </div>
                <p className="text-xs text-gray-400">{SYMBOL_HINTS[form.priceSourceType]}</p>
              </div>
            )}

            {isLinked && !needsSymbol && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-400">{SYMBOL_HINTS[form.priceSourceType]}</p>
                <button type="button" onClick={handleFetchPrice} disabled={fetching}
                  className="w-full py-2 bg-black text-white rounded-2xl text-sm font-medium disabled:opacity-40">
                  {fetching ? '조회중...' : '현재가 조회 (M04020000)'}
                </button>
              </div>
            )}

            {fetchError && <p className="text-xs text-red-500">{fetchError}</p>}
            {fetchNote && <p className="text-xs text-blue-500">{fetchNote}</p>}

            <div className="space-y-1.5">
              <label className={labelCls}>
                현재가 (원{form.priceSourceType === 'krx_gold' ? '/g' : ''})
                {isLinked && <span className="text-green-500 normal-case font-normal ml-1">· 연동됨</span>}
              </label>
              <input type="text" inputMode="decimal" placeholder="0" className={inputCls}
                value={form.currentPrice}
                onChange={(e) => {
                  if (/^\d*\.?\d*$/.test(e.target.value) || e.target.value === '')
                    setForm({ ...form, currentPrice: e.target.value });
                }} />
            </div>
          </div>

          {/* 투자 한도 (ISA 등) */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className={labelCls}>투자 한도</label>
                <p className="text-xs text-gray-400 mt-0.5">ISA 연한도 등 매수 상한 설정</p>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, investCapEnabled: !f.investCapEnabled, investCap: '' }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.investCapEnabled ? 'bg-black' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.investCapEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {form.investCapEnabled && (
              <div className="space-y-1.5">
                <label className={labelCls}>최대 매수 금액 (원)</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 font-medium">₩</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="20,000,000"
                    className={`${inputCls} flex-1`}
                    value={form.investCap}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setForm((f) => ({ ...f, investCap: raw === '' ? '' : Number(raw).toLocaleString() }));
                    }}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  설정 시 투자계획에서 이 금액까지만 매수하고 초과분은 같은 카테고리의 다른 자산으로 배분됩니다
                </p>
              </div>
            )}
          </div>

          <button type="submit" className="w-full py-3 bg-black text-white rounded-2xl font-semibold text-sm">
            {editAsset ? '수정 완료' : '추가하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
