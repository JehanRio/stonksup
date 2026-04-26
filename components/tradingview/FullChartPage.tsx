import React from 'react';
import LightweightFullChart from './LightweightFullChart';
import { OHLC, Stock, Timeframe } from '../../types';

interface FullChartPageProps {
  stock: Stock | null;
  history: OHLC[];
  timeframe: Timeframe;
  loading: boolean;
  onBack: () => void;
  onChangeTimeframe: (timeframe: Timeframe) => void;
}

const timeframeOptions: Array<{ label: string; value: Timeframe }> = [
  { label: '1D', value: 'INTRADAY' },
  { label: '5D', value: '5D' },
  { label: '1Y', value: 'DAILY' },
  { label: '10Y', value: 'MONTHLY' },
];

const drawingTools = ['+', '/', 'T', ':)', '[]', '<>', '*'];

const FullChartPage: React.FC<FullChartPageProps> = ({
  stock,
  history,
  timeframe,
  loading,
  onBack,
  onChangeTimeframe,
}) => {
  const latest = history.at(-1);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#131722] text-white">
      <div className="flex h-12 items-center justify-between border-b border-[#2a2e39] bg-[#131722] px-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-[#363a45] bg-[#1b1f2a] px-3 py-1.5 text-sm font-medium text-white/85 transition hover:bg-[#222733]"
          >
            Back
          </button>
          <div className="rounded-md border border-[#363a45] bg-[#1b1f2a] px-3 py-1.5 text-sm font-semibold text-white">
            {stock?.symbol || '--'}
          </div>
          <div className="text-sm text-white/60">{stock?.name || 'Selected symbol'}</div>
          <div className="hidden items-center gap-2 text-sm text-white/55 md:flex">
            <span>D</span>
            <span>/</span>
            <span>Indicators</span>
            <span>/</span>
            <span>Alert</span>
            <span>/</span>
            <span>Replay</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {timeframeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChangeTimeframe(option.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                timeframe === option.value
                  ? 'bg-[#22d3ee] text-[#071319]'
                  : 'border border-[#363a45] bg-[#1b1f2a] text-white/75 hover:bg-[#222733]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)]">
        <aside className="flex flex-col items-center gap-2 border-r border-[#2a2e39] bg-[#131722] px-1 py-3 text-[#6b7280]">
          {drawingTools.map((tool) => (
            <button
              key={tool}
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-xs font-medium transition hover:border-[#363a45] hover:bg-[#1b1f2a] hover:text-white"
            >
              {tool}
            </button>
          ))}
        </aside>

        <section className="min-h-0 overflow-hidden">
          <div className="flex h-full flex-col">
            <div className="flex h-10 items-center justify-between border-b border-[#2a2e39] px-4 text-sm">
              <div className="flex flex-wrap items-center gap-4">
                <div className="font-semibold text-white">{stock?.symbol || '--'}</div>
                <div className="text-white/60">{stock?.name || 'Chart'}</div>
                {latest && (
                  <>
                    <div className="text-[#9ca3af]">O {latest.open.toFixed(2)}</div>
                    <div className="text-[#9ca3af]">H {latest.high.toFixed(2)}</div>
                    <div className="text-[#9ca3af]">L {latest.low.toFixed(2)}</div>
                    <div className="text-[#22d3ee]">C {latest.close.toFixed(2)}</div>
                    <div className={`${(stock?.changePercent ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-[#f43f5e]'}`}>
                      {(stock?.changePercent ?? 0) >= 0 ? '+' : ''}
                      {stock?.change.toFixed(2)} ({stock?.changePercent.toFixed(2)}%)
                    </div>
                  </>
                )}
              </div>
              <div className="text-xs text-white/35">Drag to pan · Wheel to zoom</div>
            </div>

            <div className="flex h-12 items-center gap-2 border-b border-[#1f2430] px-4">
              <span className="rounded-full border border-[#2f3441] bg-[#161b26] px-3 py-1 text-[11px] font-semibold text-[#9ca3af]">
                Candles
              </span>
              {[
                { label: 'MA5', color: '#dc2626' },
                { label: 'MA10', color: '#d97706' },
                { label: 'MA20', color: '#06b6d4' },
                { label: 'MA60', color: '#2563eb' },
                { label: 'MA200', color: '#7c3aed' },
              ].map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-2 rounded-full border border-[#2f3441] bg-[#161b26] px-3 py-1 text-[11px] font-semibold text-[#9ca3af]"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }}></span>
                  {item.label}
                </span>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden bg-[#131722] px-3 py-2">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-white/45">Loading full chart...</div>
              ) : (
                <LightweightFullChart data={history} height={760} />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default FullChartPage;
