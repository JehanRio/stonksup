
import { OHLC, Timeframe, Stock, NewsItem } from '../types';

const PROXY_URL = 'https://corsproxy.io/?';
const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search?q=';

interface YahooParams {
  interval: string;
  range: string;
}

const TIMEFRAME_MAP: Record<Timeframe, YahooParams> = {
  'INTRADAY': { interval: '5m', range: '1d' },
  '1W': { interval: '15m', range: '5d' },
  '1M': { interval: '1d', range: '1mo' },
  'YTD': { interval: '1d', range: 'ytd' }
};

export const searchStocks = async (query: string): Promise<Partial<Stock>[]> => {
  if (!query) return [];
  const url = `${PROXY_URL}${encodeURIComponent(`${SEARCH_URL}${query}`)}`;
  try {
    const response = await fetch(url);
    const json = await response.json();
    return (json.quotes || []).map((q: any) => ({
      id: q.symbol,
      symbol: q.symbol,
      name: q.shortname || q.longname || q.symbol
    })).filter((q: any) => q.symbol);
  } catch (err) {
    console.error('Search error:', err);
    return [];
  }
};

export const fetchMarketNews = async (query: string = 'market'): Promise<NewsItem[]> => {
  const url = `${PROXY_URL}${encodeURIComponent(`${SEARCH_URL}${query}`)}`;
  try {
    const response = await fetch(url);
    const json = await response.json();
    
    return (json.news || []).map((n: any) => {
      const date = new Date(n.providerPublishTime * 1000);
      const diffMinutes = Math.floor((new Date().getTime() - date.getTime()) / 60000);
      let timeStr = '';
      
      if (diffMinutes < 60) {
        timeStr = `${diffMinutes}分钟前`;
      } else if (diffMinutes < 1440) {
        timeStr = `${Math.floor(diffMinutes / 60)}小时前`;
      } else {
        timeStr = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      }

      return {
        id: n.uuid,
        title: n.title,
        source: n.publisher,
        time: timeStr,
        content: `来源: ${n.publisher}。这是一条关于 ${query} 的实时动态。您可以点击 AI 解读获取深度背景分析。`,
        summary: n.link // 存储原始链接以供参考
      };
    });
  } catch (err) {
    console.error('News fetch error:', err);
    return [];
  }
};

export const fetchStockHistory = async (symbol: string, timeframe: Timeframe): Promise<{ history: OHLC[], currentPrice: number, change: number, changePercent: number, sparkline: number[] }> => {
  const { interval, range } = TIMEFRAME_MAP[timeframe];
  const url = `${PROXY_URL}${encodeURIComponent(`${BASE_URL}${symbol}?interval=${interval}&range=${range}`)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const json = await response.json();
    if (!json.chart?.result) throw new Error('No data found');
    
    const result = json.chart.result[0];
    const quote = result.indicators.quote[0];
    const timestamps = result.timestamp || [];
    const meta = result.meta;

    const history: OHLC[] = timestamps.map((ts: number, i: number) => {
      const date = new Date(ts * 1000);
      let timeStr = '';
      
      if (timeframe === 'INTRADAY' || timeframe === '1W') {
        timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
      } else {
        timeStr = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      }

      return {
        time: timeStr,
        open: quote.open[i] || quote.close[i-1] || meta.previousClose,
        high: quote.high[i] || quote.close[i-1] || meta.previousClose,
        low: quote.low[i] || quote.close[i-1] || meta.previousClose,
        close: quote.close[i] || quote.open[i] || meta.previousClose,
        volume: quote.volume[i] || 0
      };
    }).filter((item: any) => item.close !== null && item.close !== undefined);

    const sparkline = history.slice(-10).map(h => h.close);

    return {
      history,
      currentPrice: meta.regularMarketPrice,
      change: meta.regularMarketPrice - meta.previousClose,
      changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
      sparkline
    };
  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw error;
  }
};

export const fetchStockSummaries = async (symbols: string[]): Promise<Stock[]> => {
  const promises = symbols.map(s => fetchStockHistory(s, '1W').catch(() => null));
  const results = await Promise.all(promises);
  
  return results.map((res, i) => {
    if (!res) return null;
    return {
      id: symbols[i],
      symbol: symbols[i],
      name: symbols[i], 
      price: res.currentPrice,
      change: res.change,
      changePercent: res.changePercent,
      sparkline: res.sparkline
    };
  }).filter((s): s is Stock => s !== null);
};
