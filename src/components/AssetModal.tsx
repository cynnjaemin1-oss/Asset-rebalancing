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
}

const emptyForm = {
  name: '',
  ticker: '',
  categoryId: '',
  shares: 0,
  averagePrice: 0,
  currentPrice: 0,
  priceSourceType: 'manual' as PriceSourceType,
  priceSymbol: '',
};

export default function AssetModal({ isOpen, onClose, onSave, categories, editAsset }: Props) {
  const [formData, setFormData] = useState(emptyForm);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (editAsset) {
      setFormData({
        name: editAsset.name,
        ticker: editAsset.ticker,
        categoryId: editAsset.categoryId,
        shares: editAsset.shares,
        averagePrice: editAsset.averagePrice,
        currentPrice: editAsset.currentPrice,
        priceSourceType: editAsset.priceSource?.type ?? 'manual',
        priceSymbol: editAsset.priceSource?.symbol ?? '',
      });
    } else {
      setFormData({ ...emptyForm, categoryId: categories[0]?.id ?? '' });
    }
    setFetchError('');
  }, [editAsset, categories, isOpen]);

  if (!isOpen) return null;

  async function handleFetchPrice() {
    if (!formData.priceSymbol.trim()) return;
    setFetching(true);
    setFetchError('');
    try {
      const price = await fetchPrice({
        type: formData.priceSourceType,
        symbol: formData.priceSymbol.trim(),
      });
      setFormData((f) => ({ ...f, currentPrice: price }));
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : '가격 조회 실패');
    } finally {
      setFetching(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSave({
      id: editAsset?.id ?? generateId(),
      name: formData.name,
      ticker: formData.ticker,
      categoryId: formData.categoryId,
      shares: formData.shares,
      averagePrice: formData.averagePrice,
      currentPrice: formData.currentPrice,
      priceSource:
        formData.priceSourceType !== 'manual'
          ? { type: formData.priceSourceType, symbol: formData.priceSymbol.trim() }
          : undefined,
    });
    onClose();
  }

  const inputCls =
    'w-full px-4 py-3 rounded-2xl border border-black/10 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-black/20';
  const labelCls = 'text-xs font-bold uppercase tracking-wider text-gray-500';
  const isLinked = formData.priceSourceType !== 'manual';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-t-3xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{editAsset ? '자산 수정' : '자산 추가'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelCls}>종목명</label>
              <input
                type="text" required placeholder="e.g. Apple Inc."
                className={inputCls} value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>티커</label>
              <input
                type="text" required placeholder="e.g. AAPL"
                className={inputCls} value={formData.ticker}
                onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>카테고리</label>
            <select
              required className={inputCls} value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelCls}>보유 수량</label>
              <input
                type="number" min="0" step="0.0001" className={inputCls}
                value={formData.shares || ''}
                onChange={(e) => setFormData({ ...formData, shares: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>평균단가</label>
              <input
                type="number" min="0" className={inputCls}
                value={formData.averagePrice || ''}
                onChange={(e) => setFormData({ ...formData, averagePrice: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* 현재가 연동 섹션 */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="space-y-1.5">
              <label className={labelCls}>현재가 연동</label>
              <select
                className={inputCls}
                value={formData.priceSourceType}
                onChange={(e) =>
                  setFormData({ ...formData, priceSourceType: e.target.value as PriceSourceType, priceSymbol: '' })
                }
              >
                {(Object.keys(PRICE_SOURCE_LABELS) as PriceSourceType[]).map((key) => (
                  <option key={key} value={key}>{PRICE_SOURCE_LABELS[key]}</option>
                ))}
              </select>
            </div>

            {isLinked && (
              <div className="space-y-1.5">
                <label className={labelCls}>심볼 / 코드</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className={`${inputCls} flex-1`}
                    placeholder={SYMBOL_HINTS[formData.priceSourceType]}
                    value={formData.priceSymbol}
                    onChange={(e) => setFormData({ ...formData, priceSymbol: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={handleFetchPrice}
                    disabled={fetching || !formData.priceSymbol.trim()}
                    className="px-4 py-2 bg-black text-white rounded-2xl text-sm font-medium disabled:opacity-40 whitespace-nowrap"
                  >
                    {fetching ? '조회중' : '조회'}
                  </button>
                </div>
                <p className="text-xs text-gray-400">{SYMBOL_HINTS[formData.priceSourceType]}</p>
                {fetchError && <p className="text-xs text-red-500">{fetchError}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <label className={labelCls}>현재가 {isLinked && <span className="text-green-500 normal-case font-normal">· 연동됨</span>}</label>
              <input
                type="number" min="0" className={inputCls}
                value={formData.currentPrice || ''}
                onChange={(e) => setFormData({ ...formData, currentPrice: Number(e.target.value) })}
                readOnly={false}
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-black text-white rounded-2xl font-semibold text-sm"
          >
            {editAsset ? '수정 완료' : '추가하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
