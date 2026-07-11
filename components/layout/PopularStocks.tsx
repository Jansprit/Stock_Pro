'use client';

import { Sparkles } from 'lucide-react';

interface PopularStocksProps {
  onSelect: (symbol: string) => void;
}

const POPULAR: Array<{ symbol: string; name: string }> = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'META', name: 'Meta' },
  { symbol: '2330.TW', name: '台積電' },
];

export function PopularStocks({ onSelect }: PopularStocksProps) {
  return (
    <div className="flex flex-col items-center py-12">
      <div className="mb-6 flex items-center gap-2 text-fg-muted">
        <Sparkles className="h-4 w-4" />
        <span className="text-sm">熱門股票快捷查詢</span>
      </div>
      <div className="grid w-full max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4">
        {POPULAR.map((p) => (
          <button
            key={p.symbol}
            type="button"
            onClick={() => onSelect(p.symbol)}
            className="
              group flex flex-col items-start rounded-lg border border-edge bg-card
              px-4 py-3 text-left shadow-sm transition-all
              hover:border-brand-500/50 hover:bg-hover
            "
          >
            <span className="font-mono text-sm font-semibold text-fg group-hover:text-brand-500">
              {p.symbol}
            </span>
            <span className="mt-0.5 text-xs text-fg-muted">{p.name}</span>
          </button>
        ))}
      </div>
      <p className="mt-8 text-xs text-fg-subtle">
        或在上方搜尋欄輸入股票代碼、公司名稱（中文或英文皆可）
      </p>
    </div>
  );
}
