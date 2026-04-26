import React, { useEffect, useState } from 'react';
import { NewsItem, OHLC, Stock, Timeframe } from '../../types';
import ProfilePage from '../../components/ProfilePage';
import WatchlistSidebar from '../../components/tradingview/WatchlistSidebar';
import MarketSummaryPage from '../../components/tradingview/MarketSummaryPage';
import StockDetailPage from '../../components/tradingview/StockDetailPage';
import FullChartPage from '../../components/tradingview/FullChartPage';
import { fetchMarketNews, fetchStockHistory, fetchStockSummaries } from '../../services/stockService';

const WATCHLIST_STORAGE_KEY = 'ai_investor_watchlist';
const DEFAULT_SYMBOLS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META'];

type InvestorView = 'summary' | 'detail' | 'full-chart' | 'journal';

const DEFAULT_TAB_TITLE = 'Trading Desk';

type InvestorRoute = {
  view: InvestorView;
  symbol: string | null;
  detailTimeframe?: Timeframe;
  fullChartTimeframe?: Timeframe;
};

const parseTimeframe = (value: string | null): Timeframe | undefined => {
  if (value === 'INTRADAY' || value === '5D' || value === 'DAILY' || value === 'MONTHLY') return value;
  return undefined;
};

const parseInvestorHash = (): InvestorRoute => {
  const rawHash = window.location.hash || '#/investor/summary';
  const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  const [pathPart, queryPart] = hash.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const params = new URLSearchParams(queryPart || '');

  if (segments[0] !== 'investor') {
    return { view: 'summary', symbol: null };
  }

  if (segments[1] === 'journal') {
    return { view: 'journal', symbol: null };
  }

  if (segments[1] === 'stock' && segments[2]) {
    const symbol = decodeURIComponent(segments[2]).toUpperCase();

    if (segments[3] === 'chart') {
      return {
        view: 'full-chart',
        symbol,
        fullChartTimeframe: parseTimeframe(params.get('tf')) ?? 'DAILY',
      };
    }

    return {
      view: 'detail',
      symbol,
      detailTimeframe: parseTimeframe(params.get('tf')) ?? 'INTRADAY',
    };
  }

  return { view: 'summary', symbol: null };
};

const buildInvestorHash = (route: InvestorRoute) => {
  if (route.view === 'journal') return '#/investor/journal';
  if (route.view === 'summary') return '#/investor/summary';
  if (!route.symbol) return '#/investor/summary';

  if (route.view === 'full-chart') {
    return `#/investor/stock/${encodeURIComponent(route.symbol)}/chart?tf=${route.fullChartTimeframe ?? 'DAILY'}`;
  }

  return `#/investor/stock/${encodeURIComponent(route.symbol)}?tf=${route.detailTimeframe ?? 'INTRADAY'}`;
};

