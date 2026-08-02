import React, { useEffect, useMemo, useState } from 'react';
import {
  Braces,
  CheckCircle2,
  CircleAlert,
  FlaskConical,
  Gauge,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  ZoomOut,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type {
  BacktestResult,
  StrategyCompilation,
  StrategySpec,
} from '../../../services/backtestApi';
import '../../../styles/strategy-lab-phase3.css';
import '../../../styles/strategy-lab-phase4.css';


const formatCurrency = (value: number, compact = false) =>
  new Intl.NumberFormat('en-US', {
    notation: compact ? 'compact' : 'standard',
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);

const formatPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

const formatPercentagePoints = (value: number) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)} pp`;

const formatMetric = (value: number) =>
  Number.isFinite(value) ? value.toFixed(2) : '--';

const formatHash = (value: string) => value ? `${value.slice(0, 12)}...` : '--';

const resultMetrics = (result: BacktestResult, riskFreeRatePercent: number) => [
  { label: '年化收益', value: formatPercent(result.annualizedReturn), tone: result.annualizedReturn >= 0 ? 'positive' : 'negative' },
  { label: `超额百分点 vs ${result.benchmarkSymbol}`, value: formatPercentagePoints(result.excessReturn), tone: result.excessReturn >= 0 ? 'positive' : 'negative' },
  { label: `相对财富收益 vs ${result.benchmarkSymbol}`, value: formatPercent(result.relativeReturn), tone: result.relativeReturn >= 0 ? 'positive' : 'negative' },
  { label: '最大回撤', value: formatPercent(result.maxDrawdown), tone: 'negative' },
  { label: '年化波动率', value: formatPercent(result.annualizedVolatility), tone: 'neutral' },
  { label: `夏普 (Rf ${riskFreeRatePercent.toFixed(1)}%)`, value: formatMetric(result.sharpeRatio), tone: result.sharpeRatio >= 1 ? 'positive' : 'neutral' },
  { label: `Sortino (Rf ${riskFreeRatePercent.toFixed(1)}%)`, value: formatMetric(result.sortinoRatio), tone: result.sortinoRatio >= 1 ? 'positive' : 'neutral' },
  { label: 'Calmar', value: formatMetric(result.calmarRatio), tone: result.calmarRatio >= 1 ? 'positive' : 'neutral' },
  { label: `年化 Alpha (Rf ${riskFreeRatePercent.toFixed(1)}%)`, value: formatPercent(result.alpha), tone: result.alpha >= 0 ? 'positive' : 'negative' },
  { label: 'Beta', value: formatMetric(result.beta), tone: 'neutral' },
  { label: '胜率', value: formatPercent(result.winRate), tone: 'neutral' },
  { label: '交易次数', value: String(result.tradeCount), tone: 'neutral' },
];

const describeStrategy = (strategy: StrategySpec): string[] => {
  const entryExit = {
    ema_pullback: [
      `收盘确认价格触及 EMA${strategy.emaPeriod}（容差 ${strategy.touchToleranceBps} bps）后，于下一交易日开盘买入。`,
      `收盘跌破 EMA${strategy.emaPeriod} 后，于下一交易日开盘卖出。`,
    ],
    ma_crossover: [
      `快线 MA${strategy.fastPeriod} 上穿慢线 MA${strategy.slowPeriod} 后，于下一交易日开盘买入。`,
      `快线下穿慢线后，于下一交易日开盘卖出。`,
    ],
    momentum_breakout: [
      `收盘突破过去 ${strategy.lookbackPeriod} 个交易日高点后，于下一交易日开盘买入。`,
      `跌破策略退出条件后，于下一交易日开盘卖出。`,
    ],
    rsi_mean_reversion: [
      `RSI(${strategy.rsiPeriod}) 低于 ${strategy.rsiEntry} 后，于下一交易日开盘买入。`,
      `RSI(${strategy.rsiPeriod}) 高于 ${strategy.rsiExit} 后，于下一交易日开盘卖出。`,
    ],
  }[strategy.kind];

  return [
    ...entryExit,
    `每次最多使用 ${strategy.allocationPercent}% 可用资金；保护止损为 ${strategy.stopLossPercent}%。`,
    '仅做多；信号在收盘生成，成交使用下一交易日开盘价。',
  ];
};

const EquityTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="strategy-chart-tooltip">
      <span>{label}</span>
      {payload.map((item: any) => (
        <strong key={item.dataKey} style={{ color: item.color }}>
          {item.name}: {formatCurrency(Number(item.value))}
        </strong>
      ))}
    </div>
  );
};


type ChartRange = {
  start: string;
  end: string;
};

const orderChartRange = ({ start, end }: ChartRange): ChartRange =>
  start <= end ? { start, end } : { start: end, end: start };

const getChartDate = (state: any): string | null =>
  typeof state?.activeLabel === 'string' ? state.activeLabel : null;


type Props = {
  status: 'loading' | 'ready' | 'running' | 'complete' | 'error';
  result: BacktestResult | null;
  definition: StrategySpec;
  compilation: StrategyCompilation | null;
  riskFreeRatePercent: number;
};


const StrategyResultPanel: React.FC<Props> = ({
  status,
  result,
  definition,
  compilation,
  riskFreeRatePercent,
}) => {
  const metrics = useMemo(
    () => result ? resultMetrics(result, riskFreeRatePercent) : [],
    [result, riskFreeRatePercent],
  );
  const [zoomRange, setZoomRange] = useState<ChartRange | null>(null);
  const [dragRange, setDragRange] = useState<ChartRange | null>(null);
  const visibleEquityCurve = useMemo(() => {
    const equityCurve = result?.equityCurve ?? [];
    if (!zoomRange) return equityCurve;
    const range = orderChartRange(zoomRange);
    return equityCurve.filter((point) => point.date >= range.start && point.date <= range.end);
  }, [result, zoomRange]);

  useEffect(() => {
    setZoomRange(null);
    setDragRange(null);
  }, [result?.runId]);

  const currentRules = compilation?.interpretation ?? describeStrategy(definition);
  const statusLabel = {
    loading: 'CONNECTING ENGINE',
    ready: 'READY TO RUN',
    running: 'RUNNING',
    complete: 'RUN COMPLETE',
    error: 'RUN FAILED',
  }[status];
  const emptyCopy = {
    loading: ['正在初始化回测引擎', '正在读取数据能力与策略编译器状态。'],
    ready: ['配置已就绪', '点击“运行回测”后，这里会显示净值、风险指标、数据质量和交易明细。'],
    running: ['正在运行回测', '系统正在补齐行情、校验数据并执行确定性回测。'],
    complete: ['运行已完成', '结果加载中。'],
    error: ['本次运行未完成', '请根据上方错误信息修正配置后重新运行。'],
  }[status];

  const beginChartZoom = (state: any, event: React.SyntheticEvent) => {
    const date = getChartDate(state);
    if (!date) return;
    event.preventDefault();
    setDragRange({ start: date, end: date });
  };

  const updateChartZoom = (state: any) => {
    const date = getChartDate(state);
    if (!date) return;
    setDragRange((current) => current ? { ...current, end: date } : null);
  };

  const commitChartZoom = () => {
    if (!dragRange) return;
    const range = orderChartRange(dragRange);
    const selectedPoints = visibleEquityCurve.filter(
      (point) => point.date >= range.start && point.date <= range.end,
    );
    if (range.start !== range.end && selectedPoints.length >= 3) {
      setZoomRange(range);
    }
    setDragRange(null);
  };

  const resetChartZoom = () => {
    setZoomRange(null);
    setDragRange(null);
  };

  const orderedDragRange = dragRange ? orderChartRange(dragRange) : null;

  return (
    <main className="strategy-results">
      <div className="strategy-run-strip">
        <span className={`strategy-run-status is-${status}`}>
          {status === 'complete' ? <CheckCircle2 size={16} /> : <RefreshCw size={16} />}
          {statusLabel}
        </span>
        <span>{result?.runId ?? 'WAITING FOR RUN'}</span>
        <span>{result ? `${result.bars} daily bars` : definition.kind}</span>
        <span>
          {result
            ? `${result.dataQuality.actualStart} to ${result.dataQuality.actualEnd}`
            : 'next-open execution'}
        </span>
      </div>

      {!result ? (
        <div className="strategy-empty-result">
          <FlaskConical size={28} />
          <strong>{emptyCopy[0]}</strong>
          <span>{emptyCopy[1]}</span>
        </div>
      ) : (
        <>
          <section className="strategy-result-hero">
            <div>
              <span className="strategy-eyebrow">BACKTEST OUTPUT</span>
              <h2>{definition.name}</h2>
              <p>{result.engine} / {result.adjustment} / vs {result.benchmarkSymbol}</p>
            </div>
            <div className="strategy-equity-value">
              <span>期末权益</span>
              <strong>{formatCurrency(result.finalEquity)}</strong>
              <small className={result.totalReturn >= 0 ? 'positive' : 'negative'}>
                {formatPercent(result.totalReturn)}
              </small>
            </div>
          </section>

          <div className="strategy-relative-summary">
            <div>
              <span>策略</span>
              <strong className={result.totalReturn >= 0 ? 'positive' : 'negative'}>
                {formatPercent(result.totalReturn)}
              </strong>
            </div>
            <div>
              <span>{result.symbol} 买入持有</span>
              <strong className={result.assetReturn >= 0 ? 'positive' : 'negative'}>
                {formatPercent(result.assetReturn)}
              </strong>
            </div>
            <div>
              <span>{result.benchmarkSymbol} 独立基准</span>
              <strong className={result.benchmarkReturn >= 0 ? 'positive' : 'negative'}>
                {formatPercent(result.benchmarkReturn)}
              </strong>
            </div>
            <div>
              <span>平均持仓日历日 / 佣金</span>
              <strong>{result.averageHoldingDays.toFixed(1)}d / {formatCurrency(result.totalCommission)}</strong>
            </div>
          </div>

          <div className="strategy-metric-grid phase2">
            {metrics.map((metric) => (
              <article key={metric.label}>
                <span>{metric.label}</span>
                <strong className={metric.tone}>{metric.value}</strong>
              </article>
            ))}
          </div>

          <section className={`strategy-data-quality phase3 is-${result.dataQuality.status}`}>
            <div className="strategy-quality-summary">
              <span>DATA QUALITY</span>
              <strong>{result.dataQuality.status.toUpperCase()}</strong>
              <small>
                {result.adjustment === 'all' ? 'FULLY ADJUSTED' : result.adjustment.toUpperCase()}
              </small>
            </div>

            <dl className="strategy-quality-ledger">
              <div>
                <dt>请求区间</dt>
                <dd>{result.dataQuality.requestedStart} - {result.dataQuality.requestedEnd}</dd>
              </div>
              <div>
                <dt>{result.symbol} 实际区间</dt>
                <dd>{result.dataQuality.actualStart} - {result.dataQuality.actualEnd}</dd>
              </div>
              <div>
                <dt>{result.benchmarkSymbol} 实际区间</dt>
                <dd>{result.dataQuality.benchmarkStart} - {result.dataQuality.benchmarkEnd}</dd>
              </div>
              <div>
                <dt>覆盖率 / 新鲜度</dt>
                <dd>
                  {(result.dataQuality.coverageRatio * 100).toFixed(1)}% / {' '}
                  {result.dataQuality.staleTradingDays} 个交易日延迟
                </dd>
              </div>
              <div>
                <dt>Bars</dt>
                <dd>{result.dataQuality.strategyBars} / {result.dataQuality.benchmarkBars} / {result.dataQuality.alignedBars} aligned</dd>
              </div>
              <div>
                <dt>OHLCV 指纹</dt>
                <dd title={`${result.symbol}: ${result.dataQuality.strategyHash}\n${result.benchmarkSymbol}: ${result.dataQuality.benchmarkHash}`}>
                  {formatHash(result.dataQuality.strategyHash)} / {formatHash(result.dataQuality.benchmarkHash)}
                </dd>
              </div>
            </dl>

            <ul className="strategy-quality-checks">
              {result.dataQuality.checks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
          </section>

          <section className="strategy-chart-section">
            <div className="strategy-result-heading">
              <div>
                <span>04 / RELATIVE EQUITY</span>
                <h3>策略、标的持有与独立基准</h3>
              </div>
              <div className="strategy-chart-legend phase2">
                <span><i className="strategy-line" />Strategy</span>
                <span><i className="asset-line" />{result.symbol}</span>
                <span><i className="independent-line" />{result.benchmarkSymbol}</span>
              </div>
            </div>
            <div
              className={`strategy-chart strategy-chart-zoom ${dragRange ? 'is-selecting' : ''}`}
              data-zoom-start={zoomRange?.start ?? ''}
              data-zoom-end={zoomRange?.end ?? ''}
            >
              {zoomRange ? (
                <button
                  type="button"
                  className="strategy-chart-reset"
                  onClick={resetChartZoom}
                  aria-label="重置图表缩放"
                  title="重置图表缩放"
                >
                  <ZoomOut size={16} />
                </button>
              ) : null}
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={visibleEquityCurve}
                  margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
                  onMouseDown={beginChartZoom}
                  onMouseMove={updateChartZoom}
                  onMouseUp={commitChartZoom}
                  onMouseLeave={commitChartZoom}
                >
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" strokeDasharray="3 4" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={42} tick={{ fill: '#76818a', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={70} domain={['auto', 'auto']} tickFormatter={(value) => formatCurrency(Number(value), true)} tick={{ fill: '#76818a', fontSize: 12 }} />
                  <Tooltip content={<EquityTooltip />} />
                  {orderedDragRange ? (
                    <ReferenceArea
                      x1={orderedDragRange.start}
                      x2={orderedDragRange.end}
                      shape={({ x, y, width, height }: any) => (
                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill="#4d8dff"
                          fillOpacity={0.14}
                          stroke="#4d8dff"
                          strokeOpacity={0.72}
                          style={{ pointerEvents: 'none' }}
                        />
                      )}
                    />
                  ) : null}
                  <Line type="monotone" dataKey="strategy" name="Strategy" stroke="#4d8dff" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="asset" name={`${result.symbol} Buy & Hold`} stroke="#73808a" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="benchmark" name={result.benchmarkSymbol} stroke="#e7b84b" strokeWidth={1.6} strokeDasharray="2 5" dot={false} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="strategy-audit-grid">
            <section className="strategy-audit-section">
              <div className="strategy-result-heading">
                <div><span>05 / COMPILED CONTRACT</span><h3>{compilation ? 'AI 规则解释' : '当前结构化规则'}</h3></div>
                <Braces size={20} />
              </div>
              <ol className="strategy-rule-list">
                {currentRules.map((rule, index) => (
                  <li key={`${index}-${rule}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{rule}</p></li>
                ))}
              </ol>
              <div className="strategy-contract-version">
                <ShieldCheck size={17} />
                {compilation?.contractVersion ?? result.contractVersion}
              </div>
            </section>

            <section className="strategy-audit-section">
              <div className="strategy-result-heading">
                <div><span>06 / ASSUMPTIONS</span><h3>运行边界</h3></div>
                <SlidersHorizontal size={20} />
              </div>
              <ul className="strategy-assumption-list">
                {[...(compilation?.assumptions ?? []), ...(compilation?.warnings ?? []), ...result.assumptions].map((assumption, index) => (
                  <li key={`${index}-${assumption}`}><CircleAlert size={16} /><span>{assumption}</span></li>
                ))}
              </ul>
            </section>
          </div>

          <section className="strategy-trades-section">
            <div className="strategy-result-heading">
              <div><span>07 / TRADE LEDGER</span><h3>模拟交易明细</h3></div>
              <span className="strategy-profit-factor">Profit factor <strong>{formatMetric(result.profitFactor)}</strong></span>
            </div>
            <div className="strategy-trade-table">
              <div className="strategy-trade-row strategy-trade-head">
                <span>ID</span><span>Entry</span><span>Exit</span><span>Qty</span><span>P&amp;L</span><span>Return</span><span>Reason</span>
              </div>
              {result.trades.length > 0 ? result.trades.slice().reverse().slice(0, 8).map((trade) => (
                <div className="strategy-trade-row" key={trade.id}>
                  <span>{trade.id}</span><span>{trade.entryDate}</span><span>{trade.exitDate}</span><span>{trade.quantity}</span>
                  <span className={trade.pnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(trade.pnl)}</span>
                  <span className={trade.returnPercent >= 0 ? 'positive' : 'negative'}>{formatPercent(trade.returnPercent)}</span>
                  <span>{trade.exitReason}</span>
                </div>
              )) : (
                <div className="strategy-no-trades"><Gauge size={22} />当前参数未产生交易，调整规则后重新运行。</div>
              )}
            </div>
          </section>

          <section className="strategy-engine-audit">
            <div><span>08 / ENGINE AUDIT</span><h3>可复现性检查</h3></div>
            <ul>
              {result.audit.map((item, index) => (
                <li key={`${index}-${item}`} className={item.startsWith('PASS') ? 'is-pass' : ''}>{item}</li>
              ))}
            </ul>
          </section>

          <footer className="strategy-next-step">
            <FlaskConical size={20} />
            <span>下一步将加入训练集、测试集和 Walk-forward 窗口，检查策略是否存在参数过拟合。</span>
          </footer>
        </>
      )}
    </main>
  );
};


export default StrategyResultPanel;
