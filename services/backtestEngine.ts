import type { OHLC } from '../types';

export type StrategyKind = 'ma_crossover' | 'momentum_breakout' | 'rsi_mean_reversion';

export type StrategyDefinition = {
  name: string;
  symbol: string;
  kind: StrategyKind;
  fastPeriod: number;
  slowPeriod: number;
  lookbackPeriod: number;
  rsiPeriod: number;
  rsiEntry: number;
  rsiExit: number;
  stopLossPercent: number;
  allocationPercent: number;
};

export type BacktestConfig = {
  initialCapital: number;
  commissionBps: number;
  slippageBps: number;
};

export type StrategyCompilation = {
  definition: StrategyDefinition;
  interpretation: string[];
  warnings: string[];
  contractVersion: string;
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
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const toDateKey = (timestamp?: number) => {
  if (!timestamp) return '--';
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
};

const hashText = (text: string) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const getBusinessDates = (count: number) => {
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(2026, 6, 24));

  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.unshift(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return dates;
};

export const createSeededDailyHistory = (symbol: string, bars = 756): OHLC[] => {
  const normalizedSymbol = symbol.trim().toUpperCase() || 'MU';
  const random = createRandom(hashText(`stonksup:${normalizedSymbol}:v1`));
  const dates = getBusinessDates(bars);
  const basePrices: Record<string, number> = {
    MU: 62,
    NVDA: 48,
    AAPL: 132,
    MSFT: 240,
    GOOG: 108,
    GOOGL: 108,
    TSLA: 190,
  };
  let previousClose = basePrices[normalizedSymbol] ?? 100;

  return dates.map((date, index) => {
    const progress = index / Math.max(bars - 1, 1);
    const regimeDrift =
      progress < 0.24 ? -0.00025 :
      progress < 0.58 ? 0.00115 :
      progress < 0.76 ? -0.00065 :
      0.00135;
    const cycle = Math.sin(index / 17) * 0.0024 + Math.sin(index / 43) * 0.0018;
    const noise = (random() - 0.5) * 0.038;
    const eventShock = index > 0 && index % 137 === 0 ? (random() - 0.42) * 0.085 : 0;
    const dailyReturn = clamp(regimeDrift + cycle + noise + eventShock, -0.095, 0.095);
    const open = previousClose * (1 + (random() - 0.5) * 0.012);
    const close = Math.max(4, previousClose * (1 + dailyReturn));
    const high = Math.max(open, close) * (1 + random() * 0.021);
    const low = Math.min(open, close) * (1 - random() * 0.021);
    const volume = Math.round(12_000_000 * (0.72 + random() * 0.8) * (1 + Math.abs(dailyReturn) * 8));
    previousClose = close;

    return {
      time: date.toISOString().slice(5, 10),
      timestamp: Math.floor(date.getTime() / 1000),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    };
  });
};

const calculateSma = (rows: OHLC[], period: number) => {
  const values: Array<number | null> = [];
  let sum = 0;

  rows.forEach((row, index) => {
    sum += row.close;
    if (index >= period) sum -= rows[index - period].close;
    values.push(index >= period - 1 ? sum / period : null);
  });

  return values;
};

const calculateRsi = (rows: OHLC[], period: number) => {
  const values: Array<number | null> = new Array(rows.length).fill(null);

  for (let index = period; index < rows.length; index += 1) {
    let gains = 0;
    let losses = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      const change = rows[cursor].close - rows[cursor - 1].close;
      if (change >= 0) gains += change;
      else losses += Math.abs(change);
    }
    if (losses === 0) values[index] = 100;
    else {
      const relativeStrength = gains / losses;
      values[index] = 100 - 100 / (1 + relativeStrength);
    }
  }

  return values;
};

const parseNumbersBeforeDay = (prompt: string) =>
  [...prompt.matchAll(/(\d+)\s*日/g)].map((match) => Number(match[1])).filter(Number.isFinite);

