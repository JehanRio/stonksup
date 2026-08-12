import type {
  BacktestConfig,
  BacktestDataConfig,
  DataQualityReport,
  PriceAdjustment,
  StrategySpec,
} from './backtestApi';


export type WalkForwardObjective = 'calmar' | 'sharpe' | 'annualized_return';

export type WalkForwardConfig = {
  trainBars: number;
  testBars: number;
  search: {
    periodMin: number;
    periodMax: number;
    periodStep: number;
    stopLossMin: number;
    stopLossMax: number;
    stopLossStep: number;
    minimumTrades: number;
    objective: WalkForwardObjective;
  };
};

export type ValidationMetrics = {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  calmarRatio: number;
  tradeCount: number;
  winRate: number;
};

export type WalkForwardAggregate = ValidationMetrics & {
  initialCapital: number;
  finalEquity: number;
  assetReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  relativeReturn: number;
  annualizedVolatility: number;
  parameterStability: number;
};

export type WalkForwardWindow = {
  sequence: number;
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  primaryParameter: string;
  selectedPeriod: number;
  selectedStopLoss: number;
  objectiveScore: number;
  robustScore: number;
  candidateCount: number;
  eligibleCount: number;
  usedFallback: boolean;
  train: ValidationMetrics;
  test: ValidationMetrics;
};

export type ParameterSurfacePoint = {
  period: number;
  stopLoss: number;
  meanScore: number;
  meanTrainReturn: number;
  eligibleRate: number;
  selectedCount: number;
};

export type WalkForwardCurvePoint = {
  date: string;
  strategy: number;
  asset: number;
  benchmark: number | null;
  drawdown: number;
  window: number;
};

export type WalkForwardResult = {
  experimentId: string;
  symbol: string;
  strategyName: string;
  strategyKind: string;
  engine: string;
  dataSource: string;
  benchmarkSymbol: string;
  adjustment: PriceAdjustment;
  objective: WalkForwardObjective;
  primaryParameter: string;
  trainBars: number;
  testBars: number;
  windowCount: number;
  candidateCount: number;
  overfittingRisk: 'low' | 'medium' | 'high';
  aggregate: WalkForwardAggregate;
  averageTrainScore: number;
  averageTestScore: number;
  windows: WalkForwardWindow[];
  parameterSurface: ParameterSurfacePoint[];
  equityCurve: WalkForwardCurvePoint[];
  warnings: string[];
  assumptions: string[];
  audit: string[];
  dataQuality: DataQualityReport;
};

type ApiEnvelope<Data> = {
  success: boolean;
  data: Data | null;
  error: { message: string } | null;
};

type ApiMetrics = {
  total_return: number;
  annualized_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  calmar_ratio: number;
  trade_count: number;
  win_rate: number;
};

