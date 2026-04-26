import React, { useEffect, useMemo, useState } from 'react';
import { generateJournalReview } from '../services/gemini';

type JournalEntry = {
  date: string;
  status: 'draft' | 'completed';
  marketPhase: string;
  positionPlan: string;
  marketNotes: string;
  hotThemes: string;
  targetStocks: string;
  logicValidation: string;
  buyPlan: string;
  sellRules: string;
  contingencyPlan: string;
  dailySummary: string;
  aiReview: string;
  aiUpdatedAt: string | null;
  updatedAt: string;
};

const STORAGE_KEY = 'strategy_journal_entries_v1';

const sectionFields: Array<{ key: keyof JournalEntry; label: string; placeholder: string; rows?: number }> = [
  {
    key: 'marketNotes',
    label: '1. 大盘与情绪分析',
    placeholder: '记录指数位置、量能变化、涨停/跌停家数、连板高度、炸板率，并写出你对市场阶段的判断。',
    rows: 5,
  },
  {
    key: 'hotThemes',
    label: '2. 热点板块',
    placeholder: '写主线板块、观察方向、驱动逻辑、持续性判断，以及你为什么相信它不是一日游。',
    rows: 5,
  },
  {
    key: 'targetStocks',
    label: '3. 目标个股',
    placeholder: '写龙头、中军、补涨、观察股，以及你明确放弃哪些票、为什么放弃。',
    rows: 5,
  },
  {
    key: 'logicValidation',
    label: '4. 消息面与逻辑验证',
    placeholder: '把新闻、公告、政策和盘面对应起来，说明逻辑是否成立，哪里还缺证据。',
    rows: 4,
  },
  {
    key: 'buyPlan',
    label: '5. 买入计划',
    placeholder: '写明天买什么、什么条件下买、什么条件下不买，避免盘中临时起意。',
    rows: 4,
  },
  {
    key: 'sellRules',
    label: '6. 卖出纪律',
    placeholder: '写止盈、止损、冲高减仓、预期落空后的处理规则。',
    rows: 4,
  },
  {
    key: 'contingencyPlan',
    label: '7. 应变预案',
    placeholder: '高开、低开、炸板、情绪转弱、板块分歧时分别怎么处理。',
    rows: 4,
  },
  {
    key: 'dailySummary',
    label: '8. 每日总结',
    placeholder: '今天最正确的一点、最大错误、明天最需要修正的一点。',
    rows: 4,
  },
];

const createEmptyEntry = (date: string): JournalEntry => ({
  date,
  status: 'draft',
  marketPhase: '',
  positionPlan: '',
  marketNotes: '',
  hotThemes: '',
  targetStocks: '',
  logicValidation: '',
  buyPlan: '',
  sellRules: '',
  contingencyPlan: '',
  dailySummary: '',
  aiReview: '',
  aiUpdatedAt: null,
  updatedAt: new Date().toISOString(),
});

const getToday = () => new Date().toLocaleDateString('sv-SE');

const buildRecentWeekDates = (entries: Record<string, JournalEntry>) => {
  const recent = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return date.toLocaleDateString('sv-SE');
  });

  const merged = new Set([...recent, ...Object.keys(entries).slice(0, 7)]);
  return Array.from(merged)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 7);
};

const computeCompletion = (entry: JournalEntry) => {
  const fields: Array<keyof JournalEntry> = [
    'marketPhase',
    'positionPlan',
    'marketNotes',
    'hotThemes',
    'targetStocks',
    'logicValidation',
    'buyPlan',
    'sellRules',
    'contingencyPlan',
    'dailySummary',
  ];

  const completed = fields.filter((field) => entry[field].trim().length > 0).length;
  return Math.round((completed / fields.length) * 100);
};

const formatShortDate = (date: string) => {
  const [year, month, day] = date.split('-');
  return `${month}/${day}`;
};

