import React, { useMemo, useState } from 'react';
import {
  Activity,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Database,
  FlaskConical,
  Gauge,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
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
import {
  compileStrategyPrompt,
  createSeededDailyHistory,
  runBacktest,
  type BacktestConfig,
  type BacktestResult,
  type StrategyDefinition,
  type StrategyKind,
} from '../../services/backtestEngine';
import '../../styles/strategy-lab.css';

const INITIAL_PROMPT =
  'MU 的 20 日均线上穿 60 日均线时买入，下穿时卖出。单次使用 95% 资金，亏损 8% 止损。';

const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 100_000,
  commissionBps: 5,
  slippageBps: 5,
};

const templates: Array<{
  kind: StrategyKind;
  label: string;
  caption: string;
  prompt: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  {
    kind: 'ma_crossover',
    label: '均线交叉',
    caption: '趋势跟随',
    prompt: INITIAL_PROMPT,
    icon: TrendingUp,
  },
  {
    kind: 'momentum_breakout',
    label: '动量突破',
    caption: '价格确认',
    prompt: 'MU 收盘价突破过去 20 日最高价时买入，跌破 20 日均线时卖出，亏损 7% 止损。',
    icon: Activity,
  },
  {
    kind: 'rsi_mean_reversion',
    label: 'RSI 回归',
    caption: '超跌修复',
    prompt: 'MU 的 14 日 RSI 低于 30 时买入，高于 55 时卖出，亏损 6% 止损。',
    icon: RefreshCw,
  },
];

const initialCompilation = compileStrategyPrompt(INITIAL_PROMPT, 'ma_crossover');
const initialHistory = createSeededDailyHistory(initialCompilation.definition.symbol);
const initialResult = runBacktest(initialHistory, initialCompilation.definition, DEFAULT_CONFIG);

