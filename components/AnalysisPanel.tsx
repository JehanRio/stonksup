
import React, { useState, useEffect, useRef } from 'react';
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
  
  const isRequesting = useRef(false);

  useEffect(() => {
    setStock(initialStock);
    setAnalysisStarted(false);
    setResult('');
    setSources([]);
    setLoading(false);
    setCurrentTimeframe('1M');
    setError(null);
  }, [initialStock?.id]);

  useEffect(() => {
    const loadRealtimeData = async () => {
      if (!stock) return;
      setChartLoading(true);
      setError(null);
      try {
        const data = await fetchStockHistory(stock.symbol, currentTimeframe);
        setRealtimeHistory(data.history);
        setStock(prev => prev ? {
          ...prev,
          price: data.currentPrice,
          change: data.change,
          changePercent: data.changePercent
        } : null);
      } catch (err) {
        setError("行情刷新受阻");
      } finally {
        setChartLoading(false);
      }
    };

    loadRealtimeData();
  }, [stock?.id, currentTimeframe]);

  const handleStartAnalysis = async (targetMode: AnalysisMode = mode) => {
    if (!stock || isRequesting.current) return;
    
    isRequesting.current = true;
    setAnalysisStarted(true);
    setLoading(true);
    setError(null);

    try {
      const response = await generateAnalysis(targetMode, stock, relevantNews);
      setResult(response.text);
      setSources(response.sources);
      
      if (response.text.includes('请求过于频繁')) {
        setError("联网搜索配额耗尽");
      }
    } catch (err: any) {
      setError("AI 引擎调用失败");
    } finally {
      setLoading(false);
      isRequesting.current = false;
    }
  };

  // 模式切换时，如果之前已经开始过分析，则自动更新
  useEffect(() => {
    if (analysisStarted && stock && !isRequesting.current) {
      handleStartAnalysis(mode);
    }
  }, [mode]);

  // 当外部通过“AI 解读”按钮点击某条新闻时触发
  useEffect(() => {
    if (triggerNews && stock && !isRequesting.current) {
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
        <p className="text-lg font-medium">请从左侧选择股票</p>
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
          
          {/* Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
             <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                   <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                   行情走势 (非 AI 额度)
                </h3>
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                  {timeframeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setCurrentTimeframe(opt.value)}
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
               <div className="w-full h-[300px] flex items-center justify-center bg-slate-50/50 rounded-xl animate-pulse text-xs text-slate-400">
                 行情同步中...
               </div>
             ) : (
               <KLineChart data={realtimeHistory} />
             )}
          </div>

          {/* AI Analysis */}
          {!analysisStarted ? (
            <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6">
                 <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                 </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">启动 AI 深度洞察</h2>
              <p className="text-slate-500 max-w-md mb-8 text-sm">
                仅在此步骤会消耗 Gemini API 额度。我们建议在重要决策前开启。
              </p>
              <button 
                onClick={() => handleStartAnalysis()}
                disabled={loading}
                className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all"
              >
                {loading ? '思考中...' : '生成分析报告'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {error && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 text-amber-800 text-xs">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="font-bold">提示: {error}</p>
                    <p className="opacity-80 mt-1">
                      行情数据不受影响，但 AI 生成受限。建议绑定专属 API Key 以解除频率锁定。
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 relative">
                <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">
                  {loading ? (
                    <div className="flex flex-col gap-4 animate-pulse">
                      <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                      <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                      <div className="h-4 bg-slate-100 rounded w-5/6"></div>
                    </div>
                  ) : result || "正在准备分析内容..."}
                </div>

                {sources.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3">搜索参考来源:</h4>
                    <div className="flex flex-wrap gap-2">
                      {sources.map((source, idx) => (
                        <a key={idx} href={source.uri} target="_blank" className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-full text-[10px] text-slate-500 hover:text-blue-600">
                          {source.title.substring(0, 15)}...
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalysisPanel;
