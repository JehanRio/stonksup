
import React, { useState, useEffect } from 'react';
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
      if (searchQuery.trim().length >= 1) {
        setIsSearching(true);
        const results = await searchStocks(searchQuery);
        setSearchResults(results);
        setIsSearching(false);
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-white z-10 space-y-3 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
           <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
           </svg>
           自选股市场
        </h2>
        
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="搜索股票代码 (如 BABA, 0700.HK)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
          />
          <svg className="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        {/* Search Results Overlay */}
        {searchQuery.length > 0 && (
          <div className="absolute inset-0 bg-white z-20">
            {isSearching ? (
              <div className="p-10 flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-slate-500 font-medium">同步交易所联想词...</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="divide-y divide-slate-50">
                <div className="px-4 py-2 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">搜索结果</div>
                {searchResults.map((res) => (
                  <button
                    key={res.symbol}
                    onClick={() => {
                      onAddStock(res.symbol!);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between p-4 hover:bg-blue-50 transition-colors text-left group"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-sm group-hover:text-blue-600">{res.symbol}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[160px]">{res.name}</div>
                    </div>
                    <div className="w-7 h-7 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="text-3xl mb-3">🔍</div>
                <div className="text-xs text-slate-400 font-medium italic">未找到匹配的股票代码</div>
              </div>
            )}
          </div>
        )}

        {/* Watchlist */}
        {loading ? (
          <div className="p-6 space-y-6">
             {[1,2,3,4,5].map(i => (
               <div key={i} className="animate-pulse flex justify-between">
                 <div className="space-y-2">
                   <div className="h-4 w-12 bg-slate-100 rounded"></div>
                   <div className="h-3 w-20 bg-slate-50 rounded"></div>
                 </div>
                 <div className="h-8 w-24 bg-slate-50 rounded"></div>
               </div>
             ))}
          </div>
        ) : stocks.length === 0 ? (
          <div className="p-12 text-center">
             <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
               <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
               </svg>
             </div>
             <p className="text-sm text-slate-400 font-medium">暂无自选股</p>
             <p className="text-[10px] text-slate-300 mt-1">请使用上方搜索框添加</p>
          </div>
        ) : (
          stocks.map((stock) => (
            <div 
              key={stock.id}
              className={`group relative border-b border-slate-50 transition-all overflow-hidden ${
                selectedId === stock.id ? 'bg-blue-50/60' : 'hover:bg-slate-50'
              }`}
            >
              <button
                onClick={() => onSelect(stock.id)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex flex-col items-start">
                  <span className={`font-bold text-sm ${selectedId === stock.id ? 'text-blue-700' : 'text-slate-900'}`}>{stock.symbol}</span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider truncate max-w-[100px]">{stock.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Sparkline data={stock.sparkline} color={stock.change >= 0 ? '#10b981' : '#ef4444'} />
                  <div className="flex flex-col items-end min-w-[70px]">
                    <span className="font-bold text-slate-900 text-sm">{stock.price.toFixed(2)}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stock.change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </button>
              
              {/* Delete Button - Better visibility and placement */}
              <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveStock(stock.symbol);
                  }}
                  className="w-6 h-6 flex items-center justify-center bg-white/80 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-full border border-slate-100 shadow-sm transition-colors backdrop-blur-sm"
                  title="从自选股中删除"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StockList;
