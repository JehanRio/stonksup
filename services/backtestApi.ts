export type StrategyKind =
  | 'ema_pullback'
  | 'ma_crossover'
  | 'momentum_breakout'
  | 'rsi_mean_reversion'
  | 'custom_ir';

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

export type StrategyIrOperand = {
  source: 'field' | 'indicator' | 'constant';
  key: string | null;
  value: number | null;
  offset: -1 | 0;
  multiplier: number;
};

export type StrategyIrCondition = {
  left: StrategyIrOperand;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'crosses_above' | 'crosses_below';
  right: StrategyIrOperand;
  toleranceBps: number;
  sourceText: string | null;
};

export type StrategyIrRule = {
  reason: string;
  when: {
    mode: 'all' | 'any';
    conditions: StrategyIrCondition[];
  };
};

export type StrategyIR = {
  version: 'strategy-ir.v1';
  name: string;
  symbol: string;
  timeframe: '1d';
  template:
    | 'ema_pullback'
    | 'ma_crossover'
    | 'momentum_breakout'
    | 'rsi_mean_reversion'
    | 'custom';
  indicators: Array<{
    id: string;
    kind: 'ema' | 'sma' | 'rsi' | 'rolling_max';
    source: 'open' | 'high' | 'low' | 'close' | 'volume';
    period: number;
  }>;
  searchParameters: Array<{
    id: string;
    label: string;
    target: 'indicator_period';
    indicatorId: string;
  }>;
  entry: StrategyIrRule;
  exit: StrategyIrRule;
  sizing: {
    mode: 'target_cash_fraction';
    value: number;
  };
  risk: {
    stopLossPercent: number;
  };
  execution: {
    signalAt: 'close';
    fillAt: 'next_open';
    direction: 'long_only';
    maxPositions: 1;
  };
};

export type StrategyManifest = {
  version: 'strategy-manifest.v1';
  irHash: string;
  symbol: string;
  timeframe: '1d';
  requiredFields: string[];
  indicatorIds: string[];
  warmupBars: number;
  maxLookback: number;
  signalAt: 'close';
  fillAt: 'next_open';
  direction: 'long_only';
  lookaheadSafe: true;
};

