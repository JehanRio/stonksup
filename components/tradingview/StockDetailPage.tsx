import React, { useEffect, useMemo, useRef, useState } from 'react';
import KLineChart from '../KLineChart';
import { AnalysisMode, NewsItem, OHLC, Stock, Timeframe } from '../../types';
import { generateAnalysis } from '../../services/gemini';

interface StockDetailPageProps {
  stock: Stock | null;
  history: OHLC[];
  news: NewsItem[];
  timeframe: Timeframe;
  loading: boolean;
  onBack: () => void;
  onOpenFullChart: () => void;
  onChangeTimeframe: (timeframe: Timeframe) => void;
}

const timeframeOptions: Array<{ label: string; value: Timeframe }> = [
  { label: '1D', value: 'INTRADAY' },
  { label: '5D', value: '5D' },
  { label: '1Y', value: 'DAILY' },
  { label: '10Y', value: 'MONTHLY' },
];

const analysisTabs: Array<{ label: string; value: AnalysisMode }> = [
  { label: '综述', value: AnalysisMode.OVERVIEW },
  { label: '财报', value: AnalysisMode.EARNINGS },
  { label: '情绪', value: AnalysisMode.SENTIMENT },
];

const formatPrice = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '--');
const formatSigned = (value: number) => (Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}` : '--');

const computePerformance = (history: OHLC[]) => {
  if (history.length < 2) return { day: 0, week: 0, month: 0, all: 0 };
  const start = history[0].close || 1;
  const end = history[history.length - 1].close || 1;
  const calc = (from: number, to: number) => ((to - from) / from) * 100;
  return {
    day: calc(history[Math.max(0, history.length - 2)].close || start, end),
    week: calc(history[Math.max(0, history.length - 6)].close || start, end),
    month: calc(history[Math.max(0, history.length - 22)].close || start, end),
    all: calc(start, end),
  };
};

const StockDetailPage: React.FC<StockDetailPageProps> = ({
  stock,
  history,
  news,
  timeframe,
  loading,
  onBack,
  onOpenFullChart,
  onChangeTimeframe,
}) => {
  const performance = useMemo(() => computePerformance(history), [history]);
  const aiSectionRef = useRef<HTMLDivElement | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(AnalysisMode.OVERVIEW);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);
  const requestingRef = useRef(false);

  useEffect(() => {
    setAnalysisMode(AnalysisMode.OVERVIEW);
    setAnalysisStarted(false);
    setAnalysisLoading(false);
    setAnalysisText('');
    setAnalysisError(null);
    setSources([]);
    requestingRef.current = false;
  }, [stock?.id]);

  const runAnalysis = async (targetMode: AnalysisMode) => {
    if (!stock || requestingRef.current) return;

    requestingRef.current = true;
    setAnalysisStarted(true);
    setAnalysisLoading(true);
    setAnalysisError(null);

    try {
      const response = await generateAnalysis(targetMode, stock, news);
      setAnalysisText(response.text);
      setSources(response.sources);
    } catch (error: any) {
      setAnalysisError(error?.message || 'AI 分析失败');
    } finally {
      setAnalysisLoading(false);
      requestingRef.current = false;
    }
  };

  useEffect(() => {
    if (analysisStarted && stock && !requestingRef.current) {
      runAnalysis(analysisMode);
    }
  }, [analysisMode]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0e11] text-white">
      <div className="border-b border-white/10 px-8 py-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="mb-3 flex items-center gap-3 text-sm text-white/40">
              <button type="button" onClick={onBack} className="transition hover:text-white">
                Markets
              </button>
              <span>/</span>
              <span>Watchlist</span>
              <span>/</span>
              <span className="text-white/75">{stock?.symbol || '--'}</span>
            </div>

            <div className="flex items-center gap-5">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-cyan-500/75 text-5xl font-semibold text-white">
                {(stock?.symbol || '?').slice(0, 2)}
              </div>
              <div>
                <h2 className="text-5xl font-semibold tracking-tight">{stock?.name || stock?.symbol || 'No symbol selected'}</h2>
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  <div className="text-6xl font-semibold">{formatPrice(stock?.price ?? NaN)}</div>
                  <div className={`pb-2 text-3xl font-medium ${(stock?.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatSigned(stock?.change ?? NaN)} {stock ? `(${formatSigned(stock.changePercent)}%)` : ''}
                  </div>
                </div>
                <div className="mt-3 text-sm text-white/45">Market snapshot based on Yahoo Finance intraday and history feed.</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {timeframeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChangeTimeframe(option.value)}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  timeframe === option.value ? 'bg-white text-[#0b0e11]' : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="space-y-6">
          <section className="rounded-[30px] border border-white/10 bg-[#0f1318] p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Chart</div>
                <div className="mt-1 text-lg font-semibold">Price action</div>
              </div>
              <button
                type="button"
                onClick={onOpenFullChart}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Full chart
              </button>
            </div>

            {loading ? (
              <div className="flex h-[460px] items-center justify-center rounded-[24px] border border-white/10 bg-[#0a0d11] text-white/45">
                Loading chart...
              </div>
            ) : (
              <KLineChart data={history} theme="dark" mode="line" height={460} showBrush={false} showLegend={false} />
            )}

            <div className="mt-6 grid grid-cols-4 gap-4">
              {[
                { label: '1 day', value: performance.day },
                { label: '5 days', value: performance.week },
                { label: '1 month', value: performance.month },
                { label: 'All data', value: performance.all },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="text-sm text-white/45">{item.label}</div>
                  <div className={`mt-2 text-2xl font-semibold ${item.value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {item.value >= 0 ? '+' : ''}
                    {item.value.toFixed(2)}%
                  </div>
                </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                <div>
                  <div className="text-sm font-medium text-white">AI 分析入口</div>
                  <div className="mt-1 text-sm text-white/45">先看盘，再跳到下方 AI 模块查看逻辑结论。</div>
                </div>
                <button
                  type="button"
                  onClick={() => aiSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-300 transition hover:bg-cyan-400/15"
                >
                  跳转到 AI 分析
                </button>
              </div>
            </section>

          <section ref={aiSectionRef} className="rounded-[30px] border border-white/10 bg-[#0f1318] p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">AI Analyst</div>
                <div className="mt-1 text-2xl font-semibold text-white">个股 AI 分析模块</div>
                <div className="mt-2 text-sm text-white/45">围绕当前个股和相关新闻生成 AI 综述、财报解读和情绪判断。</div>
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
                {analysisTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setAnalysisMode(tab.value)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      analysisMode === tab.value ? 'bg-white text-[#0b0e11]' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-[#131722] p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">AI 观点区</div>
                  <div className="mt-1 text-sm text-white/45">点击按钮生成当前模式下的分析结论。</div>
                </div>
                <button
                  type="button"
                  onClick={() => runAnalysis(analysisMode)}
                  disabled={analysisLoading || !stock}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {analysisLoading ? 'AI 分析中...' : '生成 AI 分析'}
                </button>
              </div>

              {analysisError && (
                <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                  {analysisError}
                </div>
              )}

              {!analysisStarted ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
                  <div className="text-lg font-semibold text-white">等待生成分析</div>
                  <div className="mt-2 text-sm leading-6 text-white/45">点击右上角按钮，生成当前个股的 AI 综述、财报解读或情绪判断。</div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm leading-7 whitespace-pre-wrap text-white/85">
                    {analysisLoading ? 'AI 正在生成分析，请稍候...' : analysisText || '暂未返回内容。'}
                  </div>

                  {sources.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {sources.map((source, index) => (
                        <a
                          key={`${source.uri}-${index}`}
                          href={source.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition hover:border-cyan-400/40 hover:text-cyan-300"
                        >
                          {source.title.length > 22 ? `${source.title.slice(0, 22)}...` : source.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-[#0f1318] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Market Facts</div>
                <div className="mt-1 text-2xl font-semibold">Key data points</div>
              </div>
              <div className="text-xs text-white/35">Execution context</div>
            </div>
            <div className="grid grid-cols-2 gap-5">
              {[
                { label: 'Previous close', value: history.at(-2)?.close },
                { label: 'Open', value: history.at(-1)?.open },
                { label: 'Day high', value: history.at(-1)?.high },
                { label: 'Day low', value: history.at(-1)?.low },
                { label: 'Volume', value: history.at(-1)?.volume ? history.at(-1)!.volume.toLocaleString() : '--' },
                { label: 'History points', value: history.length },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm text-white/45">{item.label}</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-[#0f1318] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">News Flow</div>
                <div className="mt-1 text-2xl font-semibold">Latest news</div>
              </div>
              <div className="text-xs text-white/35">Top {Math.min(news.length, 4)}</div>
            </div>
            <div className="space-y-4">
              {news.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3 text-xs text-white/35">
                    <span>{item.source}</span>
                    <span>{item.time}</span>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-white/85">{item.title}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default StockDetailPage;
