
export type Timeframe = 'INTRADAY' | '5D' | 'DAILY' | 'MONTHLY';

export interface OHLC {
  time: string;
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Stock {
  id: string; // Typically the symbol
  name: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  sparkline: number[];
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  content: string;
  summary?: string;
}

export enum AnalysisMode {
  OVERVIEW = '全面速览',
  EARNINGS = '财报解读',
  SENTIMENT = '新闻情绪'
}

export interface AnalysisResponse {
  text: string;
  sources: { title: string; uri: string }[];
}

export interface UserPreferences {
  riskTolerance: 'low' | 'medium' | 'high';
  investmentHorizon: 'short' | 'medium' | 'long';
  focusIndustries: string[];
}
