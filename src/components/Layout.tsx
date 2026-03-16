import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'dashboard', label: '대시보드', icon: '📊' },
  { id: 'assets', label: '자산', icon: '💼' },
  { id: 'allocation', label: '배분', icon: '🎯' },
  { id: 'rebalance', label: '리밸런싱', icon: '⚖️' },
];

export default function Layout({ children, activeTab, onTabChange }: Props) {
  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto bg-white shadow-sm">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-bold tracking-tight">BalancePro</h1>
      </header>

      <main className="flex-1 overflow-auto pb-20">{children}</main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-200 flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
              activeTab === tab.id
                ? 'text-black font-semibold'
                : 'text-gray-400'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
