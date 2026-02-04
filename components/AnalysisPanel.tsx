
import React, { useState, useEffect } from 'react';
import { AnalysisMode, Stock, NewsItem, Timeframe, OHLC } from '../types';
import { generateAnalysis } from '../services/gemini';
import { fetchStockHistory } from '../services/stockService';
import KLineChart from './KLineChart';

interface AnalysisPanelProps {
  stock: Stock | null;
  relevantNews: NewsItem[];
  triggerNews?: NewsItem | null;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ stock: initialStock, relevantNews, triggerNews }) => {
  const [stock, setStock] = useState<Stock | null>(initialStock);
  const [realtimeHistory, setRealtimeHistory] = useState<OHLC[]>([]);
  const [mode, setMode] = useState<AnalysisMode>(AnalysisMode.OVERVIEW);
  const [currentTimeframe, setCurrentTimeframe] = useState<Timeframe>('1M');
  const [loading, setLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when initialStock changes
  useEffect(() => {
    setStock(initialStock);
    setAnalysisStarted(false);
    setResult('');
    setSources([]);
    setLoading(false);
    setCurrentTimeframe('1M');
    setError(null);
  }, [initialStock?.id]);

  // Fetch real-time history when stock or timeframe changes
  useEffect(() => {
    const loadRealtimeData = async () => {
      if (!stock) return;
      setChartLoading(true);
      setError(null);
      try {
        const data = await fetchStockHistory(stock.symbol, currentTimeframe);
        setRealtimeHistory(data.history);
        // Update stock object with real-time price info
        setStock(prev => prev ? {
          ...prev,
          price: data.currentPrice,
          change: data.change,
          changePercent: data.changePercent
        } : null);
      } catch (err) {
        setError("无法获取实时行情，请稍后重试");
      } finally {
        setChartLoading(false);
      }
    };

    loadRealtimeData();
  }, [stock?.id, currentTimeframe]);

  const handleStartAnalysis = async (targetMode: AnalysisMode = mode) => {
    if (!stock) return;
    setAnalysisStarted(true);
    setLoading(true);
    setResult('');
    setSources([]);
    const response = await generateAnalysis(targetMode, stock, relevantNews);
    setResult(response.text);
    setSources(response.sources);
    setLoading(false);
  };

  const handleTimeframeChange = (tf: Timeframe) => {
    setCurrentTimeframe(tf);
  };

  useEffect(() => {
    if (analysisStarted && stock) {
      handleStartAnalysis(mode);
    }
  }, [mode]);

  useEffect(() => {
    if (triggerNews && stock) {
      setMode(AnalysisMode.SENTIMENT);
      handleStartAnalysis(AnalysisMode.SENTIMENT);
    }
  }, [triggerNews]);

  if (!stock) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 text-slate-400">
        <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-lg font-medium">请从左侧选择一个股票开启行情视图</p>
      </div>
    );
  }

  const timeframeOptions: { label: string; value: Timeframe }[] = [
    { label: '分时', value: 'INTRADAY' },
    { label: '5日', value: '1W' },
    { label: '1月', value: '1M' },
    { label: '年初至今', value: 'YTD' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      {/* Header Info */}
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            {stock.name} <span className="text-sm font-normal text-slate-500 uppercase tracking-widest">{stock.symbol}</span>
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xl font-mono font-semibold text-slate-800">{stock.price.toFixed(2)}</span>
            <span className={`text-sm font-bold flex items-center gap-1 ${stock.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {stock.change >= 0 ? '▲' : '▼'} {Math.abs(stock.change).toFixed(2)} ({stock.changePercent.toFixed(2)}%)
            </span>
            <span className="text-[10px] text-slate-400 font-normal">Real-time Data</span>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {Object.values(AnalysisMode).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Chart Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
             <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                   <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                   Yahoo Finance 实时行情
                </h3>
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                  {timeframeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleTimeframeChange(opt.value)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        currentTimeframe === opt.value 
                          ? 'bg-white text-blue-600 shadow-sm border border-slate-200' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
             </div>
             
             {chartLoading ? (
               <div className="w-full h-[300px] flex items-center justify-center bg-slate-50/50 rounded-xl">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-slate-400 font-medium text-xs">同步交易所数据...</div>
                  </div>
               </div>
             ) : error ? (
                <div className="w-full h-[300px] flex items-center justify-center bg-red-50 rounded-xl border border-red-100 text-red-500 text-sm font-medium">
                  {error}
                </div>
             ) : (
               <KLineChart data={realtimeHistory} />
             )}
          </div>

          {/* AI Analysis Section */}
          {!analysisStarted ? (
            <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6">
                 <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                 </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">启动 AI 实时投资分析</h2>
              <p className="text-slate-500 max-w-md mb-8">
                Agent 将结合当前的实时成交价，并启用 Google Search 抓取今日市场异动及研报，为您生成结构化的 "{mode}" 报告。
              </p>
              <button 
                onClick={() => handleStartAnalysis()}
                className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2 group"
              >
                <span>立即询问 AI Agent</span>
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              {loading ? (
                <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center space-y-4">
                  <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                  <p className="text-slate-500 font-medium animate-pulse">正在接入 Google Search 搜索最新资讯...</p>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
                      <div className="w-2 h-6 bg-blue-600 rounded-full"></div>
                      <h2 className="text-lg font-bold text-slate-800">{mode} 分析结果</h2>
                    </div>
                    
                    <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {result}
                    </div>

                    {sources.length > 0 && (
                      <div className="mt-8 pt-6 border-t border-slate-100">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">参考实时来源:</h4>
                        <div className="flex flex-wrap gap-2">
                          {sources.slice(0, 5).map((source, idx) => (
                            <a 
                              key={idx} 
                              href={source.uri} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-full text-[10px] text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              {source.title.length > 20 ? source.title.substring(0, 20) + '...' : source.title}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                       <button 
                        onClick={() => handleStartAnalysis()}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                       >
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                         </svg>
                         重新生成报告
                       </button>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-2xl shadow-lg text-white">
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <h3 className="text-xl font-bold">投资判断草案</h3>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
                      <p className="text-sm opacity-90 italic">
                        "基于 Yahoo Finance 实时价格 ({stock.price.toFixed(2)}) 及 Google 实时搜索生成的分析结论。此判断仅供决策参考，不构成投资建议。"
                      </p>
                      <div className="mt-6 flex justify-between items-center">
                        <span className="text-xs opacity-75">交易所同步时间: {new Date().toLocaleTimeString()}</span>
                        <button className="px-4 py-2 bg-white text-blue-700 rounded-lg font-bold text-sm hover:bg-blue-50 transition-colors shadow-sm">
                          保存至笔记
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <p className="text-center text-[10px] text-slate-400 py-4 pb-8">
            数据说明：行情由 Yahoo Finance 提供，存在 15 分钟以内延迟。分析由 Gemini AI 生成。
          </p>
        </div>
      </div>
    </div>
  );
};

export default AnalysisPanel;
