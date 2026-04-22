
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
  '5D': { interval: '15m', range: '5d' },
  'DAILY': { interval: '1d', range: '1y' },
  'MONTHLY': { interval: '1mo', range: '10y' }
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) ? value : null;
};

const getPreviousClose = (meta: any, closeSeries: Array<number | null | undefined>, currentPrice: number): number => {
  const metaPreviousClose =
    toFiniteNumber(meta?.previousClose) ??
    toFiniteNumber(meta?.chartPreviousClose) ??
    toFiniteNumber(meta?.previousChartClose);

  if (metaPreviousClose !== null && metaPreviousClose !== 0) {
    return metaPreviousClose;
  }

  const validCloses = closeSeries
    .map((value) => toFiniteNumber(value))
    .filter((value): value is number => value !== null);

  if (validCloses.length >= 2) {
    return validCloses[validCloses.length - 2];
  }

  if (validCloses.length === 1) {
    return validCloses[0];
  }

  return currentPrice;
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
    const currentPrice =
      toFiniteNumber(meta?.regularMarketPrice) ??
      toFiniteNumber(meta?.postMarketPrice) ??
      toFiniteNumber(meta?.previousClose) ??
      0;
    const previousClose = getPreviousClose(meta, quote.close || [], currentPrice);

    const history: OHLC[] = timestamps.map((ts: number, i: number) => {
      const date = new Date(ts * 1000);
      let timeStr = '';
      
      if (timeframe === 'INTRADAY' || timeframe === '5D') {
        timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
      } else if (timeframe === 'MONTHLY') {
        timeStr = date.toLocaleDateString('zh-CN', { year: '2-digit', month: '2-digit' });
      } else {
        timeStr = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      }

      return {
        time: timeStr,
        timestamp: ts,
        open: toFiniteNumber(quote.open?.[i]) ?? toFiniteNumber(quote.close?.[i - 1]) ?? previousClose,
        high: toFiniteNumber(quote.high?.[i]) ?? toFiniteNumber(quote.close?.[i - 1]) ?? previousClose,
        low: toFiniteNumber(quote.low?.[i]) ?? toFiniteNumber(quote.close?.[i - 1]) ?? previousClose,
        close: toFiniteNumber(quote.close?.[i]) ?? toFiniteNumber(quote.open?.[i]) ?? previousClose,
        volume: toFiniteNumber(quote.volume?.[i]) ?? 0
      };
    }).filter((item: any) => item.close !== null && item.close !== undefined);

    const sparkline = history.slice(-10).map(h => h.close);
    const change = currentPrice - previousClose;
    const changePercent = previousClose === 0 ? 0 : (change / previousClose) * 100;

    return {
      history,
      currentPrice,
      change,
      changePercent,
      sparkline
    };
  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw error;
  }
};

export const fetchStockSummaries = async (symbols: string[]): Promise<Stock[]> => {
  const promises = symbols.map(s => fetchStockHistory(s, '5D').catch(() => null));
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
