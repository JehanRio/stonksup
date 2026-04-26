import React, { useMemo } from 'react';
import KLineChart from '../KLineChart';
import Sparkline from '../Sparkline';
import { NewsItem, OHLC, Stock } from '../../types';

interface MarketSummaryPageProps {
  selectedStock: Stock | null;
  stocks: Stock[];
  history: OHLC[];
  historyLoading: boolean;
  news: NewsItem[];
  onOpenStock: (symbol: string) => void;
  onOpenJournal: () => void;
}

const formatPrice = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '--');

const formatChange = (value: number) => {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};

const MarketSummaryPage: React.FC<MarketSummaryPageProps> = ({
  selectedStock,
  stocks,
  history,
  historyLoading,
  news,
  onOpenStock,
  onOpenJournal,
}) => {
  const primaryCards = useMemo(() => stocks.slice(1, 4), [stocks]);
  const secondaryCards = useMemo(() => stocks.slice(4, 7), [stocks]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0e11] text-white">
      <div className="border-b border-white/10 px-8 py-5">
        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">Market Summary</div>
            <h2 className="mt-2 text-4xl font-semibold tracking-tight">Trading Desk</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenJournal}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
            >
              交易日记
            </button>
            <button
              type="button"
              onClick={() => selectedStock && onOpenStock(selectedStock.symbol)}
              className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-[#041317] transition hover:bg-cyan-300"
            >
              Open selected stock
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="grid min-h-full grid-cols-[minmax(0,1.8fr)_minmax(360px,0.9fr)] gap-6">
          <section className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-[#0f1318] p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-white/50">Lead Symbol</div>
                  <div className="mt-3 flex items-end gap-4">
                    <div>
                      <div className="text-3xl font-semibold">{selectedStock?.name || selectedStock?.symbol || 'No Selection'}</div>
                      <div className="mt-2 flex items-center gap-3 text-sm text-white/55">
                        <span>{selectedStock?.symbol || '--'}</span>
                        <span>NASDAQ</span>
                      </div>
                    </div>
                    <div className="pb-1">
                      <div className="text-4xl font-semibold">{formatPrice(selectedStock?.price ?? NaN)}</div>
                      <div className={`mt-2 text-lg font-medium ${(selectedStock?.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatChange(selectedStock?.changePercent ?? NaN)}
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => selectedStock && onOpenStock(selectedStock.symbol)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10"
                >
                  View detail
                </button>
              </div>

              {historyLoading ? (
                <div className="flex h-[420px] items-center justify-center rounded-[24px] border border-white/10 bg-[#0a0d11] text-white/45">
                  Loading chart...
                </div>
              ) : (
                <KLineChart data={history} theme="dark" mode="line" height={420} showBrush={false} showLegend={false} />
              )}
            </div>

            <div className="grid grid-cols-3 gap-6">
              {[...primaryCards, ...secondaryCards].slice(0, 3).map((stock) => (
                <button
                  key={stock.id}
                  type="button"
                  onClick={() => onOpenStock(stock.symbol)}
                  className="rounded-[24px] border border-white/10 bg-[#0f1318] p-5 text-left transition hover:border-white/20 hover:bg-[#131820]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{stock.symbol}</div>
                      <div className="mt-1 text-xs text-white/40">{stock.name}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${stock.changePercent >= 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}>
                      {stock.changePercent >= 0 ? 'Bullish' : 'Weak'}
                    </span>
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-4">
                    <div>
                      <div className="text-3xl font-semibold">{formatPrice(stock.price)}</div>
                      <div className={`mt-2 text-sm font-medium ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stock.change >= 0 ? '+' : ''}
                        {stock.change.toFixed(2)} · {formatChange(stock.changePercent)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] px-2 py-1">
                      <Sparkline data={stock.sparkline} color={stock.changePercent >= 0 ? '#00c2a8' : '#ff4d5a'} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-[#0f1318] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-xl font-semibold">Market movers</div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">Watchlist</div>
              </div>
              <div className="divide-y divide-white/10">
                {stocks.slice(0, 6).map((stock) => (
                  <button
                    key={stock.id}
                    type="button"
                    onClick={() => onOpenStock(stock.symbol)}
                    className="flex w-full items-center justify-between gap-3 py-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium text-white">{stock.symbol}</div>
                      <div className="truncate text-xs text-white/40">{stock.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-white">{formatPrice(stock.price)}</div>
                      <div className={`mt-1 text-sm ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatChange(stock.changePercent)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#0f1318] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-xl font-semibold">Latest headlines</div>
                <div className="text-xs text-white/35">Top {Math.min(news.length, 5)}</div>
              </div>
              <div className="space-y-3">
                {news.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
                        {item.source}
                      </span>
                      <span className="text-xs text-white/30">{item.time}</span>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-white/85">{item.title}</div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default MarketSummaryPage;
