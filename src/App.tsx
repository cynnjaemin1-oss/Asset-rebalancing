import { useState, useEffect } from 'react';
import { Asset, Category } from './types';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import AssetList from './components/AssetList';
import AllocationSettings from './components/AllocationSettings';
import RebalancingCalc from './components/RebalancingCalc';
import { generateId } from './utils/rebalance';

const DEFAULT_CATEGORIES: Category[] = [
  { id: generateId(), name: '국내주식', targetPercent: 30, color: '#000000' },
  { id: generateId(), name: '해외주식', targetPercent: 40, color: '#374151' },
  { id: generateId(), name: '채권', targetPercent: 20, color: '#6B7280' },
  { id: generateId(), name: '현금', targetPercent: 10, color: '#D1D5DB' },
];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [assets, setAssets] = useState<Asset[]>(() =>
    loadFromStorage('assets', [])
  );
  const [categories, setCategories] = useState<Category[]>(() =>
    loadFromStorage('categories', DEFAULT_CATEGORIES)
  );

  useEffect(() => {
    localStorage.setItem('assets', JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem('categories', JSON.stringify(categories));
  }, [categories]);

  function saveAsset(asset: Asset) {
    setAssets((prev) => {
      const idx = prev.findIndex((a) => a.id === asset.id);
      return idx >= 0
        ? prev.map((a) => (a.id === asset.id ? asset : a))
        : [...prev, asset];
    });
  }

  function deleteAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  const pages: Record<string, JSX.Element> = {
    dashboard: <Dashboard assets={assets} categories={categories} />,
    assets: (
      <AssetList
        assets={assets}
        categories={categories}
        onSave={saveAsset}
        onDelete={deleteAsset}
      />
    ),
    allocation: (
      <AllocationSettings categories={categories} onUpdate={setCategories} />
    ),
    rebalance: <RebalancingCalc assets={assets} categories={categories} />,
  };

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      {pages[tab]}
    </Layout>
  );
}
