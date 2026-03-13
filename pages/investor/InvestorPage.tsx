
import React, { useState, useEffect } from 'react';
import { Stock, NewsItem } from '../../types';
import StockList from '../../components/StockList';
import NewsSection from '../../components/NewsSection';
import AnalysisPanel from '../../components/AnalysisPanel';
import ProfilePage from '../../components/ProfilePage';
import { fetchStockSummaries, fetchMarketNews } from '../../services/stockService';

const WATCHLIST_STORAGE_KEY = 'ai_investor_watchlist';
const DEFAULT_SYMBOLS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'GOOGL'];

export const InvestorPage: React.FC = () => {
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(() => {
    const saved = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_SYMBOLS;
  });
  
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [marketNews, setMarketNews] = useState<NewsItem[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(() => {
    const saved = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const symbols = saved ? JSON.parse(saved) : DEFAULT_SYMBOLS;
    return symbols.length > 0 ? symbols[0] : null;
  });
  
  const [currentPage, setCurrentPage] = useState<'main' | 'profile'>('main');
  const [newsToInterpret, setNewsToInterpret] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setNewsLoading(true);
      try {
        const stockData = await fetchStockSummaries(watchlistSymbols);
        setStocks(stockData);
        
        const newsData = await fetchMarketNews('market news');
        setMarketNews(newsData);
      } catch (err) {
        console.error("Failed to load global data", err);
      } finally {
        setLoading(false);
        setNewsLoading(false);
      }
    };

    loadData();
    const interval = setInterval(async () => {
      const stockData = await fetchStockSummaries(watchlistSymbols);
      setStocks(stockData);
      const newsData = await fetchMarketNews('market news');
      setMarketNews(newsData);
    }, 60000); 
    
    return () => clearInterval(interval);
  }, [watchlistSymbols]);

  const selectedStock = stocks.find(s => s.id === selectedStockId) || null;

  const handleAddStock = (symbol: string) => {
    const upperSymbol = symbol.toUpperCase();
    if (!watchlistSymbols.includes(upperSymbol)) {
      setWatchlistSymbols(prev => [upperSymbol, ...prev]);
    }
    setSelectedStockId(upperSymbol);
  };

  const handleRemoveStock = (symbol: string) => {
    setWatchlistSymbols(prev => {
      const next = prev.filter(s => s !== symbol);
      if (selectedStockId === symbol) {
        setSelectedStockId(next.length > 0 ? next[0] : null);
      }
      return next;
    });
  };

  const handleInterpretNews = (news: NewsItem) => {
    setNewsToInterpret(news);
    if (currentPage !== 'main') setCurrentPage('main');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Navigation Header */}
      <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-800">
            AI 投资 Agent
          </span>
        </div>

        <nav className="flex items-center gap-1">
          <button 
            onClick={() => setCurrentPage('main')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentPage === 'main' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            行情分析
          </button>
          <button 
            onClick={() => setCurrentPage('profile')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentPage === 'profile' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            策略中心
          </button>
        </nav>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {currentPage === 'main' ? (
          <>
            <aside className="w-80 shrink-0">
              <StockList 
                stocks={stocks} 
                selectedId={selectedStockId} 
                onSelect={setSelectedStockId}
                onAddStock={handleAddStock}
                onRemoveStock={handleRemoveStock}
                loading={loading && stocks.length === 0}
              />
            </aside>

            <section className="flex-1 flex flex-col overflow-hidden relative">
              <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50/50">
                <div className="flex-1 flex flex-col">
                   <AnalysisPanel 
                     stock={selectedStock} 
                     relevantNews={marketNews}
                     triggerNews={newsToInterpret}
                   />
                </div>
                
                <div className="p-6">
                  <NewsSection 
                    news={marketNews} 
                    onInterpret={handleInterpretNews} 
                    loading={newsLoading}
                  />
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <ProfilePage />
          </div>
        )}
      </main>

      <div className="h-8 bg-white border-t border-slate-200 px-4 flex items-center justify-between shrink-0 text-[9px] text-slate-400 font-medium">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
            行情源: Yahoo Finance 
          </span>
        </div>
        <div className="flex gap-4 items-center">
          <span>同步频率: 60s / 次</span>
          <span>更新于: {new Date().toLocaleTimeString('zh-CN', {hour12: false})}</span>
        </div>
      </div>
    </div>
  );
};

export default InvestorPage;