const ProfilePage: React.FC = () => {
  const [entries, setEntries] = useState<Record<string, JournalEntry>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const [reviewLoading, setReviewLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    setSaveState('saved');
    const timer = window.setTimeout(() => setSaveState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [entries]);

  const recentDates = useMemo(() => buildRecentWeekDates(entries), [entries]);
  const selectedEntry = entries[selectedDate] ?? createEmptyEntry(selectedDate);
  const completion = computeCompletion(selectedEntry);

  const updateEntry = (patch: Partial<JournalEntry>) => {
    setEntries((prev) => {
      const base = prev[selectedDate] ?? createEmptyEntry(selectedDate);
      const next: JournalEntry = {
        ...base,
        ...patch,
        status:
          computeCompletion({ ...base, ...patch, updatedAt: base.updatedAt, aiUpdatedAt: base.aiUpdatedAt } as JournalEntry) >= 70
            ? 'completed'
            : 'draft',
        updatedAt: new Date().toISOString(),
      };

      return {
        ...prev,
        [selectedDate]: next,
      };
    });
  };

  const handleGenerateReview = async () => {
    const entry = entries[selectedDate] ?? createEmptyEntry(selectedDate);
    setReviewLoading(true);

    try {
      const review = await generateJournalReview({
        date: entry.date,
        marketPhase: entry.marketPhase,
        positionPlan: entry.positionPlan,
        marketNotes: entry.marketNotes,
        hotThemes: entry.hotThemes,
        targetStocks: entry.targetStocks,
        logicValidation: entry.logicValidation,
        buyPlan: entry.buyPlan,
        sellRules: entry.sellRules,
        contingencyPlan: entry.contingencyPlan,
        dailySummary: entry.dailySummary,
      });

      updateEntry({
        aiReview: review,
        aiUpdatedAt: new Date().toISOString(),
      });
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1680px] px-6 py-6 text-white">
      <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <aside className="sticky top-6 rounded-[28px] border border-white/10 bg-[#0f1318] shadow-[0_24px_90px_-50px_rgba(0,0,0,0.8)]">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">Trading Journal</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">交易日记</h1>
            <p className="mt-2 text-sm leading-6 text-white/45">选择日期，填写复盘，保存在本地。</p>
          </div>

          <div className="px-5 py-5">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35">选择日期</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/[0.06]"
            />

            <button
              type="button"
              onClick={() => setSelectedDate(getToday())}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.07]"
            >
              回到今天
            </button>
          </div>

          <div className="border-t border-white/10 px-5 py-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/35">近一周</div>
            <div className="space-y-2">
              {recentDates.map((date) => {
                const entry = entries[date] ?? createEmptyEntry(date);
                const itemCompletion = computeCompletion(entry);
                const active = date === selectedDate;

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-cyan-400/40 bg-cyan-400/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{formatShortDate(date)}</div>
                        <div className="mt-1 text-xs text-white/40">{entry.marketPhase || '未填写阶段判断'}</div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                          entry.status === 'completed'
                            ? 'bg-emerald-400/10 text-emerald-300'
                            : 'bg-amber-400/10 text-amber-300'
                        }`}
                      >
                        {entry.status === 'completed' ? '已完成' : '草稿'}
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${itemCompletion}%` }}></div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="rounded-[28px] border border-white/10 bg-[#0f1318] shadow-[0_24px_90px_-50px_rgba(0,0,0,0.8)]">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Daily Review</div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{selectedDate}</h2>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70">
                  完成度 {completion}%
                </div>
                <div className="text-xs text-white/35">{saveState === 'saved' ? '已保存到本地' : '本地自动保存'}</div>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <label className="mb-2 block text-sm font-semibold text-white/85">市场阶段</label>
                <input
                  value={selectedEntry.marketPhase}
                  onChange={(event) => updateEntry({ marketPhase: event.target.value })}
                  placeholder="例如：发酵期 / 高潮期 / 退潮期 / 修复期"
                  className="w-full rounded-2xl border border-white/10 bg-[#131722] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-400/50"
                />
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <label className="mb-2 block text-sm font-semibold text-white/85">次日仓位计划</label>
                <input
                  value={selectedEntry.positionPlan}
                  onChange={(event) => updateEntry({ positionPlan: event.target.value })}
                  placeholder="例如：轻仓试错 / 半仓主线 / 只观察不出手"
                  className="w-full rounded-2xl border border-white/10 bg-[#131722] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-400/50"
                />
              </div>
            </div>

            <div className="mt-5 space-y-5">
              {sectionFields.map((field) => (
                <div key={field.key} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                  <label className="mb-3 block text-sm font-semibold text-white/85">{field.label}</label>
                  <textarea
                    value={selectedEntry[field.key] as string}
                    onChange={(event) => updateEntry({ [field.key]: event.target.value } as Partial<JournalEntry>)}
                    placeholder={field.placeholder}
                    rows={field.rows ?? 4}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-[#131722] px-4 py-3 text-sm leading-7 text-white outline-none transition placeholder:text-white/25 focus:border-cyan-400/50"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="sticky top-6 rounded-[28px] border border-white/10 bg-[#0f1318] shadow-[0_24px_90px_-50px_rgba(0,0,0,0.8)]">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300/80">AI Review</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">评价与修正建议</h2>
            <p className="mt-2 text-sm leading-6 text-white/45">基于当日日记内容，检查逻辑漏洞、计划执行性和风险点。</p>
            <button
              type="button"
              onClick={handleGenerateReview}
              disabled={reviewLoading}
              className="mt-4 inline-flex items-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-[#071319] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {reviewLoading ? 'AI 分析中...' : '生成 AI 评价'}
            </button>
          </div>

          <div className="px-5 py-5">
            {selectedEntry.aiReview ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/45">
                  {selectedEntry.aiUpdatedAt
                    ? `最近更新：${new Date(selectedEntry.aiUpdatedAt).toLocaleString('zh-CN')}`
                    : '尚无更新时间'}
                </div>
                <div className="rounded-[24px] border border-white/10 bg-[#131722] p-5 text-sm leading-7 whitespace-pre-wrap text-white/85">
                  {selectedEntry.aiReview}
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center">
                <div className="text-lg font-semibold text-white">还没有 AI 评价</div>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  先填写当日日记，再生成 AI 评价。结果会和这一天的记录一起保存在本地。
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ProfilePage;
