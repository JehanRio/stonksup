import React, { useEffect, useState } from 'react';
import {
  Activity,
  ChevronRight,
  CircleAlert,
  Database,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';

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
import StrategyDataConsole from './components/StrategyDataConsole';
import StrategyResultPanel from './components/StrategyResultPanel';
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
  riskFreeRatePercent: 0,
};

const DEFAULT_DATA: BacktestDataConfig = {
  mode: 'demo',
  provider: 'twelvedata',
  adjustment: 'all',
  benchmarkSymbol: 'SPY',
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

const contractName = (strategy: StrategySpec) => {
  if (strategy.kind === 'ema_pullback') {
    return `${strategy.symbol} EMA${strategy.emaPeriod} 回踩`;
  }
  if (strategy.kind === 'ma_crossover') {
    return `${strategy.symbol} MA${strategy.fastPeriod}/${strategy.slowPeriod} 交叉`;
  }
  if (strategy.kind === 'momentum_breakout') {
    return `${strategy.symbol} ${strategy.lookbackPeriod} 日突破`;
  }
  return `${strategy.symbol} RSI${strategy.rsiPeriod} 回归`;
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

  const invalidateResult = () => {
    setResult(null);
    setErrorMessage('');
    setStatus('ready');
  };

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const [capabilityResult, historyResult, compilationResult] =
        await Promise.allSettled([
          getMarketDataCapabilities(),
          getBacktestRunHistory(6),
          compileStrategy(INITIAL_PROMPT),
        ]);
      if (!active) return;
      if (capabilityResult.status === 'fulfilled') {
        setCapability(capabilityResult.value);
      }
      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value);
      }
      if (compilationResult.status === 'fulfilled') {
        setCompilation(compilationResult.value);
        setDefinition(compilationResult.value.strategy);
        setStatus('ready');
      } else {
        setStatus('error');
        setErrorMessage('无法连接策略编译服务');
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, []);

  const busy = status === 'loading' || status === 'running';

  const updateDefinition = <Key extends keyof StrategySpec>(
    key: Key,
    value: StrategySpec[Key],
  ) => {
    setDefinition((current) => {
      const next = { ...current, [key]: value };
      if (key === 'symbol') {
        const previousSymbol = current.symbol.toUpperCase();
        const nextSymbol = String(value).toUpperCase();
        setDataConfig((data) => ({
          ...data,
          benchmarkSymbol: data.benchmarkSymbol === previousSymbol
            ? nextSymbol
            : data.benchmarkSymbol,
        }));
      }
      return { ...next, name: contractName(next) };
    });
    setCompilation(null);
    setPromptDirty(false);
    invalidateResult();
  };

  const updateData = <Key extends keyof BacktestDataConfig>(
    key: Key,
    value: BacktestDataConfig[Key],
  ) => {
    setDataConfig((current) => ({ ...current, [key]: value }));
    invalidateResult();
  };

  const updateConfig = <Key extends keyof BacktestConfig>(
    key: Key,
    value: BacktestConfig[Key],
  ) => {
    setConfig((current) => ({ ...current, [key]: value }));
    invalidateResult();
  };

  const applyTemplate = async (kind: StrategyKind) => {
    const template = templates.find((item) => item.kind === kind);
    if (!template) return;
    setPrompt(template.prompt);
    setResult(null);
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
    setResult(null);
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
    const runData = dataConfig;
    setResult(null);
    setStatus('running');
    setErrorMessage('');
    try {
      if (promptDirty) {
        const response = await compileAndRunStrategy(prompt, config, runData);
        setCompilation(response.compilation);
        setDefinition(response.compilation.strategy);
        setResult(response.backtest);
        setPromptDirty(false);
      } else {
        setResult(await runStrategy(definition, config, runData));
      }
      setStatus('complete');
      await refreshHistory();
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '回测运行失败');
    } finally {
      if (runData.refresh) {
        setDataConfig((current) => ({ ...current, refresh: false }));
      }
    }
  };

  return (
    <div className="strategy-lab-page">
      <header className="strategy-lab-header">
        <div>
          <span className="strategy-eyebrow">STRATEGY / RELATIVE BACKTEST</span>
          <h1>策略实验室</h1>
          <p>使用完整复权区间、独立基准和可复现数据指纹，判断策略是否真正创造超额收益。</p>
        </div>
        <div className="strategy-header-actions">
          <span className={`strategy-data-badge ${dataConfig.mode === 'real' ? 'is-real' : ''}`}>
            <Database size={17} />
            {dataConfig.mode === 'real' ? 'ADJUSTED DATA' : 'DEMO DATA'}
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

      <StrategyDataConsole
        assetSymbol={definition.symbol}
        config={dataConfig}
        capability={capability}
        history={history}
        onChange={updateData}
      />

      {errorMessage && (
        <div className="strategy-error-banner" role="alert">
          <CircleAlert size={18} />
          <span>{errorMessage}</span>
          <small>{dataConfig.mode === 'real' ? '系统已阻止不完整行情进入回测' : '检查后端服务状态'}</small>
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
                setCompilation(null);
                invalidateResult();
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
            {compilation ? (
              <div className="strategy-compiler-meta">
                <span>{compilation.compiler}</span>
                <strong>{Math.round(compilation.confidence * 100)}% 解析置信度</strong>
              </div>
            ) : (
              <div className="strategy-compiler-meta is-edited">
                <span>MANUAL CONTRACT</span>
                <strong>当前参数将直接执行</strong>
              </div>
            )}
          </section>

          <section className="strategy-builder-section">
            <div className="strategy-section-heading">
              <span>03</span>
              <div>
                <h2>确认规则与成本</h2>
                <p>参数、成本和数据口径都会进入运行快照。</p>
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
              <NumericField label="初始资金" value={config.initialCapital} suffix="USD" min={1_000} step={1_000} onChange={(value) => updateConfig('initialCapital', value)} />
              <NumericField label="手续费" value={config.commissionBps} suffix="bps" min={0} max={1_000} onChange={(value) => updateConfig('commissionBps', value)} />
              <NumericField label="滑点" value={config.slippageBps} suffix="bps" min={0} max={1_000} onChange={(value) => updateConfig('slippageBps', value)} />
              <NumericField label="无风险利率" value={config.riskFreeRatePercent} suffix="%/年" min={-20} max={30} step={0.1} onChange={(value) => updateConfig('riskFreeRatePercent', value)} />
            </div>
          </section>
        </aside>

        <StrategyResultPanel
          status={status}
          result={result}
          definition={definition}
          compilation={compilation}
          riskFreeRatePercent={config.riskFreeRatePercent}
        />
      </div>
    </div>
  );
};


export default StrategyLabPage;
