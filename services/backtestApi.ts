export type StrategyKind =
  | 'ema_pullback'
  | 'ma_crossover'
  | 'momentum_breakout'
  | 'rsi_mean_reversion';

export type StrategySpec = {
  name: string;
  symbol: string;
  kind: StrategyKind;
  timeframe: '1d';
  emaPeriod: number;
  fastPeriod: number;
  slowPeriod: number;
  lookbackPeriod: number;
  rsiPeriod: number;
  rsiEntry: number;
  rsiExit: number;
  touchToleranceBps: number;
  stopLossPercent: number;
  allocationPercent: number;
  signalAt: 'close';
  fillAt: 'next_open';
  longOnly: true;
};

export type StrategyCompilation = {
  prompt: string;
  strategy: StrategySpec;
  interpretation: string[];
  assumptions: string[];
  warnings: string[];
  confidence: number;
  contractVersion: string;
  compiler: string;
};

export type BacktestConfig = {
  initialCapital: number;
  commissionBps: number;
  slippageBps: number;
};

export type BacktestTrade = {
  id: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  returnPercent: number;
  exitReason: string;
};

export type EquityPoint = {
  date: string;
  strategy: number;
  benchmark: number;
  drawdown: number;
};

export type BacktestResult = {
  runId: string;
  symbol: string;
  strategyName: string;
  bars: number;
  asOf: string;
  dataSource: string;
  engine: string;
  contractVersion: string;
  initialCapital: number;
  finalEquity: number;
  totalReturn: number;
  annualizedReturn: number;
  benchmarkReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  profitFactor: number;
  tradeCount: number;
  equityCurve: EquityPoint[];
  trades: BacktestTrade[];
  assumptions: string[];
  audit: string[];
};

type ApiEnvelope<Data> = {
  success: boolean;
  data: Data | null;
  error: { code: string; message: string } | null;
};

type ApiStrategySpec = {
  name: string;
  symbol: string;
  kind: StrategyKind;
  timeframe: '1d';
  ema_period: number;
  fast_period: number;
  slow_period: number;
  lookback_period: number;
  rsi_period: number;
  rsi_entry: number;
  rsi_exit: number;
  touch_tolerance_bps: number;
  stop_loss_percent: number;
  allocation_percent: number;
  signal_at: 'close';
  fill_at: 'next_open';
  long_only: true;
};

type ApiCompilation = {
  prompt: string;
  strategy: ApiStrategySpec;
  interpretation: string[];
  assumptions: string[];
  warnings: string[];
  confidence: number;
  contract_version: string;
  compiler: string;
};

type ApiBacktestResult = {
  run_id: string;
  symbol: string;
  strategy_name: string;
  bars: number;
  as_of: string;
  data_source: string;
  engine: string;
  contract_version: string;
  initial_capital: number;
  final_equity: number;
  total_return: number;
  annualized_return: number;
  benchmark_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  win_rate: number;
  profit_factor: number;
  trade_count: number;
  equity_curve: Array<{
    date: string;
    strategy: number;
    benchmark: number;
    drawdown: number;
  }>;
  trades: Array<{
    id: string;
    entry_date: string;
    exit_date: string;
    entry_price: number;
    exit_price: number;
    quantity: number;
    pnl: number;
    return_percent: number;
    exit_reason: string;
  }>;
  assumptions: string[];
  audit: string[];
};

const apiRequest = async <Data>(path: string, body: unknown): Promise<Data> => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiEnvelope<Data>;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || `Request failed with status ${response.status}`);
  }
  return payload.data;
};

const mapStrategy = (strategy: ApiStrategySpec): StrategySpec => ({
  name: strategy.name,
  symbol: strategy.symbol,
  kind: strategy.kind,
  timeframe: strategy.timeframe,
  emaPeriod: strategy.ema_period,
  fastPeriod: strategy.fast_period,
  slowPeriod: strategy.slow_period,
  lookbackPeriod: strategy.lookback_period,
  rsiPeriod: strategy.rsi_period,
  rsiEntry: strategy.rsi_entry,
  rsiExit: strategy.rsi_exit,
  touchToleranceBps: strategy.touch_tolerance_bps,
  stopLossPercent: strategy.stop_loss_percent,
  allocationPercent: strategy.allocation_percent,
  signalAt: strategy.signal_at,
  fillAt: strategy.fill_at,
  longOnly: strategy.long_only,
});

