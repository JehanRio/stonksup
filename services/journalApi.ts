export type JournalEntryRecord = {
  date: string;
  status: 'draft' | 'completed';
  marketPhase: string;
  marketNotes: string;
  focus: string;
  targets: string;
  tradePlan: string;
  dailySummary: string;
  aiReview: string;
  aiUpdatedAt: string | null;
  updatedAt: string;
};

type Envelope<Data> = {
  success: boolean;
  data: Data | null;
  error: { message: string } | null;
};

const request = async <Data>(path: string, options?: RequestInit): Promise<Data> => {
  let response: Response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error('日记服务暂时无法连接，内容已保存在当前浏览器。');
  }

  const raw = await response.text();
  let payload: Envelope<Data> | null = null;
  try {
    payload = raw ? JSON.parse(raw) as Envelope<Data> : null;
  } catch {
    payload = null;
  }

  if (!payload || !response.ok || !payload.success || !payload.data) {
    throw new Error(payload?.error?.message || `日记保存失败（HTTP ${response.status}）。`);
  }
  return payload.data;
};

const toApiEntry = (entry: JournalEntryRecord) => ({
  date: entry.date,
  status: entry.status,
  market_phase: entry.marketPhase,
  market_notes: entry.marketNotes,
  focus: entry.focus,
  targets: entry.targets,
  trade_plan: entry.tradePlan,
  daily_summary: entry.dailySummary,
  ai_review: entry.aiReview,
  ai_updated_at: entry.aiUpdatedAt,
  updated_at: entry.updatedAt,
});

const fromApiEntry = (entry: any): JournalEntryRecord => ({
  date: entry.date,
  status: entry.status === 'completed' ? 'completed' : 'draft',
  marketPhase: entry.market_phase || '',
  marketNotes: entry.market_notes || '',
  focus: entry.focus || '',
  targets: entry.targets || '',
  tradePlan: entry.trade_plan || '',
  dailySummary: entry.daily_summary || '',
  aiReview: entry.ai_review || '',
  aiUpdatedAt: entry.ai_updated_at || null,
  updatedAt: entry.updated_at,
});

export const syncJournalEntries = async (entries: JournalEntryRecord[]) => {
  const result = await request<{ entries: any[] }>('/api/v1/journal-entries/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: entries.map(toApiEntry) }),
  });
  return result.entries.map(fromApiEntry);
};

export const saveJournalEntry = async (entry: JournalEntryRecord) =>
  fromApiEntry(await request<any>(`/api/v1/journal-entries/${encodeURIComponent(entry.date)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toApiEntry(entry)),
  }));
