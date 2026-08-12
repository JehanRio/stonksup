export type StrategyKind =
  | 'ema_pullback'
  | 'ma_crossover'
  | 'momentum_breakout'
  | 'rsi_mean_reversion';

export type PriceAdjustment = 'all' | 'splits' | 'dividends' | 'none';

export type StrategySpec = {
  name: string;
  symbol: string;
  kind: StrategyKind;
  timeframe: '1d';
  emaPeriod: number;
  entryEmaPeriod: number;
  exitEmaPeriod: number;
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
  riskFreeRatePercent: number;
};

export type BacktestDataConfig = {
  mode: 'demo' | 'real';
  provider: 'twelvedata';
  adjustment: PriceAdjustment;
  benchmarkSymbol: string;
  startDate: string;
  endDate: string;
  refresh: boolean;
};

export type MarketDataCapability = {
  provider: 'twelvedata';
  configured: boolean;
  intervals: string[];
  adjustments: PriceAdjustment[];
  maximumPointsPerRequest: number;
  storage: 'postgresql' | 'sqlite' | 'unconfigured';
  message: string;
};

export type BacktestRunSummary = {
  runId: string;
  createdAt: string;
  symbol: string;
  strategyName: string;
  strategyKind: string;
  status: string;
  dataSource: string;
  benchmarkSymbol: string;
  adjustment: string;
  barCount: number;
  tradeCount: number;
  totalReturn: number;
  excessReturn: number;
  finalEquity: number;
  asOf: string;
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
  asset: number;
  benchmark: number | null;
  drawdown: number;
};

export type DataQualityReport = {
  status: 'pass' | 'warn' | 'fail';
  adjustment: PriceAdjustment;
  requestedStart: string;
  requestedEnd: string;
  actualStart: string;
  actualEnd: string;
  benchmarkStart: string;
  benchmarkEnd: string;
  coverageRatio: number;
  benchmarkCoverageRatio: number;
  staleTradingDays: number;
  strategyBars: number;
  benchmarkBars: number;
  alignedBars: number;
  strategyHash: string;
  benchmarkHash: string;
  checks: string[];
};

export type BacktestResult = {
  runId: string;
  symbol: string;
  strategyName: string;
  bars: number;
  asOf: string;
  dataSource: string;
  benchmarkSource: string;
  benchmarkSymbol: string;
  adjustment: PriceAdjustment;
  engine: string;
  contractVersion: string;
  initialCapital: number;
  finalEquity: number;
  totalReturn: number;
  annualizedReturn: number;
  assetReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  relativeReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  annualizedVolatility: number;
  alpha: number;
  beta: number;
  winRate: number;
  profitFactor: number;
  averageHoldingDays: number;
  totalCommission: number;
  tradeCount: number;
  equityCurve: EquityPoint[];
  trades: BacktestTrade[];
  assumptions: string[];
  audit: string[];
  dataQuality: DataQualityReport;
};

type ApiEnvelope<Data> = {
  success: boolean;
  data: Data | null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null;
};

