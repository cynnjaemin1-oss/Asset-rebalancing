import { useState } from 'react';
import { Asset, Category } from '../types';
import AssetModal from './AssetModal';
import { formatKRW } from '../utils/rebalance';
import { fetchAllPrices, PRICE_SOURCE_LABELS } from '../utils/priceFeed';

interface Props {
  assets: Asset[];
  categories: Category[];
  onSave: (asset: Asset) => void;
  onDelete: (id: string) => void;
  onPriceUpdate: (updates: { id: string; price: number }[]) => void;
}

export default function AssetList({ assets, categories, onSave, onDelete, onPriceUpdate }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<Record<string, 'ok' | 'error'>>({});

  function openAdd() { setEditAsset(null); setModalOpen(true); }
  function openEdit(asset: Asset) { setEditAsset(asset); setModalOpen(true); }

  async function handleRefreshPrices() {
    setRefreshing(true);
    setRefreshStatus({});
    try {
      const results = await fetchAllPrices(assets);
      const updates: { id: string; price: number }[] = [];
      const status: Record<string, 'ok' | 'error'> = {};

      for (const r of results) {
        if (r.price !== undefined) {
          updates.push({ id: r.assetId, price: r.price });
          status[r.assetId] = 'ok';
        } else {
          status[r.assetId] = 'error';
        }
      }

      onPriceUpdate(updates);
      setRefreshStatus(status);
    } finally {
      setRefreshing(false);
    }
  }

  const linkedCount = assets.filter((a) => a.priceSource && a.priceSource.type !== 'manual').length;
  const getCategoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '-';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base">보유 자산</h2>
        <div className="flex gap-2">
          {linkedCount > 0 && (
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-full text-sm text-gray-600 disabled:opacity-50"
            >
              <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
              {refreshing ? '조회중...' : `현재가 갱신 (${linkedCount})`}
            </button>
          )}
          <button
            onClick={openAdd}
            className="px-4 py-1.5 bg-black text-white rounded-full text-sm font-medium"
          >
            + 추가
          </button>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          자산을 추가해보세요
        </div>
      ) : (
        <div className="space-y-3">
          {assets.map((asset) => {
            const value = asset.shares * asset.currentPrice;
            const gain = asset.shares * (asset.currentPrice - asset.averagePrice);
            const gainPct = asset.averagePrice > 0
              ? ((asset.currentPrice - asset.averagePrice) / asset.averagePrice) * 100
              : 0;
            const isLinked = asset.priceSource && asset.priceSource.type !== 'manual';
            const fetchOk = refreshStatus[asset.id] === 'ok';
            const fetchErr = refreshStatus[asset.id] === 'error';

            return (
              <div key={asset.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{asset.ticker}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {getCategoryName(asset.categoryId)}
                      </span>
                      {isLinked && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          fetchErr ? 'bg-red-50 text-red-400' :
                          fetchOk ? 'bg-green-50 text-green-500' :
                          'bg-blue-50 text-blue-500'
                        }`}>
                          {fetchErr ? '조회실패' : fetchOk ? '갱신완료' :
                            PRICE_SOURCE_LABELS[asset.priceSource!.type]}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{asset.name}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(asset)} className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1">수정</button>
                    <button onClick={() => onDelete(asset.id)} className="text-xs text-red-400 border border-red-100 rounded-lg px-2 py-1">삭제</button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs text-gray-400">평가금액</div>
                    <div className="text-sm font-semibold">₩{formatKRW(value)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">현재가</div>
                    <div className="text-sm font-semibold">₩{formatKRW(asset.currentPrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">수익률</div>
                    <div className={`text-sm font-semibold ${gain >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                      {gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AssetModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
        categories={categories}
        editAsset={editAsset}
      />
    </div>
  );
}