const InvestorPage: React.FC = () => {
  const initialRoute = parseInvestorHash();
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(() => {
    const saved = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const stored = saved ? JSON.parse(saved) : DEFAULT_SYMBOLS;
    if (initialRoute.symbol && !stored.includes(initialRoute.symbol)) {
      return [initialRoute.symbol, ...stored];
    }
    return stored;
  });
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(() => {
    if (initialRoute.symbol) return initialRoute.symbol;
    const saved = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const symbols = saved ? JSON.parse(saved) : DEFAULT_SYMBOLS;
    return symbols[0] || null;
  });
  const [view, setView] = useState<InvestorView>(initialRoute.view);
  const [summaryHistory, setSummaryHistory] = useState<OHLC[]>([]);
  const [detailHistory, setDetailHistory] = useState<OHLC[]>([]);
  const [fullChartHistory, setFullChartHistory] = useState<OHLC[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fullChartLoading, setFullChartLoading] = useState(false);
  const [detailTimeframe, setDetailTimeframe] = useState<Timeframe>(initialRoute.detailTimeframe ?? 'INTRADAY');
  const [fullChartTimeframe, setFullChartTimeframe] = useState<Timeframe>(initialRoute.fullChartTimeframe ?? 'DAILY');

  useEffect(() => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);

  useEffect(() => {
    return () => {
      document.title = DEFAULT_TAB_TITLE;
    };
  }, []);

  useEffect(() => {
    const applyHashRoute = () => {
      const route = parseInvestorHash();

      if (route.symbol) {
        setWatchlistSymbols((prev) => (prev.includes(route.symbol!) ? prev : [route.symbol!, ...prev]));
        setSelectedStockId(route.symbol);
      }

      setView(route.view);

      if (route.detailTimeframe) {
        setDetailTimeframe(route.detailTimeframe);
      }

      if (route.fullChartTimeframe) {
        setFullChartTimeframe(route.fullChartTimeframe);
      }
    };

    window.addEventListener('hashchange', applyHashRoute);
    applyHashRoute();

    return () => window.removeEventListener('hashchange', applyHashRoute);
  }, []);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [stockData, newsData] = await Promise.all([
          fetchStockSummaries(watchlistSymbols),
          fetchMarketNews('market news'),
        ]);
        setStocks(stockData);
        setNews(newsData);
      } catch (error) {
        console.error('Failed to load dashboard', error);
      }
    };

    loadDashboard();
    const interval = window.setInterval(loadDashboard, 60000);
    return () => window.clearInterval(interval);
  }, [watchlistSymbols]);

  const selectedStock = stocks.find((item) => item.id === selectedStockId) || null;

  useEffect(() => {
    if (view === 'journal') {
      document.title = 'Trading Journal';
      return;
    }

    if (!selectedStock || !Number.isFinite(selectedStock.price) || !Number.isFinite(selectedStock.changePercent)) {
      document.title = DEFAULT_TAB_TITLE;
      return;
    }

    const changePrefix = selectedStock.changePercent >= 0 ? '+' : '';
    document.title = `${selectedStock.symbol} ${selectedStock.price.toFixed(2)} ${changePrefix}${selectedStock.changePercent.toFixed(2)}%`;
  }, [selectedStock, view]);

  useEffect(() => {
    const nextHash = buildInvestorHash({
      view,
      symbol: selectedStockId,
      detailTimeframe,
      fullChartTimeframe,
    });

    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
  }, [detailTimeframe, fullChartTimeframe, selectedStockId, view]);

  useEffect(() => {
    const symbol = selectedStock?.symbol;
    if (!symbol) return;

    const loadSummaryHistory = async () => {
      setSummaryLoading(true);
      try {
        const result = await fetchStockHistory(symbol, 'INTRADAY');
        setSummaryHistory(result.history);
      } catch (error) {
        console.error('Failed to load summary history', error);
        setSummaryHistory([]);
      } finally {
        setSummaryLoading(false);
      }
    };

    loadSummaryHistory();
  }, [selectedStock?.symbol]);

  useEffect(() => {
    if (view !== 'detail' && view !== 'full-chart') return;
    const symbol = selectedStock?.symbol;
    if (!symbol) return;

    const loadDetailHistory = async () => {
      setDetailLoading(true);
      try {
        const result = await fetchStockHistory(symbol, detailTimeframe);
        setDetailHistory(result.history);
      } catch (error) {
        console.error('Failed to load detail history', error);
        setDetailHistory([]);
      } finally {
        setDetailLoading(false);
      }
    };

    loadDetailHistory();
  }, [detailTimeframe, selectedStock?.symbol, view]);

  useEffect(() => {
    if (view !== 'full-chart') return;
    const symbol = selectedStock?.symbol;
    if (!symbol) return;

    const loadFullChartHistory = async () => {
      setFullChartLoading(true);
      try {
        const result = await fetchStockHistory(symbol, fullChartTimeframe);
        setFullChartHistory(result.history);
      } catch (error) {
        console.error('Failed to load full chart history', error);
        setFullChartHistory([]);
      } finally {
        setFullChartLoading(false);
      }
    };

    loadFullChartHistory();
  }, [fullChartTimeframe, selectedStock?.symbol, view]);

  const handleOpenStock = (symbol: string) => {
    setSelectedStockId(symbol);
    setDetailTimeframe('INTRADAY');
    setView('detail');
  };

  const handleAddStock = (symbol: string) => {
    const upper = symbol.toUpperCase();
    setWatchlistSymbols((prev) => (prev.includes(upper) ? prev : [upper, ...prev]));
    setSelectedStockId(upper);
    setView('detail');
  };

  const handleRemoveStock = (symbol: string) => {
    setWatchlistSymbols((prev) => {
      const next = prev.filter((item) => item !== symbol);
      if (selectedStockId === symbol) {
        setSelectedStockId(next[0] || null);
      }
      return next;
    });
  };

  const renderMainContent = () => {
    if (view === 'journal') {
      return (
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[#07090c] text-white">
          <div className="flex h-14 items-center justify-between border-b border-white/10 bg-[#0a0d11] px-5">
            <div>
              <div className="text-sm font-semibold text-slate-900">交易日记</div>
              <div className="text-xs text-slate-500">本地保存的复盘记录和 AI 修正建议</div>
            </div>
            <button
              type="button"
              onClick={() => setView('summary')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              返回市场总览
            </button>
          </div>
          <div className="flex-1">
            <ProfilePage />
          </div>
        </div>
      );
    }

    if (view === 'detail') {
      return (
        <StockDetailPage
          stock={selectedStock}
          history={detailHistory}
          news={news}
          timeframe={detailTimeframe}
          loading={detailLoading}
          onBack={() => setView('summary')}
          onOpenFullChart={() => setView('full-chart')}
          onChangeTimeframe={setDetailTimeframe}
        />
      );
    }

    if (view === 'full-chart') {
      return (
        <FullChartPage
          stock={selectedStock}
          history={fullChartHistory}
          timeframe={fullChartTimeframe}
          loading={fullChartLoading}
          onBack={() => setView('detail')}
          onChangeTimeframe={setFullChartTimeframe}
        />
      );
    }

    return (
      <MarketSummaryPage
        selectedStock={selectedStock}
        stocks={stocks}
        history={summaryHistory}
        historyLoading={summaryLoading}
        news={news}
        onOpenStock={handleOpenStock}
        onOpenJournal={() => setView('journal')}
      />
    );
  };

  return (
    <div className="flex h-full overflow-hidden bg-[#07090c]">
      <div className={`min-w-0 flex-1 ${view === 'journal' ? 'overflow-y-auto' : 'overflow-hidden'}`}>{renderMainContent()}</div>
      {view !== 'journal' && (
        <WatchlistSidebar
          stocks={stocks}
          selectedId={selectedStockId}
          onOpenStock={handleOpenStock}
          onRemoveStock={handleRemoveStock}
          onAddStock={handleAddStock}
        />
      )}
    </div>
  );
};

export default InvestorPage;