const formatCurrency = (value: number, compact = false) => {
  if (compact) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

const formatMetric = (value: number) =>
  Number.isFinite(value) ? value.toFixed(2) : '--';

const resultMetrics = (result: BacktestResult) => [
  { label: '累计收益', value: formatPercent(result.totalReturn), tone: result.totalReturn >= 0 ? 'positive' : 'negative' },
  { label: '年化收益', value: formatPercent(result.annualizedReturn), tone: result.annualizedReturn >= 0 ? 'positive' : 'negative' },
  { label: '最大回撤', value: formatPercent(result.maxDrawdown), tone: 'negative' },
  { label: '夏普比率', value: formatMetric(result.sharpeRatio), tone: result.sharpeRatio >= 1 ? 'positive' : 'neutral' },
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

const NumericField: React.FC<{
  label: string;
  value: number;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, suffix, min, max, step, onChange }) => (
  <label className="strategy-field">
    <span>{label}</span>
    <span className="strategy-number-input">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {suffix && <small>{suffix}</small>}
    </span>
  </label>
);

const StrategyLabPage: React.FC = () => {
  const [prompt, setPrompt] = useState(INITIAL_PROMPT);
  const [compilation, setCompilation] = useState(initialCompilation);
  const [definition, setDefinition] = useState<StrategyDefinition>(initialCompilation.definition);
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG);
  const [result, setResult] = useState<BacktestResult>(initialResult);
  const [status, setStatus] = useState<'compiled' | 'running' | 'complete'>('complete');

  const metrics = useMemo(() => resultMetrics(result), [result]);

  const updateDefinition = <Key extends keyof StrategyDefinition>(
    key: Key,
    value: StrategyDefinition[Key],
  ) => {
    setDefinition((current) => ({ ...current, [key]: value }));
    setStatus('compiled');
  };

  const applyTemplate = (kind: StrategyKind) => {
    const template = templates.find((item) => item.kind === kind);
    if (!template) return;
    const nextCompilation = compileStrategyPrompt(template.prompt, kind);
    setPrompt(template.prompt);
    setCompilation(nextCompilation);
    setDefinition(nextCompilation.definition);
    setStatus('compiled');
  };

  const handleCompile = () => {
    const nextCompilation = compileStrategyPrompt(prompt);
    setCompilation(nextCompilation);
    setDefinition(nextCompilation.definition);
    setStatus('compiled');
  };

  const handleRun = () => {
    setStatus('running');
    const history = createSeededDailyHistory(definition.symbol);
    const nextResult = runBacktest(history, definition, config);
    setResult(nextResult);
    setStatus('complete');
    window.localStorage.setItem(
      'stonksup_strategy_draft',
      JSON.stringify({
        definition,
        config,
        runId: nextResult.runId,
        updatedAt: new Date().toISOString(),
      }),
    );
  };

  return (
    <div className="strategy-lab-page">
      <header className="strategy-lab-header">
        <div>
          <span className="strategy-eyebrow">STRATEGY / DETERMINISTIC BACKTEST</span>
          <h1>策略实验室</h1>
          <p>把口述交易方法编译成可检查的规则，再交给确定性引擎生成可复现结果。</p>
        </div>
        <div className="strategy-header-actions">
          <span className="strategy-data-badge">
            <Database size={17} />
            DEMO DATA
          </span>
          <button type="button" className="strategy-run-button" onClick={handleRun}>
            <Play size={18} fill="currentColor" />
            运行回测
          </button>
        </div>
      </header>

      <div className="strategy-workbench">
        <aside className="strategy-builder">
          <section className="strategy-builder-section">
            <div className="strategy-section-heading">
              <span>01</span>
              <div>
                <h2>选择策略骨架</h2>
                <p>先确定计算范式，再描述个性化规则。</p>
              </div>
            </div>
            <div className="strategy-template-switcher">
              {templates.map((template) => {
                const Icon = template.icon;
                const active = definition.kind === template.kind;
                return (
                  <button
                    key={template.kind}
                    type="button"
                    className={active ? 'is-active' : ''}
                    onClick={() => applyTemplate(template.kind)}
                  >
                    <Icon size={20} strokeWidth={1.8} />
                    <span>
                      <strong>{template.label}</strong>
                      <small>{template.caption}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="strategy-builder-section">
            <div className="strategy-section-heading">
              <span>02</span>
              <div>
                <h2>口述你的做法</h2>
                <p>描述标的、入场、出场、仓位与止损。</p>
              </div>
            </div>
            <textarea
              className="strategy-prompt"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setStatus('compiled');
              }}
              aria-label="口述策略"
            />
            <button type="button" className="strategy-compile-button" onClick={handleCompile}>
              <Sparkles size={18} />
              编译为结构化规则
              <ChevronRight size={18} />
            </button>
          </section>

          <section className="strategy-builder-section">
            <div className="strategy-section-heading">
              <span>03</span>
              <div>
                <h2>确认规则与假设</h2>
                <p>所有输入都会进入本次运行快照。</p>
              </div>
            </div>

            <div className="strategy-fields">
              <label className="strategy-field strategy-field-wide">
                <span>标的代码</span>
                <input
                  value={definition.symbol}
                  onChange={(event) => updateDefinition('symbol', event.target.value.toUpperCase())}
                />
              </label>

              {definition.kind === 'ma_crossover' && (
                <>
                  <NumericField
                    label="快速均线"
                    value={definition.fastPeriod}
                    suffix="日"
                    min={2}
                    max={120}
                    onChange={(value) => updateDefinition('fastPeriod', value)}
                  />
                  <NumericField
                    label="慢速均线"
                    value={definition.slowPeriod}
                    suffix="日"
                    min={5}
                    max={250}
                    onChange={(value) => updateDefinition('slowPeriod', value)}
                  />
                </>
              )}

              {definition.kind === 'momentum_breakout' && (
                <NumericField
                  label="突破窗口"
                  value={definition.lookbackPeriod}
                  suffix="日"
                  min={5}
                  max={120}
                  onChange={(value) => updateDefinition('lookbackPeriod', value)}
                />
              )}

              {definition.kind === 'rsi_mean_reversion' && (
                <>
                  <NumericField
                    label="RSI 周期"
                    value={definition.rsiPeriod}
                    suffix="日"
                    min={5}
                    max={40}
                    onChange={(value) => updateDefinition('rsiPeriod', value)}
                  />
                  <NumericField
                    label="入场阈值"
                    value={definition.rsiEntry}
                    min={5}
                    max={45}
                    onChange={(value) => updateDefinition('rsiEntry', value)}
                  />
                  <NumericField
                    label="出场阈值"
                    value={definition.rsiExit}
                    min={45}
                    max={90}
                    onChange={(value) => updateDefinition('rsiExit', value)}
                  />
                </>
              )}

              <NumericField
                label="保护止损"
                value={definition.stopLossPercent}
                suffix="%"
                min={1}
                max={30}
                step={0.5}
                onChange={(value) => updateDefinition('stopLossPercent', value)}
              />
              <NumericField
                label="资金使用"
                value={definition.allocationPercent}
                suffix="%"
                min={5}
                max={100}
                onChange={(value) => updateDefinition('allocationPercent', value)}
              />
              <NumericField
                label="初始资金"
                value={config.initialCapital}
                suffix="USD"
                min={1_000}
                step={1_000}
                onChange={(value) => {
                  setConfig((current) => ({ ...current, initialCapital: value }));
                  setStatus('compiled');
                }}
              />
              <NumericField
                label="手续费"
                value={config.commissionBps}
                suffix="bps"
                min={0}
                max={100}
                onChange={(value) => {
                  setConfig((current) => ({ ...current, commissionBps: value }));
                  setStatus('compiled');
                }}
              />
              <NumericField
                label="滑点"
                value={config.slippageBps}
                suffix="bps"
                min={0}
                max={100}
                onChange={(value) => {
                  setConfig((current) => ({ ...current, slippageBps: value }));
                  setStatus('compiled');
                }}
              />
            </div>
          </section>
        </aside>

        <main className="strategy-results">
          <div className="strategy-run-strip">
            <span className={`strategy-run-status is-${status}`}>
              {status === 'running' ? <RefreshCw size={16} /> : <CheckCircle2 size={16} />}
              {status === 'complete' ? 'RUN COMPLETE' : status === 'running' ? 'RUNNING' : 'CHANGES NOT RUN'}
            </span>
            <span>{result.runId}</span>
            <span>{result.bars} daily bars</span>
            <span>as of {result.asOf}</span>
          </div>

          <section className="strategy-result-hero">
            <div>
              <span className="strategy-eyebrow">BACKTEST OUTPUT</span>
              <h2>{definition.name}</h2>
              <p>{result.dataSource}</p>
            </div>
            <div className="strategy-equity-value">
              <span>期末权益</span>
              <strong>{formatCurrency(result.finalEquity)}</strong>
              <small className={result.totalReturn >= 0 ? 'positive' : 'negative'}>
                {formatPercent(result.totalReturn)}
              </small>
            </div>
          </section>

          <div className="strategy-metric-grid">
            {metrics.map((metric) => (
              <article key={metric.label}>
                <span>{metric.label}</span>
                <strong className={metric.tone}>{metric.value}</strong>
              </article>
            ))}
          </div>

          <section className="strategy-chart-section">
            <div className="strategy-result-heading">
              <div>
                <span>04 / EQUITY CURVE</span>
                <h3>策略与买入持有</h3>
              </div>
              <div className="strategy-chart-legend">
                <span><i className="strategy-line" />Strategy</span>
                <span><i className="benchmark-line" />Benchmark</span>
              </div>
            </div>
            <div className="strategy-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.equityCurve} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" strokeDasharray="3 4" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={42}
                    tick={{ fill: '#76818a', fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={70}
                    domain={['auto', 'auto']}
                    tickFormatter={(value) => formatCurrency(Number(value), true)}
                    tick={{ fill: '#76818a', fontSize: 12 }}
                  />
                  <Tooltip content={<EquityTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="strategy"
                    name="Strategy"
                    stroke="#4d8dff"
                    strokeWidth={2.4}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    name="Benchmark"
                    stroke="#69737c"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="strategy-audit-grid">
            <section className="strategy-audit-section">
              <div className="strategy-result-heading">
                <div>
                  <span>05 / COMPILED CONTRACT</span>
                  <h3>规则解释</h3>
                </div>
                <Braces size={20} />
              </div>
              <ol className="strategy-rule-list">
                {compilation.interpretation.map((rule, index) => (
                  <li key={rule}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <p>{rule}</p>
                  </li>
                ))}
              </ol>
              <div className="strategy-contract-version">
                <ShieldCheck size={17} />
                {compilation.contractVersion}
              </div>
            </section>

            <section className="strategy-audit-section">
              <div className="strategy-result-heading">
                <div>
                  <span>06 / ASSUMPTIONS</span>
                  <h3>运行边界</h3>
                </div>
                <SlidersHorizontal size={20} />
              </div>
              <ul className="strategy-assumption-list">
                {result.assumptions.map((assumption) => (
                  <li key={assumption}>
                    <CircleAlert size={16} />
                    <span>{assumption}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="strategy-trades-section">
            <div className="strategy-result-heading">
              <div>
                <span>07 / TRADE LEDGER</span>
                <h3>模拟交易明细</h3>
              </div>
              <span className="strategy-profit-factor">
                Profit factor <strong>{formatMetric(result.profitFactor)}</strong>
              </span>
            </div>
            <div className="strategy-trade-table">
              <div className="strategy-trade-row strategy-trade-head">
                <span>ID</span>
                <span>Entry</span>
                <span>Exit</span>
                <span>Qty</span>
                <span>P&amp;L</span>
                <span>Return</span>
                <span>Reason</span>
              </div>
              {result.trades.length > 0 ? (
                result.trades.slice().reverse().slice(0, 8).map((trade) => (
                  <div className="strategy-trade-row" key={trade.id}>
                    <span>{trade.id}</span>
                    <span>{trade.entryDate}</span>
                    <span>{trade.exitDate}</span>
                    <span>{trade.quantity}</span>
                    <span className={trade.pnl >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(trade.pnl)}
                    </span>
                    <span className={trade.returnPercent >= 0 ? 'positive' : 'negative'}>
                      {formatPercent(trade.returnPercent)}
                    </span>
                    <span>{trade.exitReason}</span>
                  </div>
                ))
              ) : (
                <div className="strategy-no-trades">
                  <Gauge size={22} />
                  当前参数未产生交易，调整规则后重新运行。
                </div>
              )}
            </div>
          </section>

          <footer className="strategy-next-step">
            <FlaskConical size={20} />
            <span>下一步：接入 FastAPI 市场数据工具、真实历史数据和样本外验证。</span>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default StrategyLabPage;