type ApiWalkForwardResult = {
  experiment_id: string;
  symbol: string;
  strategy_name: string;
  strategy_kind: string;
  engine: string;
  data_source: string;
  benchmark_symbol: string;
  adjustment: PriceAdjustment;
  objective: WalkForwardObjective;
  primary_parameter: string;
  train_bars: number;
  test_bars: number;
  window_count: number;
  candidate_count: number;
  overfitting_risk: 'low' | 'medium' | 'high';
  aggregate: ApiMetrics & {
    initial_capital: number;
    final_equity: number;
    asset_return: number;
    benchmark_return: number;
    excess_return: number;
    relative_return: number;
    annualized_volatility: number;
    parameter_stability: number;
  };
  average_train_score: number;
  average_test_score: number;
  windows: Array<{
    sequence: number;
    train_start: string;
    train_end: string;
    test_start: string;
    test_end: string;
    primary_parameter: string;
    selected_period: number;
    selected_stop_loss: number;
    objective_score: number;
    robust_score: number;
    candidate_count: number;
    eligible_count: number;
    used_fallback: boolean;
    train: ApiMetrics;
    test: ApiMetrics;
  }>;
  parameter_surface: Array<{
    period: number;
    stop_loss: number;
    mean_score: number;
    mean_train_return: number;
    eligible_rate: number;
    selected_count: number;
  }>;
  equity_curve: Array<{
    date: string;
    strategy: number;
    asset: number;
    benchmark: number | null;
    drawdown: number;
    window: number;
  }>;
  warnings: string[];
  assumptions: string[];
  audit: string[];
  data_quality: {
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
};

const serializeStrategy = (strategy: StrategySpec) => ({
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

const mapMetrics = (metrics: ApiMetrics): ValidationMetrics => ({
  totalReturn: metrics.total_return,
  annualizedReturn: metrics.annualized_return,
  maxDrawdown: metrics.max_drawdown,
  sharpeRatio: metrics.sharpe_ratio,
  calmarRatio: metrics.calmar_ratio,
  tradeCount: metrics.trade_count,
  winRate: metrics.win_rate,
});

const mapResult = (result: ApiWalkForwardResult): WalkForwardResult => ({
  experimentId: result.experiment_id,
  symbol: result.symbol,
  strategyName: result.strategy_name,
  strategyKind: result.strategy_kind,
  engine: result.engine,
  dataSource: result.data_source,
  benchmarkSymbol: result.benchmark_symbol,
  adjustment: result.adjustment,
  objective: result.objective,
  primaryParameter: result.primary_parameter,
  trainBars: result.train_bars,
  testBars: result.test_bars,
  windowCount: result.window_count,
  candidateCount: result.candidate_count,
  overfittingRisk: result.overfitting_risk,
  aggregate: {
    ...mapMetrics(result.aggregate),
    initialCapital: result.aggregate.initial_capital,
    finalEquity: result.aggregate.final_equity,
    assetReturn: result.aggregate.asset_return,
    benchmarkReturn: result.aggregate.benchmark_return,
    excessReturn: result.aggregate.excess_return,
    relativeReturn: result.aggregate.relative_return,
    annualizedVolatility: result.aggregate.annualized_volatility,
    parameterStability: result.aggregate.parameter_stability,
  },
  averageTrainScore: result.average_train_score,
  averageTestScore: result.average_test_score,
  windows: result.windows.map((window) => ({
    sequence: window.sequence,
    trainStart: window.train_start,
    trainEnd: window.train_end,
    testStart: window.test_start,
    testEnd: window.test_end,
    primaryParameter: window.primary_parameter,
    selectedPeriod: window.selected_period,
    selectedStopLoss: window.selected_stop_loss,
    objectiveScore: window.objective_score,
    robustScore: window.robust_score,
    candidateCount: window.candidate_count,
    eligibleCount: window.eligible_count,
    usedFallback: window.used_fallback,
    train: mapMetrics(window.train),
    test: mapMetrics(window.test),
  })),
  parameterSurface: result.parameter_surface.map((point) => ({
    period: point.period,
    stopLoss: point.stop_loss,
    meanScore: point.mean_score,
    meanTrainReturn: point.mean_train_return,
    eligibleRate: point.eligible_rate,
    selectedCount: point.selected_count,
  })),
  equityCurve: result.equity_curve,
  warnings: result.warnings,
  assumptions: result.assumptions,
  audit: result.audit,
  dataQuality: {
    status: result.data_quality.status,
    adjustment: result.data_quality.adjustment,
    requestedStart: result.data_quality.requested_start,
    requestedEnd: result.data_quality.requested_end,
    actualStart: result.data_quality.actual_start,
    actualEnd: result.data_quality.actual_end,
    benchmarkStart: result.data_quality.benchmark_start,
    benchmarkEnd: result.data_quality.benchmark_end,
    coverageRatio: result.data_quality.coverage_ratio,
    benchmarkCoverageRatio: result.data_quality.benchmark_coverage_ratio,
    staleTradingDays: result.data_quality.stale_trading_days,
    strategyBars: result.data_quality.strategy_bars,
    benchmarkBars: result.data_quality.benchmark_bars,
    alignedBars: result.data_quality.aligned_bars,
    strategyHash: result.data_quality.strategy_hash,
    benchmarkHash: result.data_quality.benchmark_hash,
    checks: result.data_quality.checks,
  },
});

export const runWalkForward = async (
  strategy: StrategySpec,
  config: BacktestConfig,
  data: BacktestDataConfig,
  validation: WalkForwardConfig,
  bars = 756,
): Promise<WalkForwardResult> => {
  const response = await fetch('/api/v1/backtests/walk-forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy: serializeStrategy(strategy),
      config: {
        initial_capital: config.initialCapital,
        commission_bps: config.commissionBps,
        slippage_bps: config.slippageBps,
        risk_free_rate_percent: config.riskFreeRatePercent,
      },
      data: {
        mode: data.mode,
        provider: data.provider,
        adjustment: data.adjustment,
        benchmark_symbol: data.benchmarkSymbol,
        start_date: data.startDate,
        end_date: data.endDate,
        refresh: data.refresh,
      },
      validation: {
        train_bars: validation.trainBars,
        test_bars: validation.testBars,
        search: {
          period_min: validation.search.periodMin,
          period_max: validation.search.periodMax,
          period_step: validation.search.periodStep,
          stop_loss_min: validation.search.stopLossMin,
          stop_loss_max: validation.search.stopLossMax,
          stop_loss_step: validation.search.stopLossStep,
          minimum_trades: validation.search.minimumTrades,
          objective: validation.search.objective,
        },
      },
      bars,
    }),
  });
  const envelope = (await response.json()) as ApiEnvelope<ApiWalkForwardResult>;
  if (!response.ok || !envelope.success || !envelope.data) {
    throw new Error(envelope.error?.message || `Request failed with status ${response.status}`);
  }
  return mapResult(envelope.data);
};
