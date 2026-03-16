import { useState } from 'react';
import { Category } from '../types';
import { generateId } from '../utils/rebalance';

interface Props {
  categories: Category[];
  onUpdate: (categories: Category[]) => void;
}

const COLORS = ['#000000', '#374151', '#6B7280', '#D1D5DB', '#EF4444', '#3B82F6', '#10B981', '#F59E0B'];

export default function AllocationSettings({ categories, onUpdate }: Props) {
  const [newName, setNewName] = useState('');

  const total = categories.reduce((s, c) => s + c.targetPercent, 0);

  function addCategory() {
    if (!newName.trim()) return;
    const color = COLORS[categories.length % COLORS.length];
    onUpdate([...categories, { id: generateId(), name: newName.trim(), targetPercent: 0, color }]);
    setNewName('');
  }

  function updatePercent(id: string, value: number) {
    onUpdate(categories.map((c) => (c.id === id ? { ...c, targetPercent: value } : c)));
  }

  function deleteCategory(id: string) {
    onUpdate(categories.filter((c) => c.id !== id));
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-base">목표 배분</h2>
        <span className={`text-sm font-semibold ${total === 100 ? 'text-green-500' : 'text-red-500'}`}>
          합계 {total}%
        </span>
      </div>

      {/* Visual bar */}
      {categories.length > 0 && (
        <div className="flex rounded-full overflow-hidden h-3">
          {categories.map((cat) => (
            <div
              key={cat.id}
              style={{ width: `${cat.targetPercent}%`, backgroundColor: cat.color }}
              className="transition-all"
            />
          ))}
          {total < 100 && (
            <div style={{ width: `${100 - total}%` }} className="bg-gray-100" />
          )}
        </div>
      )}

      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: cat.color }}
            />
            <span className="flex-1 text-sm font-medium">{cat.name}</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="100"
                className="w-16 text-right border border-gray-200 rounded-xl px-2 py-1 text-sm"
                value={cat.targetPercent}
                onChange={(e) => updatePercent(cat.id, Number(e.target.value))}
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
            <button
              onClick={() => deleteCategory(cat.id)}
              className="text-gray-300 hover:text-red-400 text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="카테고리 이름"
          className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCategory()}
        />
        <button
          onClick={addCategory}
          className="px-4 py-2 bg-black text-white rounded-xl text-sm font-medium"
        >
          추가
        </button>
      </div>

      {total !== 100 && (
        <p className="text-xs text-red-400 text-center">
          합계가 100%가 되어야 합니다 (현재 {total}%)
        </p>
      )}
    </div>
  );
}