export const compileStrategyPrompt = (
  prompt: string,
  preferredKind?: StrategyKind,
): StrategyCompilation => {
  const upperPrompt = prompt.toUpperCase();
  const ignoredTokens = new Set(['AI', 'RSI', 'SMA', 'EMA', 'USD']);
  const symbol =
    [...upperPrompt.matchAll(/\b[A-Z]{1,5}\b/g)]
      .map((match) => match[0])
      .find((token) => !ignoredTokens.has(token)) ?? 'MU';
  const periods = parseNumbersBeforeDay(prompt);
  const stopLossMatch = prompt.match(/(?:止损|亏损|回撤)[^\d]{0,8}(\d+(?:\.\d+)?)\s*%/);
  const allocationMatch =
    prompt.match(/(\d+(?:\.\d+)?)\s*%\s*(?:的)?(?:资金|仓位)/) ??
    prompt.match(/(?:仓位|资金)[^\d]{0,8}(\d+(?:\.\d+)?)\s*%/);
  const kind =
    preferredKind ??
    (upperPrompt.includes('RSI')
      ? 'rsi_mean_reversion'
      : prompt.includes('突破') && !prompt.includes('均线')
        ? 'momentum_breakout'
        : 'ma_crossover');

  const definition: StrategyDefinition = {
    name:
      kind === 'ma_crossover'
        ? `${symbol} 均线趋势`
        : kind === 'momentum_breakout'
          ? `${symbol} 动量突破`
          : `${symbol} RSI 均值回归`,
    symbol,
    kind,
    fastPeriod: clamp(periods[0] ?? 20, 2, 120),
    slowPeriod: clamp(periods[1] ?? 60, 5, 250),
    lookbackPeriod: clamp(periods[0] ?? 20, 5, 120),
    rsiPeriod: clamp(periods[0] ?? 14, 5, 40),
    rsiEntry: 30,
    rsiExit: 55,
    stopLossPercent: clamp(Number(stopLossMatch?.[1] ?? 8), 1, 30),
    allocationPercent: clamp(Number(allocationMatch?.[1] ?? 95), 5, 100),
  };

  if (definition.fastPeriod >= definition.slowPeriod) {
    definition.fastPeriod = Math.max(2, Math.floor(definition.slowPeriod / 3));
  }

  const interpretation =
    kind === 'ma_crossover'
      ? [
          `${definition.fastPeriod} 日均线上穿 ${definition.slowPeriod} 日均线后，于下一交易日开盘买入。`,
          `${definition.fastPeriod} 日均线下穿 ${definition.slowPeriod} 日均线后，于下一交易日开盘卖出。`,
        ]
      : kind === 'momentum_breakout'
        ? [
            `收盘价突破过去 ${definition.lookbackPeriod} 个交易日最高价后，于下一交易日开盘买入。`,
            `收盘价跌破 20 日均线后，于下一交易日开盘卖出。`,
          ]
        : [
            `${definition.rsiPeriod} 日 RSI 低于 ${definition.rsiEntry} 后，于下一交易日开盘买入。`,
            `RSI 高于 ${definition.rsiExit} 后，于下一交易日开盘卖出。`,
          ];

  return {
    definition,
    interpretation: [
      ...interpretation,
      `保护性止损 ${definition.stopLossPercent.toFixed(1)}%，单次最多使用 ${definition.allocationPercent.toFixed(0)}% 可用资金。`,
    ],
    warnings: [
      '当前为本地规则编译器预览；接入后端后由 LLM 生成同一份结构化策略契约。',
      '所有信号使用当日收盘数据，并在下一交易日开盘执行，避免未来数据泄漏。',
    ],
    contractVersion: 'strategy-dsl.v0.1',
  };
};

type PendingAction = { type: 'buy' | 'sell'; reason: string } | null;

