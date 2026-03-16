import { useState, useEffect, FormEvent } from 'react';
import { Asset, Category } from '../types';
import { generateId } from '../utils/rebalance';

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
};

export default function AssetModal({ isOpen, onClose, onSave, categories, editAsset }: Props) {
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    if (editAsset) {
      setFormData({
        name: editAsset.name,
        ticker: editAsset.ticker,
        categoryId: editAsset.categoryId,
        shares: editAsset.shares,
        averagePrice: editAsset.averagePrice,
        currentPrice: editAsset.currentPrice,
      });
    } else {
      setFormData({ ...emptyForm, categoryId: categories[0]?.id ?? '' });
    }
  }, [editAsset, categories, isOpen]);

  if (!isOpen) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSave({
      id: editAsset?.id ?? generateId(),
      ...formData,
    });
    onClose();
  }

  const inputCls =
    'w-full px-5 py-3 rounded-2xl border border-black/10 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-black/20';
  const labelCls = 'text-xs font-bold uppercase tracking-wider text-gray-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-t-3xl p-6 space-y-6 animate-in slide-in-from-bottom">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{editAsset ? '자산 수정' : '자산 추가'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={labelCls}>종목명</label>
              <input
                type="text"
                required
                placeholder="e.g. Apple Inc."
                className={inputCls}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className={labelCls}>티커</label>
              <input
                type="text"
                required
                placeholder="e.g. AAPL"
                className={inputCls}
                value={formData.ticker}
                onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelCls}>카테고리</label>
            <select
              required
              className={inputCls}
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={labelCls}>보유 수량</label>
              <input
                type="number"
                min="0"
                step="0.0001"
                className={inputCls}
                value={formData.shares || ''}
                onChange={(e) => setFormData({ ...formData, shares: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <label className={labelCls}>평균단가</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                value={formData.averagePrice || ''}
                onChange={(e) => setFormData({ ...formData, averagePrice: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelCls}>현재가</label>
            <input
              type="number"
              min="0"
              className={inputCls}
              value={formData.currentPrice || ''}
              onChange={(e) => setFormData({ ...formData, currentPrice: Number(e.target.value) })}
            />
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
