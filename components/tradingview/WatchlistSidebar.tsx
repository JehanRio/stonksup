import React, { useEffect, useState } from 'react';
import { Stock } from '../../types';
import { searchStocks } from '../../services/stockService';

interface WatchlistSidebarProps {
  stocks: Stock[];
  selectedId: string | null;
  onOpenStock: (symbol: string) => void;
  onRemoveStock: (symbol: string) => void;
  onAddStock: (symbol: string) => void;
}

const formatChange = (value: number) => {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};

const WatchlistSidebar: React.FC<WatchlistSidebarProps> = ({
  stocks,
  selectedId,
  onOpenStock,
  onRemoveStock,
  onAddStock,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Partial<Stock>[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setSearching(true);
      const next = await searchStocks(query.trim());
      setResults(next.slice(0, 8));
      setSearching(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-white/10 bg-[#0c0f14]">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Watchlist</div>
          <div className="text-xs text-white/40">{stocks.length} symbols</div>
        </div>

        <div className="relative">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search symbol"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-10 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-400/50"
          />
          <svg className="absolute left-3 top-3 h-4 w-4 text-white/35" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {query.trim().length > 0 && (
        <div className="border-b border-white/10 px-3 py-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/35">Search Results</div>
          <div className="space-y-1">
            {searching ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-sm text-white/50">Searching...</div>
            ) : results.length > 0 ? (
              results.map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => {
                    if (!item.symbol) return;
                    onAddStock(item.symbol);
                    setQuery('');
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{item.symbol}</div>
                    <div className="mt-1 truncate text-xs text-white/45">{item.name || item.symbol}</div>
                  </div>
                  <span className="rounded-lg bg-cyan-400/15 px-2 py-1 text-[11px] font-semibold text-cyan-300">Add</span>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-sm text-white/50">No symbol found.</div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1.2fr_1fr_0.9fr] gap-2 border-b border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-white/30">
        <span>Symbol</span>
        <span className="text-right">Last</span>
        <span className="text-right">Chg%</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-1">
          {stocks.map((stock) => {
            const isActive = stock.id === selectedId;
            const positive = stock.changePercent >= 0;

            return (
              <div
                key={stock.id}
                className={`group rounded-xl border transition ${
                  isActive ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-transparent bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.05]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onOpenStock(stock.symbol)}
                  className="grid w-full grid-cols-[1.2fr_1fr_0.9fr_auto] items-center gap-2 px-3 py-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{stock.symbol}</div>
                    <div className="truncate text-[11px] text-white/40">{stock.name}</div>
                  </div>
                  <div className="text-right text-sm font-medium text-white">{Number.isFinite(stock.price) ? stock.price.toFixed(2) : '--'}</div>
                  <div className={`text-right text-sm font-medium ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>{formatChange(stock.changePercent)}</div>
                  <span
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveStock(stock.symbol);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition hover:bg-white/10 hover:text-white/70"
                  >
                    ×
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

export default WatchlistSidebar;