export const runBacktest = (
  history: OHLC[],
  definition: StrategyDefinition,
  config: BacktestConfig,
): BacktestResult => {
  const rows = [...history]
    .filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite))
    .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0));

  if (rows.length < 80) {
    throw new Error('Backtest requires at least 80 valid daily bars.');
  }

  const commissionRate = config.commissionBps / 10_000;
  const slippageRate = config.slippageBps / 10_000;
  const fastSma = calculateSma(rows, definition.fastPeriod);
  const slowSma = calculateSma(rows, definition.slowPeriod);
  const exitSma = calculateSma(rows, 20);
  const rsi = calculateRsi(rows, definition.rsiPeriod);
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const firstClose = rows[0].close;
  let cash = config.initialCapital;
  let quantity = 0;
  let entryPrice = 0;
  let entryFee = 0;
  let entryDate = '';
  let peakEquity = config.initialCapital;
  let pendingAction: PendingAction = null;

  const closePosition = (row: OHLC, rawPrice: number, reason: string) => {
    if (quantity <= 0) return;
    const exitPrice = rawPrice * (1 - slippageRate);
    const proceeds = quantity * exitPrice;
    const fee = proceeds * commissionRate;
    cash += proceeds - fee;
    const entryValue = quantity * entryPrice;
    const pnl = proceeds - fee - entryValue - entryFee;
    trades.push({
      id: `T-${String(trades.length + 1).padStart(3, '0')}`,
      entryDate,
      exitDate: toDateKey(row.timestamp),
      entryPrice,
      exitPrice,
      quantity,
      pnl,
      returnPercent: entryValue === 0 ? 0 : pnl / (entryValue + entryFee),
      exitReason: reason,
    });
    quantity = 0;
    entryPrice = 0;
    entryFee = 0;
    entryDate = '';
  };

  rows.forEach((row, index) => {
    if (pendingAction?.type === 'buy' && quantity === 0) {
      const executionPrice = row.open * (1 + slippageRate);
      const budget = cash * (definition.allocationPercent / 100);
      const nextQuantity = Math.floor(budget / (executionPrice * (1 + commissionRate)));
      if (nextQuantity > 0) {
        const cost = nextQuantity * executionPrice;
        entryFee = cost * commissionRate;
        cash -= cost + entryFee;
        quantity = nextQuantity;
        entryPrice = executionPrice;
        entryDate = toDateKey(row.timestamp);
      }
    } else if (pendingAction?.type === 'sell' && quantity > 0) {
      closePosition(row, row.open, pendingAction.reason);
    }
    pendingAction = null;

    let stoppedOut = false;
    if (quantity > 0) {
      const stopPrice = entryPrice * (1 - definition.stopLossPercent / 100);
      if (row.low <= stopPrice) {
        closePosition(row, Math.min(row.open, stopPrice), 'protective_stop');
        stoppedOut = true;
      }
    }

    const markedEquity = cash + quantity * row.close;
    peakEquity = Math.max(peakEquity, markedEquity);
    equityCurve.push({
      date: toDateKey(row.timestamp),
      strategy: markedEquity,
      benchmark: config.initialCapital * (row.close / firstClose),
      drawdown: peakEquity === 0 ? 0 : markedEquity / peakEquity - 1,
    });

    if (stoppedOut || index === rows.length - 1) return;

    if (definition.kind === 'ma_crossover') {
      const fast = fastSma[index];
      const slow = slowSma[index];
      const previousFast = fastSma[index - 1];
      const previousSlow = slowSma[index - 1];
      if (fast === null || slow === null || previousFast === null || previousSlow === null) return;
      if (quantity === 0 && previousFast <= previousSlow && fast > slow) {
        pendingAction = { type: 'buy', reason: 'ma_cross_up' };
      } else if (quantity > 0 && previousFast >= previousSlow && fast < slow) {
        pendingAction = { type: 'sell', reason: 'ma_cross_down' };
      }
      return;
    }

    if (definition.kind === 'momentum_breakout') {
      if (index < definition.lookbackPeriod) return;
      const previousHigh = Math.max(
        ...rows.slice(index - definition.lookbackPeriod, index).map((item) => item.high),
      );
      if (quantity === 0 && row.close > previousHigh) {
        pendingAction = { type: 'buy', reason: 'momentum_breakout' };
      } else if (quantity > 0 && exitSma[index] !== null && row.close < exitSma[index]!) {
        pendingAction = { type: 'sell', reason: 'trend_exit' };
      }
      return;
    }

    const currentRsi = rsi[index];
    if (currentRsi === null) return;
    if (quantity === 0 && currentRsi < definition.rsiEntry) {
      pendingAction = { type: 'buy', reason: 'rsi_oversold' };
    } else if (quantity > 0 && currentRsi > definition.rsiExit) {
      pendingAction = { type: 'sell', reason: 'rsi_reversion' };
    }
  });

  const lastRow = rows[rows.length - 1];
  if (quantity > 0) {
    closePosition(lastRow, lastRow.close, 'end_of_test');
    const lastPoint = equityCurve[equityCurve.length - 1];
    lastPoint.strategy = cash;
    peakEquity = Math.max(...equityCurve.map((point) => point.strategy));
    let rollingPeak = config.initialCapital;
    equityCurve.forEach((point) => {
      rollingPeak = Math.max(rollingPeak, point.strategy);
      point.drawdown = point.strategy / rollingPeak - 1;
    });
  }

  const finalEquity = equityCurve.at(-1)?.strategy ?? config.initialCapital;
  const totalReturn = finalEquity / config.initialCapital - 1;
  const years = Math.max((rows.length - 1) / 252, 1 / 252);
  const annualizedReturn = Math.pow(Math.max(finalEquity / config.initialCapital, 0.0001), 1 / years) - 1;
  const dailyReturns = equityCurve.slice(1).map((point, index) => {
    const previous = equityCurve[index].strategy;
    return previous === 0 ? 0 : point.strategy / previous - 1;
  });
  const meanReturn = dailyReturns.reduce((sum, value) => sum + value, 0) / Math.max(dailyReturns.length, 1);
  const variance = dailyReturns.reduce((sum, value) => sum + Math.pow(value - meanReturn, 2), 0) / Math.max(dailyReturns.length - 1, 1);
  const standardDeviation = Math.sqrt(variance);
  const winningTrades = trades.filter((trade) => trade.pnl > 0);
  const grossProfit = winningTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
  const runHash = hashText(JSON.stringify({ definition, config, first: rows[0].timestamp, last: lastRow.timestamp }));

  return {
    runId: `BT-${runHash.toString(16).toUpperCase().padStart(8, '0')}`,
    symbol: definition.symbol,
    strategyName: definition.name,
    bars: rows.length,
    asOf: toDateKey(lastRow.timestamp),
    dataSource: 'Seeded daily market regimes / demo-v1',
    initialCapital: config.initialCapital,
    finalEquity,
    totalReturn,
    annualizedReturn,
    benchmarkReturn: lastRow.close / firstClose - 1,
    maxDrawdown: Math.min(...equityCurve.map((point) => point.drawdown)),
    sharpeRatio: standardDeviation === 0 ? 0 : (meanReturn / standardDeviation) * Math.sqrt(252),
    winRate: trades.length === 0 ? 0 : winningTrades.length / trades.length,
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss,
    tradeCount: trades.length,
    equityCurve,
    trades,
    assumptions: [
      'Long-only; one position at a time; integer shares.',
      `Commission ${config.commissionBps} bps and slippage ${config.slippageBps} bps per side.`,
      'Signals use close data and execute at the next session open.',
      'Seeded demo data is deterministic and must not be treated as investable evidence.',
    ],
  };
};