const serializeStrategy = (strategy: StrategySpec): ApiStrategySpec => ({
  name: strategy.name,
  symbol: strategy.symbol,
  kind: strategy.kind,
  timeframe: strategy.timeframe,
  ema_period: strategy.emaPeriod,
  fast_period: strategy.fastPeriod,
  slow_period: strategy.slowPeriod,
  lookback_period: strategy.lookbackPeriod,
  rsi_period: strategy.rsiPeriod,
  rsi_entry: strategy.rsiEntry,
  rsi_exit: strategy.rsiExit,
  touch_tolerance_bps: strategy.touchToleranceBps,
  stop_loss_percent: strategy.stopLossPercent,
  allocation_percent: strategy.allocationPercent,
  signal_at: strategy.signalAt,
  fill_at: strategy.fillAt,
  long_only: strategy.longOnly,
});

const mapCompilation = (compilation: ApiCompilation): StrategyCompilation => ({
  prompt: compilation.prompt,
  strategy: mapStrategy(compilation.strategy),
  interpretation: compilation.interpretation,
  assumptions: compilation.assumptions,
  warnings: compilation.warnings,
  confidence: compilation.confidence,
  contractVersion: compilation.contract_version,
  compiler: compilation.compiler,
});

const mapBacktest = (result: ApiBacktestResult): BacktestResult => ({
  runId: result.run_id,
  symbol: result.symbol,
  strategyName: result.strategy_name,
  bars: result.bars,
  asOf: result.as_of,
  dataSource: result.data_source,
  engine: result.engine,
  contractVersion: result.contract_version,
  initialCapital: result.initial_capital,
  finalEquity: result.final_equity,
  totalReturn: result.total_return,
  annualizedReturn: result.annualized_return,
  benchmarkReturn: result.benchmark_return,
  maxDrawdown: result.max_drawdown,
  sharpeRatio: result.sharpe_ratio,
  winRate: result.win_rate,
  profitFactor: result.profit_factor,
  tradeCount: result.trade_count,
  equityCurve: result.equity_curve,
  trades: result.trades.map((trade) => ({
    id: trade.id,
    entryDate: trade.entry_date,
    exitDate: trade.exit_date,
    entryPrice: trade.entry_price,
    exitPrice: trade.exit_price,
    quantity: trade.quantity,
    pnl: trade.pnl,
    returnPercent: trade.return_percent,
    exitReason: trade.exit_reason,
  })),
  assumptions: result.assumptions,
  audit: result.audit,
});

export const compileStrategy = async (
  prompt: string,
  preferredKind?: StrategyKind,
): Promise<StrategyCompilation> => {
  const result = await apiRequest<ApiCompilation>('/api/v1/backtests/compile', {
    prompt,
    preferred_kind: preferredKind,
  });
  return mapCompilation(result);
};

export const runStrategy = async (
  strategy: StrategySpec,
  config: BacktestConfig,
  bars = 756,
): Promise<BacktestResult> => {
  const result = await apiRequest<ApiBacktestResult>('/api/v1/backtests/run', {
    strategy: serializeStrategy(strategy),
    config: {
      initial_capital: config.initialCapital,
      commission_bps: config.commissionBps,
      slippage_bps: config.slippageBps,
    },
    bars,
  });
  return mapBacktest(result);
};

export const compileAndRunStrategy = async (
  prompt: string,
  config: BacktestConfig,
  bars = 756,
): Promise<{ compilation: StrategyCompilation; backtest: BacktestResult }> => {
  const result = await apiRequest<{
    compilation: ApiCompilation;
    backtest: ApiBacktestResult;
  }>('/api/v1/backtests/compile-and-run', {
    prompt,
    config: {
      initial_capital: config.initialCapital,
      commission_bps: config.commissionBps,
      slippage_bps: config.slippageBps,
    },
    bars,
  });
  return {
    compilation: mapCompilation(result.compilation),
    backtest: mapBacktest(result.backtest),
  };
};
