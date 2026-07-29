import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Braces,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Database,
  FlaskConical,
  Gauge,
  History,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
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
  compileAndRunStrategy,
  compileStrategy,
  getBacktestRunHistory,
  getMarketDataCapabilities,
  runStrategy,
  type BacktestConfig,
  type BacktestDataConfig,
  type BacktestResult,
  type BacktestRunSummary,
  type MarketDataCapability,
  type StrategyCompilation,
  type StrategyKind,
  type StrategySpec,
} from '../../services/backtestApi';
import '../../styles/strategy-lab.css';
import '../../styles/strategy-lab-api.css';
import '../../styles/strategy-lab-data.css';

const INITIAL_PROMPT =
  'MU 日线跌到 EMA5 时买入，收盘跌破 EMA5 时卖出。单次使用 95% 资金，亏损 8% 止损。';

const today = new Date();
const fiveYearsAgo = new Date(today);
fiveYearsAgo.setFullYear(today.getFullYear() - 5);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 100_000,
  commissionBps: 5,
  slippageBps: 5,
};

const DEFAULT_DATA: BacktestDataConfig = {
  mode: 'demo',
  provider: 'twelvedata',
  startDate: isoDate(fiveYearsAgo),
  endDate: isoDate(today),
  refresh: false,
};

const DEFAULT_STRATEGY: StrategySpec = {
  name: 'MU EMA5 回踩',
  symbol: 'MU',
  kind: 'ema_pullback',
  timeframe: '1d',
  emaPeriod: 5,
  fastPeriod: 20,
  slowPeriod: 60,
  lookbackPeriod: 20,
  rsiPeriod: 14,
  rsiEntry: 30,
  rsiExit: 55,
  touchToleranceBps: 10,
  stopLossPercent: 8,
  allocationPercent: 95,
  signalAt: 'close',
  fillAt: 'next_open',
  longOnly: true,
};