type ApiStrategySpec = {
  name: string;
  symbol: string;
  kind: StrategyKind;
  timeframe: '1d';
  ema_period: number;
  entry_ema_period: number;
  exit_ema_period: number;
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

type ApiDataQuality = {
  status: 'pass' | 'warn' | 'fail';
  adjustment: PriceAdjustment;
  requested_start: string;
  requested_end: string;
  actual_start: string;
  actual_end: string;
  benchmark_start: string;
  benchmark_end: string;
  coverage_ratio: number;
  benchmark_coverage_ratio: number;
  stale_trading_days: number;
  strategy_bars: number;
  benchmark_bars: number;
  aligned_bars: number;
  strategy_hash: string;
  benchmark_hash: string;
  checks: string[];
};

type ApiBacktestResult = {
  run_id: string;
  symbol: string;
  strategy_name: string;
  bars: number;
  as_of: string;
  data_source: string;
  benchmark_source: string;
  benchmark_symbol: string;
  adjustment: PriceAdjustment;
  engine: string;
  contract_version: string;
  initial_capital: number;
  final_equity: number;
  total_return: number;
  annualized_return: number;
  asset_return: number;
  benchmark_return: number;
  excess_return: number;
  relative_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  annualized_volatility: number;
  alpha: number;
  beta: number;
  win_rate: number;
  profit_factor: number;
  average_holding_days: number;
  total_commission: number;
  trade_count: number;
  equity_curve: Array<{
    date: string;
    strategy: number;
    benchmark: number;
    drawdown: number;
  }>;
  benchmark_curve: Array<{ date: string; value: number }>;
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
  data_quality: ApiDataQuality;
};

type ApiMarketDataCapability = {
  provider: 'twelvedata';
  configured: boolean;
  intervals: string[];
  adjustments: PriceAdjustment[];
  maximum_points_per_request: number;
  storage: 'postgresql' | 'sqlite' | 'unconfigured';
  message: string;
};

type ApiBacktestRunSummary = {
  run_id: string;
  created_at: string;
  symbol: string;
  strategy_name: string;
  strategy_kind: string;
  status: string;
  data_source: string;
  benchmark_symbol: string;
  adjustment: string;
  bar_count: number;
  trade_count: number;
  total_return: number;
  excess_return: number;
  final_equity: number;
  as_of: string;
};

const apiRequest = async <Data>(
  path: string,
  options: RequestInit = {},
): Promise<Data> => {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const payload = (await response.json()) as ApiEnvelope<Data>;
  if (!response.ok || !payload.success || !payload.data) {
    const details = payload.error?.details;
    const coverage = details?.actual_start && details?.actual_end
      ? ` 实际数据：${details.actual_start} 至 ${details.actual_end}。`
      : '';
    throw new Error(
      `${payload.error?.message || `Request failed with status ${response.status}`}${coverage}`,
    );
  }
  return payload.data;
};

const post = <Data>(path: string, body: unknown) =>
  apiRequest<Data>(path, { method: 'POST', body: JSON.stringify(body) });

const mapStrategy = (strategy: ApiStrategySpec): StrategySpec => ({
  name: strategy.name,
  symbol: strategy.symbol,
  kind: strategy.kind,
  timeframe: strategy.timeframe,
  emaPeriod: strategy.ema_period,
  entryEmaPeriod: strategy.entry_ema_period,
  exitEmaPeriod: strategy.exit_ema_period,
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
  entry_ema_period: strategy.entryEmaPeriod,
  exit_ema_period: strategy.exitEmaPeriod,
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

const serializeData = (data: BacktestDataConfig) => ({
  mode: data.mode,
  provider: data.provider,
  adjustment: data.adjustment,
  benchmark_symbol: data.benchmarkSymbol,
  start_date: data.startDate,
  end_date: data.endDate,
  refresh: data.refresh,
});

const serializeConfig = (config: BacktestConfig) => ({
  initial_capital: config.initialCapital,
  commission_bps: config.commissionBps,
  slippage_bps: config.slippageBps,
  risk_free_rate_percent: config.riskFreeRatePercent,
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

const mapDataQuality = (quality: ApiDataQuality): DataQualityReport => ({
  status: quality.status,
  adjustment: quality.adjustment,
  requestedStart: quality.requested_start,
  requestedEnd: quality.requested_end,
  actualStart: quality.actual_start,
  actualEnd: quality.actual_end,
  benchmarkStart: quality.benchmark_start,
  benchmarkEnd: quality.benchmark_end,
  coverageRatio: quality.coverage_ratio,
  benchmarkCoverageRatio: quality.benchmark_coverage_ratio,
  staleTradingDays: quality.stale_trading_days,
  strategyBars: quality.strategy_bars,
  benchmarkBars: quality.benchmark_bars,
  alignedBars: quality.aligned_bars,
  strategyHash: quality.strategy_hash,
  benchmarkHash: quality.benchmark_hash,
  checks: quality.checks,
});

const mapBacktest = (result: ApiBacktestResult): BacktestResult => {
  const benchmarkByDate = new Map(
    result.benchmark_curve.map((point) => [point.date, point.value]),
  );
  return {
    runId: result.run_id,
    symbol: result.symbol,
    strategyName: result.strategy_name,
    bars: result.bars,
    asOf: result.as_of,
    dataSource: result.data_source,
    benchmarkSource: result.benchmark_source,
    benchmarkSymbol: result.benchmark_symbol,
    adjustment: result.adjustment,
    engine: result.engine,
    contractVersion: result.contract_version,
    initialCapital: result.initial_capital,
    finalEquity: result.final_equity,
    totalReturn: result.total_return,
    annualizedReturn: result.annualized_return,
    assetReturn: result.asset_return,
    benchmarkReturn: result.benchmark_return,
    excessReturn: result.excess_return,
    relativeReturn: result.relative_return,
    maxDrawdown: result.max_drawdown,
    sharpeRatio: result.sharpe_ratio,
    sortinoRatio: result.sortino_ratio,
    calmarRatio: result.calmar_ratio,
    annualizedVolatility: result.annualized_volatility,
    alpha: result.alpha,
    beta: result.beta,
    winRate: result.win_rate,
    profitFactor: result.profit_factor,
    averageHoldingDays: result.average_holding_days,
    totalCommission: result.total_commission,
    tradeCount: result.trade_count,
    equityCurve: result.equity_curve.map((point) => ({
      date: point.date,
      strategy: point.strategy,
      asset: point.benchmark,
      benchmark: benchmarkByDate.get(point.date) ?? null,
      drawdown: point.drawdown,
    })),
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
    dataQuality: mapDataQuality(result.data_quality),
  };
};

export const compileStrategy = async (
  prompt: string,
  preferredKind?: StrategyKind,
): Promise<StrategyCompilation> => {
  const result = await post<ApiCompilation>('/api/v1/backtests/compile', {
    prompt,
    preferred_kind: preferredKind,
  });
  return mapCompilation(result);
};

export const getMarketDataCapabilities = async (): Promise<MarketDataCapability> => {
  const result = await apiRequest<ApiMarketDataCapability>(
    '/api/v1/market-data/capabilities',
  );
  return {
    provider: result.provider,
    configured: result.configured,
    intervals: result.intervals,
    adjustments: result.adjustments,
    maximumPointsPerRequest: result.maximum_points_per_request,
    storage: result.storage,
    message: result.message,
  };
};

export const getBacktestRunHistory = async (
  limit = 8,
): Promise<BacktestRunSummary[]> => {
  const result = await apiRequest<{ runs: ApiBacktestRunSummary[] }>(
    `/api/v1/backtests/runs?limit=${limit}`,
  );
  return result.runs.map((run) => ({
    runId: run.run_id,
    createdAt: run.created_at,
    symbol: run.symbol,
    strategyName: run.strategy_name,
    strategyKind: run.strategy_kind,
    status: run.status,
    dataSource: run.data_source,
    benchmarkSymbol: run.benchmark_symbol,
    adjustment: run.adjustment,
    barCount: run.bar_count,
    tradeCount: run.trade_count,
    totalReturn: run.total_return,
    excessReturn: run.excess_return,
    finalEquity: run.final_equity,
    asOf: run.as_of,
  }));
};

export const runStrategy = async (
  strategy: StrategySpec,
  config: BacktestConfig,
  data: BacktestDataConfig,
  bars = 756,
): Promise<BacktestResult> => {
  const result = await post<ApiBacktestResult>('/api/v1/backtests/run', {
    strategy: serializeStrategy(strategy),
    config: serializeConfig(config),
    data: serializeData(data),
    bars,
  });
  return mapBacktest(result);
};

export const compileAndRunStrategy = async (
  prompt: string,
  config: BacktestConfig,
  data: BacktestDataConfig,
  bars = 756,
): Promise<{ compilation: StrategyCompilation; backtest: BacktestResult }> => {
  const result = await post<{
    compilation: ApiCompilation;
    backtest: ApiBacktestResult;
  }>('/api/v1/backtests/compile-and-run', {
    prompt,
    config: serializeConfig(config),
    data: serializeData(data),
    bars,
  });
  return {
    compilation: mapCompilation(result.compilation),
    backtest: mapBacktest(result.backtest),
  };
};
