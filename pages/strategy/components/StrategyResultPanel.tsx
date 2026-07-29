import React, { useMemo } from 'react';
import {
  Braces,
  CheckCircle2,
  CircleAlert,
  FlaskConical,
  Gauge,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
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


const formatCurrency = (value: number, compact = false) =>
  new Intl.NumberFormat('en-US', {
    notation: compact ? 'compact' : 'standard',
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);

const formatPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

const formatMetric = (value: number) =>
  Number.isFinite(value) ? value.toFixed(2) : '--';

const resultMetrics = (result: BacktestResult) => [
  { label: '累计收益', value: formatPercent(result.totalReturn), tone: result.totalReturn >= 0 ? 'positive' : 'negative' },
  { label: '年化收益', value: formatPercent(result.annualizedReturn), tone: result.annualizedReturn >= 0 ? 'positive' : 'negative' },
  { label: `超额收益 vs ${result.benchmarkSymbol}`, value: formatPercent(result.excessReturn), tone: result.excessReturn >= 0 ? 'positive' : 'negative' },
  { label: '最大回撤', value: formatPercent(result.maxDrawdown), tone: 'negative' },
  { label: '年化波动率', value: formatPercent(result.annualizedVolatility), tone: 'neutral' },
  { label: '夏普比率', value: formatMetric(result.sharpeRatio), tone: result.sharpeRatio >= 1 ? 'positive' : 'neutral' },
  { label: 'Sortino', value: formatMetric(result.sortinoRatio), tone: result.sortinoRatio >= 1 ? 'positive' : 'neutral' },
  { label: 'Calmar', value: formatMetric(result.calmarRatio), tone: result.calmarRatio >= 1 ? 'positive' : 'neutral' },
  { label: '年化 Alpha', value: formatPercent(result.alpha), tone: result.alpha >= 0 ? 'positive' : 'negative' },
  { label: 'Beta', value: formatMetric(result.beta), tone: 'neutral' },
  { label: '胜率', value: formatPercent(result.winRate), tone: 'neutral' },
  { label: '交易次数', value: String(result.tradeCount), tone: 'neutral' },
];

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


type Props = {
  status: 'loading' | 'ready' | 'running' | 'complete' | 'error';
  result: BacktestResult | null;
  definition: StrategySpec;
  compilation: StrategyCompilation | null;
};


const StrategyResultPanel: React.FC<Props> = ({
  status,
  result,
  definition,
  compilation,
}) => {
  const metrics = useMemo(() => (result ? resultMetrics(result) : []), [result]);
  const statusLabel = {
    loading: 'CONNECTING ENGINE',
    ready: 'READY TO RUN',
    running: 'RUNNING',
    complete: 'RUN COMPLETE',
    error: 'RUN FAILED',
  }[status];

  return (
    <main className="strategy-results">
      <div className="strategy-run-strip">
        <span className={`strategy-run-status is-${status}`}>
          {status === 'complete' ? <CheckCircle2 size={16} /> : <RefreshCw size={16} />}
          {statusLabel}
        </span>
        <span>{result?.runId ?? 'WAITING FOR RUN'}</span>
        <span>{result ? `${result.bars} daily bars` : definition.kind}</span>
        <span>{result ? `as of ${result.asOf}` : 'next-open execution'}</span>
      </div>

      {!result ? (
        <div className="strategy-empty-result">
          <FlaskConical size={28} />
          <strong>正在连接确定性回测引擎</strong>
          <span>运行后将在这里显示三条净值曲线、风险指标、审计和交易明细。</span>
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
              <span>{result.benchmarkSymbol} 基准</span>
              <strong className={result.benchmarkReturn >= 0 ? 'positive' : 'negative'}>
                {formatPercent(result.benchmarkReturn)}
              </strong>
            </div>
            <div>
              <span>平均持仓 / 佣金</span>
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

          <section className={`strategy-data-quality is-${result.dataQuality.status}`}>
            <div>
              <span>DATA QUALITY</span>
              <strong>{result.dataQuality.status.toUpperCase()}</strong>
              <small>
                {result.adjustment === 'all' ? 'FULLY ADJUSTED' : result.adjustment.toUpperCase()}
              </small>
            </div>
            <div className="strategy-quality-counts">
              <span>Asset <strong>{result.dataQuality.strategyBars}</strong></span>
              <span>Benchmark <strong>{result.dataQuality.benchmarkBars}</strong></span>
              <span>Aligned <strong>{result.dataQuality.alignedBars}</strong></span>
            </div>
            <ul>
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
            <div className="strategy-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.equityCurve} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" strokeDasharray="3 4" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={42} tick={{ fill: '#76818a', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={70} domain={['auto', 'auto']} tickFormatter={(value) => formatCurrency(Number(value), true)} tick={{ fill: '#76818a', fontSize: 12 }} />
                  <Tooltip content={<EquityTooltip />} />
                  <Line type="monotone" dataKey="strategy" name="Strategy" stroke="#4d8dff" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="asset" name={`${result.symbol} Buy & Hold`} stroke="#73808a" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="benchmark" name={result.benchmarkSymbol} stroke="#e7b84b" strokeWidth={1.6} strokeDasharray="2 5" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="strategy-audit-grid">
            <section className="strategy-audit-section">
              <div className="strategy-result-heading">
                <div><span>05 / COMPILED CONTRACT</span><h3>AI 规则解释</h3></div>
                <Braces size={20} />
              </div>
              <ol className="strategy-rule-list">
                {(compilation?.interpretation ?? []).map((rule, index) => (
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
