import React, { useEffect, useRef, useState } from 'react';
import { AnalysisMode, Stock, NewsItem, Timeframe, OHLC } from '../types';
import { generateAnalysis } from '../services/gemini';
import { fetchStockHistory } from '../services/stockService';
import KLineChart from './KLineChart';

interface AnalysisPanelProps {
  stock: Stock | null;
  relevantNews: NewsItem[];
  triggerNews?: NewsItem | null;
}

const timeframeOptions: { label: string; value: Timeframe }[] = [
  { label: '分时', value: 'INTRADAY' },
  { label: '5日', value: '5D' },
  { label: '日线', value: 'DAILY' },
  { label: '月线', value: 'MONTHLY' },
];

const modeLabels: Record<AnalysisMode, string> = {
  [AnalysisMode.OVERVIEW]: '全局综述',
  [AnalysisMode.EARNINGS]: '财报解读',
  [AnalysisMode.SENTIMENT]: '新闻情绪',
};

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ stock: initialStock, relevantNews, triggerNews }) => {
  const [stock, setStock] = useState<Stock | null>(initialStock);
  const [history, setHistory] = useState<OHLC[]>([]);
  const [mode, setMode] = useState<AnalysisMode>(AnalysisMode.OVERVIEW);
  const [currentTimeframe, setCurrentTimeframe] = useState<Timeframe>('DAILY');
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isRequesting = useRef(false);

  useEffect(() => {
    setStock(initialStock);
    setHistory([]);
    setMode(AnalysisMode.OVERVIEW);
    setCurrentTimeframe('DAILY');
    setAnalysisStarted(false);
    setAnalysisText('');
    setSources([]);
    setAnalysisLoading(false);
    setError(null);
  }, [initialStock?.id]);

  useEffect(() => {
    const loadChart = async () => {
      if (!stock) return;

      setChartLoading(true);
      setError(null);
      try {
        const data = await fetchStockHistory(stock.symbol, currentTimeframe);
        setHistory(data.history);
        setStock((prev) =>
          prev
            ? {
                ...prev,
                price: data.currentPrice,
                change: data.change,
                changePercent: data.changePercent,
              }
            : null,
        );
      } catch {
        setError('行情刷新失败，请稍后重试。');
      } finally {
        setChartLoading(false);
      }
    };

    loadChart();
  }, [stock?.id, currentTimeframe]);

  const handleStartAnalysis = async (targetMode: AnalysisMode = mode) => {
    if (!stock || isRequesting.current) return;

    isRequesting.current = true;
    setAnalysisStarted(true);
    setAnalysisLoading(true);
    setError(null);

    try {
      const response = await generateAnalysis(targetMode, stock, relevantNews);
      setAnalysisText(response.text);
      setSources(response.sources);

      if (response.text.includes('请求过于频繁')) {
        setError('AI 搜索配额受限，当前结果可能不包含联网检索。');
      }
    } catch {
      setError('AI 分析失败，请检查 Key 或稍后重试。');
    } finally {
      setAnalysisLoading(false);
      isRequesting.current = false;
    }
  };

  useEffect(() => {
    if (analysisStarted && stock && !isRequesting.current) {
      handleStartAnalysis(mode);
    }
  }, [mode]);

  useEffect(() => {
    if (triggerNews && stock && !isRequesting.current) {
      setMode(AnalysisMode.SENTIMENT);
      handleStartAnalysis(AnalysisMode.SENTIMENT);
    }
  }, [triggerNews]);

  if (!stock) {
    return (
      <div className="flex h-full items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
        <div className="rounded-[28px] border border-slate-200 bg-white px-10 py-12 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-50">
            <svg className="h-8 w-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 17v-6m3 6V7m3 10v-4m3 4V5M6 19h12" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-900">请选择一只股票</h3>
          <p className="mt-2 text-sm text-slate-500">左侧选择标的后，这里会显示看盘面板和 AI 分析。</p>
        </div>
      </div>
    );
  }

  const safePrice = Number.isFinite(stock.price) ? stock.price : 0;
  const safeChange = Number.isFinite(stock.change) ? stock.change : 0;
  const safeChangePercent = Number.isFinite(stock.changePercent) ? stock.changePercent : 0;

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
      <div className="shrink-0 border-b border-slate-200 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Market Board</div>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{stock.symbol}</h1>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                {stock.name}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">现价</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{safePrice.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">涨跌</div>
              <div className={`mt-1 text-2xl font-bold ${safeChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {safeChange >= 0 ? '+' : ''}
                {safeChange.toFixed(2)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">涨跌幅</div>
              <div className={`mt-1 text-2xl font-bold ${safeChangePercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {safeChangePercent >= 0 ? '+' : ''}
                {safeChangePercent.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid min-h-full grid-cols-1 gap-6 xl:grid-cols-[1.55fr_0.95fr]">
          <section className="min-w-0 space-y-6">
            <div className="rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Chart</div>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">看盘图表</h2>
                  <p className="mt-1 text-sm text-slate-500">拖动平移，滚轮缩放，双击复位。</p>
                </div>

                <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
                  {timeframeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCurrentTimeframe(option.value)}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                        currentTimeframe === option.value
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-5">
                {chartLoading ? (
                  <div className="flex h-[620px] items-center justify-center rounded-[24px] border border-slate-200 bg-slate-50 text-sm text-slate-500">
                    加载行情中...
                  </div>
                ) : (
                  <KLineChart data={history} />
                )}
              </div>
            </div>
          </section>

          <aside className="min-w-0 space-y-6">
            <div className="rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">AI Analysis</div>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">AI 看盘助手</h2>
                    <p className="mt-1 text-sm text-slate-500">切换分析维度并生成观点。</p>
                  </div>

                  <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
                    {Object.values(AnalysisMode).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setMode(item)}
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                          mode === item ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        {modeLabels[item]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6">
                {!analysisStarted ? (
                  <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-sm">
                      <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-slate-900">启动 AI 分析</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">建议在图表和新闻看完之后，再生成分析结论，避免无效消耗模型额度。</p>
                    <button
                      type="button"
                      onClick={() => handleStartAnalysis()}
                      disabled={analysisLoading}
                      className="mt-6 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
                    >
                      {analysisLoading ? '生成中...' : '生成分析报告'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {error && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {error}
                      </div>
                    )}

                    <div className="min-h-[420px] rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
                      {analysisLoading ? 'AI 正在生成分析，请稍候...' : analysisText || '暂无内容。'}
                    </div>

                    {sources.length > 0 && (
                      <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Sources</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {sources.map((source, index) => (
                            <a
                              key={`${source.uri}-${index}`}
                              href={source.uri}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
                            >
                              {source.title.substring(0, 18)}...
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default AnalysisPanel;
