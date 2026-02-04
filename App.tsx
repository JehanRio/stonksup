
import React, { useState, useEffect } from 'react';
import { Stock, NewsItem } from './types';
import StockList from './components/StockList';
import NewsSection from './components/NewsSection';
import AnalysisPanel from './components/AnalysisPanel';
import ProfilePage from './components/ProfilePage';
import { fetchStockSummaries, fetchMarketNews } from './services/stockService';

const WATCHLIST_STORAGE_KEY = 'ai_investor_watchlist';
const DEFAULT_SYMBOLS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'GOOGL'];

const App: React.FC = () => {
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

  // Load stocks and news
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
    // If not on main page, switch back
    if (currentPage !== 'main') setCurrentPage('main');
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden">
      {/* Navigation Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-30 shadow-sm relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg border border-blue-400">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-800 tracking-tight">
            AI 投资 Agent
          </span>
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full animate-pulse">
              LIVE
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-50 text-slate-400 border border-slate-200 rounded-full">
              v1.3
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <button 
            onClick={() => setCurrentPage('main')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              currentPage === 'main' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            行情分析
          </button>
          <button 
            onClick={() => setCurrentPage('profile')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              currentPage === 'profile' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            策略中心
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {currentPage === 'main' ? (
          <>
            {/* Sidebar: Watchlist */}
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

            {/* Main Area: Analysis & News */}
            <section className="flex-1 flex flex-col overflow-hidden relative">
              <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50/50">
                <div className="flex-1 flex flex-col">
                   <AnalysisPanel 
                     stock={selectedStock} 
                     relevantNews={marketNews}
                     triggerNews={newsToInterpret}
                   />
                </div>
                
                {/* Real-time News Section */}
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

      {/* Sticky Bottom Status */}
      <footer className="h-10 bg-white border-t border-slate-200 px-6 flex items-center justify-between shrink-0 text-[10px] text-slate-400 font-medium z-30">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></span>
            行情源: Yahoo Finance 
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_#3b82f6]"></span>
            资讯源: Seeking Alpha / Fox / Reuters
          </span>
        </div>
        <div className="flex gap-6 items-center">
          <span className="flex items-center gap-1">API Key: 有效</span>
          <span className="text-slate-200">|</span>
          <span>同步频率: 60s / 次</span>
          <span className="text-slate-200">|</span>
          <span>更新于: {new Date().toLocaleTimeString('zh-CN', {hour12: false})}</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