const templates: Array<{
  kind: StrategyKind;
  label: string;
  caption: string;
  prompt: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  {
    kind: 'ema_pullback',
    label: 'EMA 回踩',
    caption: '触线企稳',
    prompt: INITIAL_PROMPT,
    icon: Target,
  },
  {
    kind: 'ma_crossover',
    label: '均线交叉',
    caption: '趋势跟随',
    prompt: 'MU 的 20 日均线上穿 60 日均线时买入，下穿时卖出。单次使用 95% 资金。',
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

type RunStatus = 'loading' | 'ready' | 'running' | 'complete' | 'error';

const StrategyLabPage: React.FC = () => {
  const [prompt, setPrompt] = useState(INITIAL_PROMPT);
  const [compilation, setCompilation] = useState<StrategyCompilation | null>(null);
  const [definition, setDefinition] = useState<StrategySpec>(DEFAULT_STRATEGY);
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG);
  const [dataConfig, setDataConfig] = useState<BacktestDataConfig>(DEFAULT_DATA);
  const [capability, setCapability] = useState<MarketDataCapability | null>(null);
  const [history, setHistory] = useState<BacktestRunSummary[]>([]);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [status, setStatus] = useState<RunStatus>('loading');
  const [promptDirty, setPromptDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const refreshHistory = async () => {
    try {
      setHistory(await getBacktestRunHistory(6));
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const [capabilityResult] = await Promise.allSettled([
        getMarketDataCapabilities(),
        refreshHistory(),
      ]);
      if (!active) return;
      if (capabilityResult.status === 'fulfilled') {
        setCapability(capabilityResult.value);
      }
      try {
        const response = await compileAndRunStrategy(
          INITIAL_PROMPT,
          DEFAULT_CONFIG,
          DEFAULT_DATA,
        );
        if (!active) return;
        setCompilation(response.compilation);
        setDefinition(response.compilation.strategy);
        setResult(response.backtest);
        setStatus('complete');
        await refreshHistory();
      } catch (error) {
        if (!active) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : '无法连接回测服务');
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => (result ? resultMetrics(result) : []), [result]);
  const busy = status === 'loading' || status === 'running';
  const realReady = Boolean(capability?.configured);

  const updateDefinition = <Key extends keyof StrategySpec>(
    key: Key,
    value: StrategySpec[Key],
  ) => {
    setDefinition((current) => ({ ...current, [key]: value }));
    setPromptDirty(false);
    setStatus('ready');
  };

  const updateData = <Key extends keyof BacktestDataConfig>(
    key: Key,
    value: BacktestDataConfig[Key],
  ) => {
    setDataConfig((current) => ({ ...current, [key]: value }));
    setStatus('ready');
  };

  const applyTemplate = async (kind: StrategyKind) => {
    const template = templates.find((item) => item.kind === kind);
    if (!template) return;
    setPrompt(template.prompt);
    setStatus('running');
    setErrorMessage('');
    try {
      const nextCompilation = await compileStrategy(template.prompt, kind);
      setCompilation(nextCompilation);
      setDefinition(nextCompilation.strategy);
      setPromptDirty(false);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '策略编译失败');
    }
  };

  const handleCompile = async () => {
    setStatus('running');
    setErrorMessage('');
    try {
      const nextCompilation = await compileStrategy(prompt);
      setCompilation(nextCompilation);
      setDefinition(nextCompilation.strategy);
      setPromptDirty(false);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '策略编译失败');
    }
  };

  const handleRun = async () => {
    setStatus('running');
    setErrorMessage('');
    try {
      if (promptDirty || !compilation) {
        const response = await compileAndRunStrategy(prompt, config, dataConfig);
        setCompilation(response.compilation);
        setDefinition(response.compilation.strategy);
        setResult(response.backtest);
        setPromptDirty(false);
      } else {
        setResult(await runStrategy(definition, config, dataConfig));
      }
      setStatus('complete');
      await refreshHistory();
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '回测运行失败');
    }
  };

  const statusLabel = {
    loading: 'CONNECTING ENGINE',
    ready: 'READY TO RUN',
    running: 'RUNNING',
    complete: 'RUN COMPLETE',
    error: 'RUN FAILED',
  }[status];

  return (
    <div className="strategy-lab-page">
      <header className="strategy-lab-header">
        <div>
          <span className="strategy-eyebrow">STRATEGY / NATURAL LANGUAGE BACKTEST</span>
          <h1>策略实验室</h1>
          <p>口述交易规则，审阅结构化契约，使用可追溯行情完成确定性回测。</p>
        </div>
        <div className="strategy-header-actions">
          <span className={`strategy-data-badge ${dataConfig.mode === 'real' ? 'is-real' : ''}`}>
            <Database size={17} />
            {dataConfig.mode === 'real' ? 'REAL DATA' : 'DEMO DATA'}
          </span>
          <button
            type="button"
            className="strategy-run-button"
            onClick={() => void handleRun()}
            disabled={busy}
          >
            {busy ? <RefreshCw size={18} /> : <Play size={18} fill="currentColor" />}
            {busy ? '正在处理' : '运行回测'}
          </button>
        </div>
      </header>

      <section className="strategy-data-console" aria-label="回测数据设置">
        <div className="strategy-data-title">
          <span><Database size={17} /> DATASET</span>
          <strong>{dataConfig.mode === 'real' ? '真实日线行情' : '确定性演示行情'}</strong>
          <small className={realReady ? 'is-ready' : 'is-missing'}>
            {realReady ? 'Twelve Data 已连接' : '真实数据密钥未配置'}
          </small>
        </div>
        <div className="strategy-mode-switch" aria-label="数据模式">
          <button
            type="button"
            className={dataConfig.mode === 'demo' ? 'is-active' : ''}
            onClick={() => updateData('mode', 'demo')}
          >
            演示
          </button>
          <button
            type="button"
            className={dataConfig.mode === 'real' ? 'is-active' : ''}
            onClick={() => updateData('mode', 'real')}
            disabled={!realReady}
            title={realReady ? '使用真实行情' : '服务器需要配置 Twelve Data API Key'}
          >
            真实
          </button>
        </div>
        <label className="strategy-date-field">
          <span><CalendarDays size={14} /> 起始日期</span>
          <input
            type="date"
            value={dataConfig.startDate}
            disabled={dataConfig.mode === 'demo'}
            onChange={(event) => updateData('startDate', event.target.value)}
          />
        </label>
        <label className="strategy-date-field">
          <span><CalendarDays size={14} /> 结束日期</span>
          <input
            type="date"
            value={dataConfig.endDate}
            disabled={dataConfig.mode === 'demo'}
            onChange={(event) => updateData('endDate', event.target.value)}
          />
        </label>
        <label className="strategy-refresh-toggle">
          <input
            type="checkbox"
            checked={dataConfig.refresh}
            disabled={dataConfig.mode === 'demo'}
            onChange={(event) => updateData('refresh', event.target.checked)}
          />
          <span>运行前刷新</span>
        </label>
      </section>

      {history.length > 0 && (
        <section className="strategy-history-strip" aria-label="最近回测">
          <div className="strategy-history-label">
            <History size={17} />
            <span>RECENT RUNS</span>
          </div>
          <div className="strategy-history-list">
            {history.slice(0, 4).map((run) => (
              <article key={run.runId}>
                <div>
                  <strong>{run.symbol}</strong>
                  <span>{run.asOf}</span>
                </div>
                <b className={run.totalReturn >= 0 ? 'positive' : 'negative'}>
                  {formatPercent(run.totalReturn)}
                </b>
                <small>{run.barCount} bars / {run.tradeCount} trades</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {errorMessage && (
        <div className="strategy-error-banner" role="alert">
          <CircleAlert size={18} />
          <span>{errorMessage}</span>
          <small>{dataConfig.mode === 'real' ? '检查数据源配置与日期范围' : '检查后端服务状态'}</small>
        </div>
      )}

      <div className="strategy-workbench">
        <aside className="strategy-builder">
          <section className="strategy-builder-section">
            <div className="strategy-section-heading">
              <span>01</span>
              <div>
                <h2>选择策略骨架</h2>
                <p>模板提供起点，自然语言决定本次编译结果。</p>
              </div>
            </div>
            <div className="strategy-template-switcher">
              {templates.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.kind}
                    type="button"
                    className={definition.kind === template.kind ? 'is-active' : ''}
                    onClick={() => void applyTemplate(template.kind)}
                    disabled={busy}
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
                <p>例如“跌到 EMA5 买入，收盘跌破卖出”。</p>
              </div>
            </div>
            <textarea
              className="strategy-prompt"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setPromptDirty(true);
                setStatus('ready');
              }}
              aria-label="口述策略"
            />
            <button
              type="button"
              className="strategy-compile-button"
              onClick={() => void handleCompile()}
              disabled={busy || prompt.trim().length < 4}
            >
              <Sparkles size={18} />
              编译为结构化规则
              <ChevronRight size={18} />
            </button>
            {compilation && (
              <div className="strategy-compiler-meta">
                <span>{compilation.compiler}</span>
                <strong>{Math.round(compilation.confidence * 100)}% 解析置信度</strong>
              </div>
            )}
          </section>

          <section className="strategy-builder-section">
            <div className="strategy-section-heading">
              <span>03</span>
              <div>
                <h2>确认规则与成本</h2>
                <p>这里的参数会完整保存到运行记录。</p>
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

              {definition.kind === 'ema_pullback' && (
                <>
                  <NumericField label="EMA 周期" value={definition.emaPeriod} suffix="日" min={2} max={250} onChange={(value) => updateDefinition('emaPeriod', value)} />
                  <NumericField label="触线容差" value={definition.touchToleranceBps} suffix="bps" min={0} max={200} onChange={(value) => updateDefinition('touchToleranceBps', value)} />
                </>
              )}
              {definition.kind === 'ma_crossover' && (
                <>
                  <NumericField label="快速均线" value={definition.fastPeriod} suffix="日" min={2} max={120} onChange={(value) => updateDefinition('fastPeriod', value)} />
                  <NumericField label="慢速均线" value={definition.slowPeriod} suffix="日" min={5} max={250} onChange={(value) => updateDefinition('slowPeriod', value)} />
                </>
              )}
              {definition.kind === 'momentum_breakout' && (
                <NumericField label="突破窗口" value={definition.lookbackPeriod} suffix="日" min={5} max={120} onChange={(value) => updateDefinition('lookbackPeriod', value)} />
              )}
              {definition.kind === 'rsi_mean_reversion' && (
                <>
                  <NumericField label="RSI 周期" value={definition.rsiPeriod} suffix="日" min={5} max={40} onChange={(value) => updateDefinition('rsiPeriod', value)} />
                  <NumericField label="入场阈值" value={definition.rsiEntry} min={1} max={49} onChange={(value) => updateDefinition('rsiEntry', value)} />
                  <NumericField label="出场阈值" value={definition.rsiExit} min={50} max={99} onChange={(value) => updateDefinition('rsiExit', value)} />
                </>
              )}

              <NumericField label="保护止损" value={definition.stopLossPercent} suffix="%" min={0} max={50} step={0.5} onChange={(value) => updateDefinition('stopLossPercent', value)} />
              <NumericField label="资金使用" value={definition.allocationPercent} suffix="%" min={1} max={100} onChange={(value) => updateDefinition('allocationPercent', value)} />
              <NumericField label="初始资金" value={config.initialCapital} suffix="USD" min={1_000} step={1_000} onChange={(value) => { setConfig((current) => ({ ...current, initialCapital: value })); setStatus('ready'); }} />
              <NumericField label="手续费" value={config.commissionBps} suffix="bps" min={0} max={1_000} onChange={(value) => { setConfig((current) => ({ ...current, commissionBps: value })); setStatus('ready'); }} />
              <NumericField label="滑点" value={config.slippageBps} suffix="bps" min={0} max={1_000} onChange={(value) => { setConfig((current) => ({ ...current, slippageBps: value })); setStatus('ready'); }} />
            </div>
          </section>
        </aside>

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
              <span>运行后将在这里显示净值曲线、指标、审计和交易明细。</span>
            </div>
          ) : (
            <>
              <section className="strategy-result-hero">
                <div>
                  <span className="strategy-eyebrow">BACKTEST OUTPUT</span>
                  <h2>{definition.name}</h2>
                  <p>{result.engine} / {result.dataSource}</p>
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
                      <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={42} tick={{ fill: '#76818a', fontSize: 12 }} />
                      <YAxis tickLine={false} axisLine={false} width={70} domain={['auto', 'auto']} tickFormatter={(value) => formatCurrency(Number(value), true)} tick={{ fill: '#76818a', fontSize: 12 }} />
                      <Tooltip content={<EquityTooltip />} />
                      <Line type="monotone" dataKey="strategy" name="Strategy" stroke="#4d8dff" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#69737c" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
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
                <span>策略、数据口径、运行指标和逐笔交易已保存到服务端，可用于复盘与后续样本外验证。</span>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default StrategyLabPage;
