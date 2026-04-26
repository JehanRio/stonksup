import React, { useEffect, useState } from 'react';
import { Stock } from '../types';
import Sparkline from './Sparkline';
import { searchStocks } from '../services/stockService';

interface StockListProps {
  stocks: Stock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddStock: (symbol: string) => void;
  onRemoveStock: (symbol: string) => void;
  loading?: boolean;
}

const StockList: React.FC<StockListProps> = ({ stocks, selectedId, onSelect, onAddStock, onRemoveStock, loading }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Partial<Stock>[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length < 1) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      const results = await searchStocks(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
      <div className="border-b border-slate-200 px-5 pb-5 pt-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Watchlist</div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">自选市场</h2>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right shadow-sm">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Symbols</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{stocks.length}</div>
          </div>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="搜索股票代码，如 BABA / 0700.HK"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400"
          />
          <svg className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-3 pb-3 pt-3">
        {searchQuery.length > 0 && (
          <div className="absolute inset-3 z-20 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl">
            {isSearching ? (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3">
                <div className="h-7 w-7 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
                <span className="text-sm text-slate-500">搜索中...</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="divide-y divide-slate-100">
                <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">搜索结果</div>
                {searchResults.map((result) => (
                  <button
                    key={result.symbol}
                    type="button"
                    onClick={() => {
                      onAddStock(result.symbol!);
                      setSearchQuery('');
                    }}
                    className="flex w-full items-center justify-between px-4 py-4 text-left transition hover:bg-slate-50"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-900">{result.symbol}</div>
                      <div className="mt-1 max-w-[180px] truncate text-xs text-slate-500">{result.name}</div>
                    </div>
                    <div className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">加入</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-full min-h-[180px] items-center justify-center px-8 text-center text-sm text-slate-500">
                没有找到匹配代码。
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-3 p-2">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="rounded-[24px] border border-slate-200 bg-white p-4 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-16 rounded bg-slate-100"></div>
                    <div className="h-3 w-24 rounded bg-slate-50"></div>
                  </div>
                  <div className="h-10 w-24 rounded-2xl bg-slate-50"></div>
                </div>
              </div>
            ))}
          </div>
        ) : stocks.length === 0 ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-[26px] border border-dashed border-slate-200 bg-white px-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-50">
              <svg className="h-8 w-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <div className="mt-4 text-base font-semibold text-slate-900">暂无自选股票</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">先通过上方搜索框加入你要跟踪的标的。</div>
          </div>
        ) : (
          <div className="space-y-3">
            {stocks.map((stock) => {
              const safePrice = Number.isFinite(stock.price) ? stock.price : 0;
              const safeChange = Number.isFinite(stock.change) ? stock.change : 0;
              const safeChangePercent = Number.isFinite(stock.changePercent) ? stock.changePercent : 0;
              const active = selectedId === stock.id;

              return (
                <div
                  key={stock.id}
                  className={`group relative overflow-hidden rounded-[24px] border transition ${
                    active
                      ? 'border-blue-300 bg-[linear-gradient(135deg,rgba(239,246,255,1)_0%,rgba(255,255,255,1)_100%)] shadow-[0_16px_40px_-28px_rgba(37,99,235,0.5)]'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <button type="button" onClick={() => onSelect(stock.id)} className="w-full p-4 text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-base font-bold ${active ? 'text-blue-700' : 'text-slate-900'}`}>{stock.symbol}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              safeChange >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                            }`}
                          >
                            {safeChange >= 0 ? 'Up' : 'Down'}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">{stock.name}</div>
                      </div>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveStock(stock.symbol);
                        }}
                        className="opacity-0 transition group-hover:opacity-100"
                        title="删除自选"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:text-rose-500">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </span>
                      </button>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-4">
                      <div>
                        <div className="text-2xl font-bold tracking-tight text-slate-900">{safePrice.toFixed(2)}</div>
                        <div className={`mt-1 text-sm font-semibold ${safeChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {safeChange >= 0 ? '+' : ''}
                          {safeChange.toFixed(2)} / {safeChangePercent.toFixed(2)}%
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <Sparkline data={stock.sparkline} color={safeChange >= 0 ? '#10b981' : '#ef4444'} />
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StockList;
