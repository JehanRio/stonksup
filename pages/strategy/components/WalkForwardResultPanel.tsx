import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
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

import type { WalkForwardResult } from '../../../services/walkForwardApi';
import '../../../styles/strategy-lab-walk-forward.css';


type RunStatus = 'loading' | 'ready' | 'running' | 'complete' | 'error';
type ChartRange = { start: string; end: string };

type Props = {
  status: RunStatus;
  result: WalkForwardResult | null;
};

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
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

const parameterLabel = (name: string) => ({
  ema_period: 'EMA 周期',
  fast_period: '快速均线',
  lookback_period: '突破窗口',
  rsi_period: 'RSI 周期',
}[name] ?? name);

const objectiveLabel = (objective: string) => ({
  calmar: 'Calmar',
  sharpe: 'Sharpe',
  annualized_return: '年化收益',
}[objective] ?? objective);

const riskLabel = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

const orderedRange = ({ start, end }: ChartRange): ChartRange =>
  start <= end ? { start, end } : { start: end, end: start };

const chartDate = (state: any): string | null =>
  typeof state?.activeLabel === 'string' ? state.activeLabel : null;

const CurveTooltip = ({ active, payload, label }: any) => {
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


const WalkForwardResultPanel: React.FC<Props> = ({ status, result }) => {
  const [zoomRange, setZoomRange] = useState<ChartRange | null>(null);
  const [dragRange, setDragRange] = useState<ChartRange | null>(null);
  const visibleCurve = useMemo(() => {
    const curve = result?.equityCurve ?? [];
    if (!zoomRange) return curve;
    const range = orderedRange(zoomRange);
    return curve.filter((point) => point.date >= range.start && point.date <= range.end);
  }, [result, zoomRange]);

  useEffect(() => {
    setZoomRange(null);
    setDragRange(null);
  }, [result?.experimentId]);

  const beginZoom = (state: any, event: React.SyntheticEvent) => {
    const date = chartDate(state);
    if (!date) return;
    event.preventDefault();
    setDragRange({ start: date, end: date });
  };

  const updateZoom = (state: any) => {
    const date = chartDate(state);
    if (!date) return;
    setDragRange((current) => current ? { ...current, end: date } : null);
  };

  const commitZoom = () => {
    if (!dragRange) return;
    const range = orderedRange(dragRange);
    const selected = visibleCurve.filter(
      (point) => point.date >= range.start && point.date <= range.end,
    );
    if (range.start !== range.end && selected.length >= 3) setZoomRange(range);
    setDragRange(null);
  };

  const statusLabel = {
    loading: 'CONNECTING ENGINE',
    ready: 'READY TO VALIDATE',
    running: 'SEARCHING PARAMETERS',
    complete: 'VALIDATION COMPLETE',
    error: 'VALIDATION FAILED',
  }[status];
  const orderedDrag = dragRange ? orderedRange(dragRange) : null;

  return (
    <main className="strategy-results walk-forward-results">
      <div className="strategy-run-strip">
        <span className={`strategy-run-status is-${status}`}>
          {status === 'complete' ? <CheckCircle2 size={16} /> : <RefreshCw size={16} />}
          {statusLabel}
        </span>
        <span>{result?.experimentId ?? 'WAITING FOR VALIDATION'}</span>
        <span>{result ? `${result.windowCount} OOS windows` : 'rolling windows'}</span>
        <span>{result ? `${result.candidateCount} candidate trials` : 'frozen parameters'}</span>
      </div>

      {!result ? (
        <div className="strategy-empty-result">
          <FlaskConical size={28} />
          <strong>{status === 'running' ? '正在搜索并验证参数' : '样本外验证已就绪'}</strong>
          <span>
            {status === 'running'
              ? '每个窗口先在参数选择期比较候选，再冻结参数进入测试期。'
              : '运行后将显示拼接测试期净值、窗口参数和过拟合诊断。'}
          </span>
        </div>
      ) : (
        <>
          <section className="strategy-result-hero walk-forward-hero">
            <div>
              <span className="strategy-eyebrow">WALK-FORWARD / OUT-OF-SAMPLE</span>
              <h2>{result.strategyName}</h2>
              <p>
                {result.trainBars} bars 参数选择 / {result.testBars} bars 测试 / {objectiveLabel(result.objective)}
              </p>
            </div>
            <div className="walk-forward-hero-side">
              <span className={`walk-forward-risk is-${result.overfittingRisk}`}>
                过拟合 {riskLabel[result.overfittingRisk]}
              </span>
              <div className="strategy-equity-value">
                <span>样本外期末权益</span>
                <strong>{formatCurrency(result.aggregate.finalEquity)}</strong>
                <small className={result.aggregate.totalReturn >= 0 ? 'positive' : 'negative'}>
                  {formatPercent(result.aggregate.totalReturn)}
                </small>
              </div>
            </div>
          </section>

          <div className="strategy-relative-summary">
            <div><span>样本外策略</span><strong>{formatPercent(result.aggregate.totalReturn)}</strong></div>
            <div><span>{result.symbol} 持有</span><strong>{formatPercent(result.aggregate.assetReturn)}</strong></div>
            <div><span>{result.benchmarkSymbol} 基准</span><strong>{formatPercent(result.aggregate.benchmarkReturn)}</strong></div>
            <div><span>参数稳定性</span><strong>{formatPercent(result.aggregate.parameterStability)}</strong></div>
          </div>

          <div className="strategy-metric-grid phase2 walk-forward-metrics">
            <article><span>年化收益</span><strong>{formatPercent(result.aggregate.annualizedReturn)}</strong></article>
            <article><span>超额收益</span><strong>{formatPercent(result.aggregate.excessReturn)}</strong></article>
            <article><span>最大回撤</span><strong className="negative">{formatPercent(result.aggregate.maxDrawdown)}</strong></article>
            <article><span>年化波动</span><strong>{formatPercent(result.aggregate.annualizedVolatility)}</strong></article>
            <article><span>Sharpe</span><strong>{formatMetric(result.aggregate.sharpeRatio)}</strong></article>
            <article><span>Calmar</span><strong>{formatMetric(result.aggregate.calmarRatio)}</strong></article>
            <article><span>样本外交易</span><strong>{result.aggregate.tradeCount}</strong></article>
            <article><span>样本外胜率</span><strong>{formatPercent(result.aggregate.winRate)}</strong></article>
          </div>

          {result.warnings.length > 0 && (
            <section className="walk-forward-warnings">
              <div><CircleAlert size={19} /><strong>稳定性诊断</strong></div>
              <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </section>
          )}

          <section className="strategy-chart-section walk-forward-chart-section">
            <div className="strategy-result-heading">
              <div><span>01 / STITCHED OOS EQUITY</span><h3>仅拼接测试期的净值</h3></div>
              <div className="strategy-chart-legend phase2">
                <span><i className="strategy-line" />Strategy</span>
                <span><i className="asset-line" />{result.symbol}</span>
                <span><i className="independent-line" />{result.benchmarkSymbol}</span>
              </div>
            </div>
            <div className={`strategy-chart strategy-chart-zoom ${dragRange ? 'is-selecting' : ''}`}>
              {zoomRange && (
                <button type="button" className="strategy-chart-reset" onClick={() => setZoomRange(null)} title="重置图表缩放" aria-label="重置图表缩放">
                  <ZoomOut size={16} />
                </button>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={visibleCurve} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} onMouseDown={beginZoom} onMouseMove={updateZoom} onMouseUp={commitZoom} onMouseLeave={commitZoom}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" strokeDasharray="3 4" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={42} tick={{ fill: '#76818a', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={70} domain={['auto', 'auto']} tickFormatter={(value) => formatCurrency(Number(value), true)} tick={{ fill: '#76818a', fontSize: 12 }} />
                  <Tooltip content={<CurveTooltip />} />
                  {orderedDrag && (
                    <ReferenceArea
                      x1={orderedDrag.start}
                      x2={orderedDrag.end}
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
                  )}
                  <Line type="monotone" dataKey="strategy" name="OOS Strategy" stroke="#4d8dff" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="asset" name={`${result.symbol} Buy & Hold`} stroke="#7a8791" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="benchmark" name={result.benchmarkSymbol} stroke="#e7b84b" strokeWidth={1.6} strokeDasharray="2 5" dot={false} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="walk-forward-ledger-section">
            <div className="strategy-result-heading">
              <div><span>02 / WINDOW LEDGER</span><h3>每个窗口的冻结参数与测试表现</h3></div>
              <span>{parameterLabel(result.primaryParameter)}</span>
            </div>
            <div className="walk-forward-table-wrap">
              <table className="walk-forward-table">
                <thead><tr><th>窗口</th><th>参数选择期</th><th>测试期</th><th>周期</th><th>止损</th><th>选择期目标</th><th>测试期收益</th><th>测试期回撤</th><th>交易</th></tr></thead>
                <tbody>
                  {result.windows.map((window) => (
                    <tr key={window.sequence} className={window.usedFallback ? 'is-fallback' : ''}>
                      <td>W{String(window.sequence).padStart(2, '0')}</td>
                      <td>{window.trainStart}<small>{window.trainEnd}</small></td>
                      <td>{window.testStart}<small>{window.testEnd}</small></td>
                      <td>{window.selectedPeriod}</td>
                      <td>{window.selectedStopLoss.toFixed(1)}%</td>
                      <td>{formatMetric(window.objectiveScore)}</td>
                      <td className={window.test.totalReturn >= 0 ? 'positive' : 'negative'}>{formatPercent(window.test.totalReturn)}</td>
                      <td className="negative">{formatPercent(window.test.maxDrawdown)}</td>
                      <td>{window.test.tradeCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="walk-forward-ledger-section">
            <div className="strategy-result-heading">
              <div><span>03 / PARAMETER SURFACE</span><h3>全部候选参数，不只展示赢家</h3></div>
              <span>{result.parameterSurface.length} 组参数</span>
            </div>
            <div className="walk-forward-table-wrap compact">
              <table className="walk-forward-table parameter-table">
                <thead><tr><th>{parameterLabel(result.primaryParameter)}</th><th>止损</th><th>平均 {objectiveLabel(result.objective)}</th><th>平均选择期收益</th><th>达标窗口</th><th>入选次数</th></tr></thead>
                <tbody>
                  {result.parameterSurface.map((point) => (
                    <tr key={`${point.period}-${point.stopLoss}`} className={point.selectedCount > 0 ? 'is-selected' : ''}>
                      <td>{point.period}</td><td>{point.stopLoss.toFixed(1)}%</td><td>{formatMetric(point.meanScore)}</td>
                      <td>{formatPercent(point.meanTrainReturn)}</td><td>{formatPercent(point.eligibleRate)}</td><td>{point.selectedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="walk-forward-audit-grid">
            <section>
              <div className="strategy-result-heading"><div><span>04 / ASSUMPTIONS</span><h3>验证边界</h3></div><CircleAlert size={20} /></div>
              <ul>{result.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <div className="strategy-result-heading"><div><span>05 / AUDIT</span><h3>无穿越检查</h3></div><ShieldCheck size={20} /></div>
              <ul>{result.audit.map((item, index) => <li key={`${index}-${item}`} className={item.startsWith('PASS') ? 'is-pass' : ''}>{item}</li>)}</ul>
            </section>
          </div>

          <footer className="walk-forward-provenance">
            <ShieldCheck size={18} />
            <span>OHLCV {result.dataQuality.strategyHash.slice(0, 12)} / {result.dataQuality.benchmarkHash.slice(0, 12)}</span>
            <strong>{result.engine}</strong>
          </footer>
        </>
      )}
    </main>
  );
};


export default WalkForwardResultPanel;
