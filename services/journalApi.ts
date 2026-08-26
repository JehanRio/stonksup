export type JournalTradeRecord = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell' | 'short' | 'cover';
  executedAt: string | null;
  price: string;
  quantity: string;
  planned: boolean;
  note: string;
};

export type JournalEntryRecord = {
  date: string;
  status: 'draft' | 'completed';
  marketPhase: string;
  marketNotes: string;
  focus: string;
  targets: string;
  tradePlan: string;
  maxDailyLossPct: string;
  marketOutcome: string;
  executionNotes: string;
  dailySummary: string;
  planAdherence: string;
  lessons: string;
  nextImprovement: string;
  postmarketCompletedAt: string | null;
  trades: JournalTradeRecord[];
  planIsLocked: boolean;
  planLockedAt: string | null;
  planRevision: number;
  planHistory: Array<Record<string, unknown>>;
  aiReview: string;
  aiEvidence: JournalMarketEvidence[];
  aiUpdatedAt: string | null;
  updatedAt: string;
};

export type JournalMarketEvidence = {
  symbol: string;
  asOf: string;
  close: number;
  dayChangePct: number | null;
  ema20: number | null;
  atr14: number | null;
  high20d: number | null;
  low20d: number | null;
  volumeRatio20d: number | null;
  dataSource: string;
};

export type JournalAnalysisResult = {
  analysis: string;
  generatedAt: string;
  evidence: JournalMarketEvidence[];
  warnings: string[];
};

type Envelope<Data> = { success: boolean; data: Data | null; error: { message: string } | null };

const request = async <Data>(path: string, options?: RequestInit): Promise<Data> => {
  let response: Response;
  try { response = await fetch(path, options); }
  catch { throw new Error('日记服务暂时无法连接，内容已保存在当前浏览器。'); }
  const raw = await response.text();
  let payload: Envelope<Data> | null = null;
  try { payload = raw ? JSON.parse(raw) as Envelope<Data> : null; } catch { payload = null; }
  if (!payload || !response.ok || !payload.success || !payload.data) {
    throw new Error(payload?.error?.message || `日记保存失败（HTTP ${response.status}）。`);
  }
  return payload.data;
};

const toApiEntry = (entry: JournalEntryRecord) => ({
  date: entry.date, status: entry.status, market_phase: entry.marketPhase,
  market_notes: entry.marketNotes, focus: entry.focus, targets: entry.targets,
  trade_plan: entry.tradePlan, max_daily_loss_pct: entry.maxDailyLossPct || null,
  market_outcome: entry.marketOutcome, execution_notes: entry.executionNotes,
  daily_summary: entry.dailySummary, plan_adherence: entry.planAdherence,
  lessons: entry.lessons, next_improvement: entry.nextImprovement,
  postmarket_completed_at: entry.postmarketCompletedAt,
  trades: entry.trades.map((trade) => ({
    id: trade.id, symbol: trade.symbol, side: trade.side,
    executed_at: trade.executedAt, price: trade.price || null,
    quantity: trade.quantity || null, planned: trade.planned, note: trade.note,
  })),
  ai_review: entry.aiReview, ai_updated_at: entry.aiUpdatedAt, updated_at: entry.updatedAt,
});

const fromApiEntry = (entry: any): JournalEntryRecord => ({
  date: entry.date, status: entry.status === 'completed' ? 'completed' : 'draft',
  marketPhase: entry.market_phase || '', marketNotes: entry.market_notes || '',
  focus: entry.focus || '', targets: entry.targets || '', tradePlan: entry.trade_plan || '',
  maxDailyLossPct: entry.max_daily_loss_pct == null ? '' : String(entry.max_daily_loss_pct),
  marketOutcome: entry.market_outcome || '', executionNotes: entry.execution_notes || '',
  dailySummary: entry.daily_summary || '', planAdherence: entry.plan_adherence || '',
  lessons: entry.lessons || '', nextImprovement: entry.next_improvement || '',
  postmarketCompletedAt: entry.postmarket_completed_at || null,
  trades: Array.isArray(entry.trades) ? entry.trades.map((trade: any) => ({
    id: trade.id, symbol: trade.symbol || '', side: trade.side || 'buy',
    executedAt: trade.executed_at || null, price: trade.price == null ? '' : String(trade.price),
    quantity: trade.quantity == null ? '' : String(trade.quantity), planned: trade.planned !== false,
    note: trade.note || '',
  })) : [],
  planIsLocked: Boolean(entry.plan_is_locked), planLockedAt: entry.plan_locked_at || null,
  planRevision: Number(entry.plan_revision || 0), planHistory: entry.plan_history || [],
  aiReview: entry.ai_review || '',
  aiEvidence: Array.isArray(entry.ai_evidence) ? entry.ai_evidence.map((item: any) => ({
    symbol: item.symbol, asOf: item.as_of, close: Number(item.close),
    dayChangePct: item.day_change_pct == null ? null : Number(item.day_change_pct),
    ema20: item.ema20 == null ? null : Number(item.ema20),
    atr14: item.atr14 == null ? null : Number(item.atr14),
    high20d: item.high_20d == null ? null : Number(item.high_20d),
    low20d: item.low_20d == null ? null : Number(item.low_20d),
    volumeRatio20d: item.volume_ratio_20d == null ? null : Number(item.volume_ratio_20d),
    dataSource: item.data_source,
  })) : [],
  aiUpdatedAt: entry.ai_updated_at || null, updatedAt: entry.updated_at,
});

export const syncJournalEntries = async (entries: JournalEntryRecord[]) => {
  const result = await request<{ entries: any[] }>('/api/v1/journal-entries/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: entries.map(toApiEntry) }),
  });
  return result.entries.map(fromApiEntry);
};

export const saveJournalEntry = async (entry: JournalEntryRecord) =>
  fromApiEntry(await request<any>(`/api/v1/journal-entries/${encodeURIComponent(entry.date)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toApiEntry(entry)),
  }));

export const lockJournalPlan = async (entry: JournalEntryRecord) =>
  fromApiEntry(await request<any>(`/api/v1/journal-entries/${encodeURIComponent(entry.date)}/plan/lock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toApiEntry(entry)),
  }));

export const unlockJournalPlan = async (date: string) =>
  fromApiEntry(await request<any>(`/api/v1/journal-entries/${encodeURIComponent(date)}/plan/unlock`, { method: 'POST' }));

export const analyzeJournalEntry = async (date: string): Promise<JournalAnalysisResult> => {
  const result = await request<any>(`/api/v1/journal-entries/${encodeURIComponent(date)}/analyze`, { method: 'POST' });
  return {
    analysis: result.analysis,
    generatedAt: result.generated_at,
    evidence: (result.evidence || []).map((item: any) => ({
      symbol: item.symbol, asOf: item.as_of, close: Number(item.close),
      dayChangePct: item.day_change_pct == null ? null : Number(item.day_change_pct),
      ema20: item.ema20 == null ? null : Number(item.ema20),
      atr14: item.atr14 == null ? null : Number(item.atr14),
      high20d: item.high_20d == null ? null : Number(item.high_20d),
      low20d: item.low_20d == null ? null : Number(item.low_20d),
      volumeRatio20d: item.volume_ratio_20d == null ? null : Number(item.volume_ratio_20d),
      dataSource: item.data_source,
    })),
    warnings: result.warnings || [],
  };
};