export type StrategyCompilation = {
  prompt: string;
  strategy: StrategySpec;
  status: 'ready' | 'needs_clarification' | 'unsupported';
  executable: boolean;
  interpretation: string[];
  assumptions: string[];
  warnings: string[];
  issues: Array<{
    code: string;
    severity: 'clarification' | 'unsupported';
    message: string;
    fragment: string | null;
  }>;
  normalizedPrompt: string;
  confidence: number;
  contractVersion: string;
  compiler: string;
  strategyIr: StrategyIR;
  manifest: StrategyManifest;
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

type ApiStrategyIrRule = {
  reason: string;
  when: {
    mode: 'all' | 'any';
    conditions: Array<{
      left: StrategyIrOperand;
      operator: StrategyIrCondition['operator'];
      right: StrategyIrOperand;
      tolerance_bps: number;
      source_text: string | null;
    }>;
  };
};

type ApiStrategyIR = {
  version: 'strategy-ir.v1';
  name: string;
  symbol: string;
  timeframe: '1d';
  template: StrategyIR['template'];
  indicators: StrategyIR['indicators'];
  search_parameters: Array<{
    id: string;
    label: string;
    target: 'indicator_period';
    indicator_id: string;
  }>;
  entry: ApiStrategyIrRule;
  exit: ApiStrategyIrRule;
  sizing: StrategyIR['sizing'];
  risk: { stop_loss_percent: number };
  execution: {
    signal_at: 'close';
    fill_at: 'next_open';
    direction: 'long_only';
    max_positions: 1;
  };
};

type ApiCompilation = {
  prompt: string;
  strategy: ApiStrategySpec;
  status: 'ready' | 'needs_clarification' | 'unsupported';
  executable: boolean;
  interpretation: string[];
  assumptions: string[];
  warnings: string[];
  issues: Array<{
    code: string;
    severity: 'clarification' | 'unsupported';
    message: string;
    fragment: string | null;
  }>;
  normalized_prompt: string;
  confidence: number;
  contract_version: string;
  compiler: string;
  strategy_ir: ApiStrategyIR;
  manifest: {
    version: 'strategy-manifest.v1';
    ir_hash: string;
    symbol: string;
    timeframe: '1d';
    required_fields: string[];
    indicator_ids: string[];
    warmup_bars: number;
    max_lookback: number;
    signal_at: 'close';
    fill_at: 'next_open';
    direction: 'long_only';
    lookahead_safe: true;
  };
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

export const serializeStrategyIr = (strategyIr: StrategyIR): ApiStrategyIR => {
  const serializeRule = (rule: StrategyIrRule): ApiStrategyIrRule => ({
    reason: rule.reason,
    when: {
      mode: rule.when.mode,
      conditions: rule.when.conditions.map((condition) => ({
        left: condition.left,
        operator: condition.operator,
        right: condition.right,
        tolerance_bps: condition.toleranceBps,
        source_text: condition.sourceText,
      })),
    },
  });
  return {
    version: strategyIr.version,
    name: strategyIr.name,
    symbol: strategyIr.symbol,
    timeframe: strategyIr.timeframe,
    template: strategyIr.template,
    indicators: strategyIr.indicators,
    search_parameters: strategyIr.searchParameters.map((parameter) => ({
      id: parameter.id,
      label: parameter.label,
      target: parameter.target,
      indicator_id: parameter.indicatorId,
    })),
    entry: serializeRule(strategyIr.entry),
    exit: serializeRule(strategyIr.exit),
    sizing: strategyIr.sizing,
    risk: { stop_loss_percent: strategyIr.risk.stopLossPercent },
    execution: {
      signal_at: strategyIr.execution.signalAt,
      fill_at: strategyIr.execution.fillAt,
      direction: strategyIr.execution.direction,
      max_positions: strategyIr.execution.maxPositions,
    },
  };
};

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
  status: compilation.status,
  executable: compilation.executable,
  interpretation: compilation.interpretation,
  assumptions: compilation.assumptions,
  warnings: compilation.warnings,
  issues: compilation.issues,
  normalizedPrompt: compilation.normalized_prompt,
  confidence: compilation.confidence,
  contractVersion: compilation.contract_version,
  compiler: compilation.compiler,
  strategyIr: {
    ...compilation.strategy_ir,
    searchParameters: compilation.strategy_ir.search_parameters.map((parameter) => ({
      id: parameter.id,
      label: parameter.label,
      target: parameter.target,
      indicatorId: parameter.indicator_id,
    })),
    entry: {
      ...compilation.strategy_ir.entry,
      when: {
        ...compilation.strategy_ir.entry.when,
        conditions: compilation.strategy_ir.entry.when.conditions.map((condition) => ({
          ...condition,
          toleranceBps: condition.tolerance_bps,
          sourceText: condition.source_text,
        })),
      },
    },
    exit: {
      ...compilation.strategy_ir.exit,
      when: {
        ...compilation.strategy_ir.exit.when,
        conditions: compilation.strategy_ir.exit.when.conditions.map((condition) => ({
          ...condition,
          toleranceBps: condition.tolerance_bps,
          sourceText: condition.source_text,
        })),
      },
    },
    risk: {
      stopLossPercent: compilation.strategy_ir.risk.stop_loss_percent,
    },
    execution: {
      signalAt: compilation.strategy_ir.execution.signal_at,
      fillAt: compilation.strategy_ir.execution.fill_at,
      direction: compilation.strategy_ir.execution.direction,
      maxPositions: compilation.strategy_ir.execution.max_positions,
    },
  },
  manifest: {
    version: compilation.manifest.version,
    irHash: compilation.manifest.ir_hash,
    symbol: compilation.manifest.symbol,
    timeframe: compilation.manifest.timeframe,
    requiredFields: compilation.manifest.required_fields,
    indicatorIds: compilation.manifest.indicator_ids,
    warmupBars: compilation.manifest.warmup_bars,
    maxLookback: compilation.manifest.max_lookback,
    signalAt: compilation.manifest.signal_at,
    fillAt: compilation.manifest.fill_at,
    direction: compilation.manifest.direction,
    lookaheadSafe: compilation.manifest.lookahead_safe,
  },
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

export const compileStrategyWithAi = async (
  prompt: string,
): Promise<StrategyCompilation> => {
  const result = await post<ApiCompilation>('/api/v1/backtests/compile-ai', {
    prompt,
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
  strategyIr?: StrategyIR,
  bars = 756,
): Promise<BacktestResult> => {
  const result = await post<ApiBacktestResult>('/api/v1/backtests/run', {
    strategy: serializeStrategy(strategy),
    strategy_ir: strategyIr ? serializeStrategyIr(strategyIr) : null,
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
