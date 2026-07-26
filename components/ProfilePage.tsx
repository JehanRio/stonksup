import React, { useEffect, useMemo, useRef, useState } from 'react';
import { generateJournalReview } from '../services/gemini';
import {
  createJournalBackupHandle,
  ensureJournalBackupPermission,
  getStoredJournalBackupHandle,
  isJournalFileBackupSupported,
  persistJournalBackupHandle,
  writeJournalBackup,
  type JournalBackupFileHandle,
} from '../services/journalBackup';

type JournalEntry = {
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

type BackupStatus = 'idle' | 'unsupported' | 'binding' | 'syncing' | 'synced' | 'permission-needed' | 'error';

const STORAGE_KEY = 'strategy_journal_entries_v1';

const sectionFields: Array<{ key: keyof JournalEntry; label: string; placeholder: string; rows?: number }> = [
  {
    key: 'marketNotes',
    label: '1. 大盘与情绪',
    placeholder: '指数、量能、涨停/跌停家数、连板高度、炸板率、市场阶段判断。',
    rows: 5,
  },
  {
    key: 'focus',
    label: '2. 主线与方向',
    placeholder: '今天或明天最该关注的 1-2 个主线板块、驱动逻辑、持续性判断。',
    rows: 4,
  },
  {
    key: 'targets',
    label: '3. 目标个股',
    placeholder: '龙头、中军、补涨、放弃的票，以及原因。',
    rows: 4,
  },
  {
    key: 'tradePlan',
    label: '4. 交易计划',
    placeholder: '买入条件、仓位、止盈止损、应变预案（高开/低开/炸板）。',
    rows: 6,
  },
  {
    key: 'dailySummary',
    label: '5. 今日总结',
    placeholder: '今天最对的操作、最大的失误、明天最该修正的点。',
    rows: 4,
  },
];

const dailyReviewChecklist = [
  '市场环境：指数方向、量能、涨跌家数、涨停/跌停、市场阶段。',
  '主线强度：最强板块、驱动事件、资金是否扩散或退潮。',
  '个股定位：龙头、中军、补涨或跟风，目标是否还在原逻辑内。',
  '计划执行：买卖是否符合预案，仓位、止损、应变是否清楚。',
  '明日触发：只写 2-3 个“如果...就...”的可执行条件。',
];

const dailyReviewExample = [
  {
    label: '市场阶段',
    text: '修复期偏强，但量能没有明显放大，适合轻仓试错，不适合追高加速。',
  },
  {
    label: '大盘与情绪',
    text: '指数上午冲高回落，下午资金回流科技方向；涨停家数增加，跌停减少，情绪从冰点后修复。',
  },
  {
    label: '主线与方向',
    text: 'AI 硬件仍是最强方向，核心看成交额是否继续集中；如果明天高开缩量，先观察分歧承接。',
  },
  {
    label: '目标个股',
    text: '只看板块核心和成交最活跃的中军，放弃后排跟风票；没有放量突破就不主动追。',
  },
  {
    label: '交易计划',
    text: '如果核心股分时回踩均线后放量站回，考虑小仓试错；若板块开盘直接高潮，等第一次分歧再看。',
  },
  {
    label: '今日总结',
    text: '今天做对的是没有在情绪最热时追高；问题是计划里止损条件写得不够具体，明天必须写到价格或形态。',
  },
];

const usMarketReviewRoutine = [
  {
    title: '早上：昨晚复盘',
    timing: '起床后 10-20 分钟',
    points: [
      '昨晚市场是强、弱、震荡，还是分化。',
      '关注标的有没有按预期走，判断错在哪里。',
      '自己有没有按计划执行，问题是信息、节奏、仓位还是情绪。',
    ],
  },
  {
    title: '晚上：今晚计划',
    timing: '开盘前 30-60 分钟',
    points: [
      '看期指、盘前、财报、经济数据和隔夜新闻。',
      '只列今晚要看的标的、触发条件、仓位上限。',
      '提前写清楚不交易条件，避免临近开盘硬找理由。',
    ],
  },
];

const createEmptyEntry = (date: string): JournalEntry => ({
  date,
  status: 'draft',
  marketPhase: '',
  marketNotes: '',
  focus: '',
  targets: '',
  tradePlan: '',
  dailySummary: '',
  aiReview: '',
  aiUpdatedAt: null,
  updatedAt: new Date().toISOString(),
});

const getToday = () => new Date().toLocaleDateString('sv-SE');

const parseJournalDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatJournalDate = (date: Date) => date.toLocaleDateString('sv-SE');

const shiftJournalDate = (date: string, dayOffset: number) => {
  const next = parseJournalDate(date);
  next.setDate(next.getDate() + dayOffset);
  return formatJournalDate(next);
};

const getMonthStart = (date: string) => {
  const parsed = parseJournalDate(date);
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
};

const buildCalendarDays = (monthStart: Date) => {
  const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
};

const buildJournalHeatmapDays = () => {
  const today = parseJournalDate(getToday());
  const currentWeekday = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - currentWeekday - 12 * 7);

  return Array.from({ length: 13 * 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return formatJournalDate(date);
  });
};

const computeCompletion = (entry: JournalEntry) => {
  const fields: Array<keyof JournalEntry> = [
    'marketPhase',
    'marketNotes',
    'focus',
    'targets',
    'tradePlan',
    'dailySummary',
  ];

  const completed = fields.filter((field) => entry[field].trim().length > 0).length;
  return Math.round((completed / fields.length) * 100);
};

const hasJournalContent = (entry?: JournalEntry) => {
  if (!entry) return false;
  return ['marketPhase', 'marketNotes', 'focus', 'targets', 'tradePlan', 'dailySummary'].some((field) =>
    String(entry[field as keyof JournalEntry] ?? '').trim()
  );
};

const getJournalHeatmapClass = (entry?: JournalEntry) => {
  if (!hasJournalContent(entry)) {
    return 'border-white/[0.06] bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.08]';
  }

  const completion = computeCompletion(entry!);

  if (completion >= 85) {
    return 'border-emerald-200/40 bg-emerald-300/80 hover:bg-emerald-200';
  }

  if (completion >= 55) {
    return 'border-cyan-200/30 bg-cyan-300/60 hover:bg-cyan-200/80';
  }

  return 'border-cyan-300/20 bg-cyan-300/25 hover:bg-cyan-300/40';
};

const getBackupErrorMessage = (error: unknown) => (error instanceof Error ? error.message : '未知错误');

// 数据迁移：旧字段 -> 新字段
const migrateEntry = (entry: any): JournalEntry => {
  // 如果已是新格式，直接返回
  if ('focus' in entry || 'targets' in entry || 'tradePlan' in entry) {
    return entry as JournalEntry;
  }

  // 旧格式迁移到新格式
  return {
    date: entry.date || getToday(),
    status: entry.status || 'draft',
    marketPhase: entry.marketPhase || '',
    marketNotes: entry.marketNotes || '',
    focus: entry.hotThemes || '', // hotThemes -> focus
    targets: entry.targetStocks || '', // targetStocks -> targets
    tradePlan: [
      entry.buyPlan,
      entry.sellRules,
      entry.contingencyPlan
    ].filter(Boolean).join('\n'), // buyPlan/sellRules/contingencyPlan -> tradePlan
    dailySummary: entry.dailySummary || '',
    aiReview: entry.aiReview || '',
    aiUpdatedAt: entry.aiUpdatedAt || null,
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
};

const ProfilePage: React.FC = () => {
  const [entries, setEntries] = useState<Record<string, JournalEntry>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};

      const parsed = JSON.parse(raw);
      const migrated: Record<string, JournalEntry> = {};

      for (const date in parsed) {
        migrated[date] = migrateEntry(parsed[date]);
      }

      return migrated;
    } catch {
      return {};
    }
  });
  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => getMonthStart(getToday()));
  const [reviewLoading, setReviewLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');
  const [backupHandle, setBackupHandle] = useState<JournalBackupFileHandle | null>(null);
  const [backupFileName, setBackupFileName] = useState('');
  const [backupStatus, setBackupStatus] = useState<BackupStatus>(() =>
    isJournalFileBackupSupported() ? 'idle' : 'unsupported'
  );
  const [backupMessage, setBackupMessage] = useState(() =>
    isJournalFileBackupSupported()
      ? '绑定本地 JSON 文件后，每次修改都会自动同步。'
      : '当前浏览器不支持自动写入本地文件，仍会保存到浏览器本地。'
  );
  const datePickerRef = useRef<HTMLDivElement | null>(null);

  const syncJournalBackup = async (handle: JournalBackupFileHandle, requestPermission: boolean) => {
    try {
      setBackupStatus('syncing');

      const hasPermission = await ensureJournalBackupPermission(handle, requestPermission);

      if (!hasPermission) {
        setBackupStatus('permission-needed');
        setBackupMessage('浏览器需要你重新授权本地文件写入，请点击“立即同步/授权”。');
        return false;
      }

      const result = await writeJournalBackup(handle, entries, STORAGE_KEY);

      if (!result.ok) {
        setBackupStatus('permission-needed');
        setBackupMessage('浏览器需要你重新授权本地文件写入，请点击“立即同步/授权”。');
        return false;
      }

      setBackupStatus('synced');
      setBackupMessage(`已同步到 ${handle.name}，时间：${new Date().toLocaleTimeString('zh-CN')}`);
      return true;
    } catch (error) {
      setBackupStatus('error');
      setBackupMessage(`本地备份失败：${getBackupErrorMessage(error)}`);
      return false;
    }
  };

  useEffect(() => {
    let active = true;

    const loadBackupHandle = async () => {
      if (!isJournalFileBackupSupported()) {
        setBackupStatus('unsupported');
        setBackupMessage('当前浏览器不支持自动写入本地文件，仍会保存到浏览器本地。');
        return;
      }

      try {
        const storedHandle = await getStoredJournalBackupHandle();

        if (!active || !storedHandle) {
          return;
        }

        setBackupHandle(storedHandle);
        setBackupFileName(storedHandle.name);
        setBackupMessage(`已绑定本地备份文件：${storedHandle.name}`);
      } catch (error) {
        if (!active) {
          return;
        }

        setBackupStatus('error');
        setBackupMessage(`读取本地备份设置失败：${getBackupErrorMessage(error)}`);
      }
    };

    loadBackupHandle();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    setSaveState('saved');
    const timer = window.setTimeout(() => setSaveState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [entries]);

  useEffect(() => {
    setCalendarMonth(getMonthStart(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    if (!calendarOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!datePickerRef.current?.contains(event.target as Node)) {
        setCalendarOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [calendarOpen]);

  useEffect(() => {
    if (!backupHandle) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!cancelled) {
        await syncJournalBackup(backupHandle, false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [entries, backupHandle]);

  const heatmapDays = useMemo(() => buildJournalHeatmapDays(), []);
  const selectedEntry = entries[selectedDate] ?? createEmptyEntry(selectedDate);
  const completion = computeCompletion(selectedEntry);
  const selectedHasContent = hasJournalContent(entries[selectedDate]);
  const heatmapWrittenCount = useMemo(
    () => heatmapDays.filter((date) => hasJournalContent(entries[date])).length,
    [entries, heatmapDays]
  );
  const selectedDateObject = useMemo(() => parseJournalDate(selectedDate), [selectedDate]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const today = getToday();
  const selectedDateDisplay = selectedDate.replace(/-/g, '/');
  const selectedWeekday = selectedDateObject.toLocaleDateString('zh-CN', { weekday: 'long' });
  const calendarMonthLabel = calendarMonth.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });

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

  const handleBindBackupFile = async () => {
    if (!isJournalFileBackupSupported()) {
      setBackupStatus('unsupported');
      setBackupMessage('当前浏览器不支持自动写入本地文件，建议使用 Chrome 或 Edge。');
      return;
    }

    try {
      setBackupStatus('binding');
      setBackupMessage('请选择或创建一个 JSON 文件作为日记本地备份。');

      const handle = await createJournalBackupHandle();
      const hasPermission = await ensureJournalBackupPermission(handle, true);

      if (!hasPermission) {
        setBackupStatus('permission-needed');
        setBackupMessage('没有获得写入权限，暂时无法同步到本地文件。');
        return;
      }

      await persistJournalBackupHandle(handle);
      setBackupHandle(handle);
      setBackupFileName(handle.name);
      await syncJournalBackup(handle, false);
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') {
        setBackupStatus(backupHandle ? 'idle' : 'idle');
        setBackupMessage(backupHandle ? `继续使用当前备份文件：${backupHandle.name}` : '已取消选择本地备份文件。');
        return;
      }

      setBackupStatus('error');
      setBackupMessage(`绑定本地备份文件失败：${getBackupErrorMessage(error)}`);
    }
  };

  const handleManualBackupSync = async () => {
    if (!backupHandle) {
      await handleBindBackupFile();
      return;
    }

    await syncJournalBackup(backupHandle, true);
  };

  const handleGenerateReview = async () => {
    const entry = entries[selectedDate] ?? createEmptyEntry(selectedDate);
    setReviewLoading(true);

    try {
      const review = await generateJournalReview({
        date: entry.date,
        marketPhase: entry.marketPhase,
        positionPlan: '',
        marketNotes: entry.marketNotes,
        hotThemes: entry.focus,
        targetStocks: entry.targets,
        logicValidation: '',
        buyPlan: '',
        sellRules: '',
        contingencyPlan: '',
        tradePlan: entry.tradePlan,
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

  const backupBusy = backupStatus === 'binding' || backupStatus === 'syncing';

  return (
    <div className="mx-auto max-w-[1680px] px-6 py-6 text-white">
      <div className="grid items-start gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="sticky top-6 rounded-xl border border-white/10 bg-[#0d1015]">
          <div className="border-b border-white/10 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">Trading Journal</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">交易日记</h1>
            <p className="mt-2 text-sm leading-6 text-white/45">选择日期，填写复盘，保存在本地。</p>
          </div>

          <div ref={datePickerRef} className="relative px-4 py-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35">选择日期</label>
            <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] gap-2">
              <button
                type="button"
                aria-label="前一天"
                onClick={() => setSelectedDate(shiftJournalDate(selectedDate, -1))}
                className="flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-lg font-semibold text-white/70 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
              >
                ‹
              </button>
              <button
                type="button"
                aria-expanded={calendarOpen}
                onClick={() => {
                  if (!calendarOpen) {
                    setCalendarMonth(getMonthStart(selectedDate));
                  }
                  setCalendarOpen((open) => !open);
                }}
                className="min-w-0 rounded-lg border border-white/10 bg-[#11141b] px-3 py-2 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{selectedDateDisplay}</div>
                    <div className="mt-0.5 text-xs text-white/40">{selectedWeekday}</div>
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-sm font-semibold text-cyan-100">
                    ⌄
                  </div>
                </div>
              </button>
              <button
                type="button"
                aria-label="后一天"
                onClick={() => setSelectedDate(shiftJournalDate(selectedDate, 1))}
                className="flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-lg font-semibold text-white/70 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
              >
                ›
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(getToday())}
              className="mt-3 w-full rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
            >
              回到今天
            </button>

            {calendarOpen && (
              <div className="absolute left-4 right-4 top-[84px] z-20 rounded-xl border border-cyan-300/20 bg-[#10141b] p-3 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.95)]">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="上个月"
                    onClick={() =>
                      setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-base text-white/65 transition hover:border-cyan-300/30 hover:text-cyan-100"
                  >
                    ‹
                  </button>
                  <div className="text-sm font-semibold text-white">{calendarMonthLabel}</div>
                  <button
                    type="button"
                    aria-label="下个月"
                    onClick={() =>
                      setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-base text-white/65 transition hover:border-cyan-300/30 hover:text-cyan-100"
                  >
                    ›
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-white/35">
                  {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                    <div key={day} className="py-1">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="mt-1 grid grid-cols-7 gap-1">
                  {calendarDays.map((date) => {
                    const dateValue = formatJournalDate(date);
                    const isSelected = dateValue === selectedDate;
                    const isToday = dateValue === today;
                    const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();

                    return (
                      <button
                        key={dateValue}
                        type="button"
                        onClick={() => {
                          setSelectedDate(dateValue);
                          setCalendarOpen(false);
                        }}
                        className={`flex aspect-square items-center justify-center rounded-lg text-xs font-semibold transition ${
                          isSelected
                            ? 'bg-cyan-300 text-[#061116] shadow-[0_0_0_1px_rgba(103,232,249,0.35)]'
                            : isToday
                              ? 'border border-cyan-300/35 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15'
                              : isCurrentMonth
                                ? 'text-white/75 hover:bg-white/[0.07]'
                                : 'text-white/25 hover:bg-white/[0.04]'
                        }`}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(today);
                      setCalendarOpen(false);
                    }}
                    className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
                  >
                    今天
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarOpen(false)}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.07] hover:text-white/80"
                  >
                    收起
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">笔记热力图</div>
              <div className="text-xs font-semibold text-cyan-100/70">{heatmapWrittenCount} / 91 天</div>
            </div>

            <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-1.5">
                <div className="grid grid-rows-7 gap-[3px] text-[10px] font-semibold leading-none text-white/25">
                  {['一', '', '三', '', '五', '', '日'].map((day, index) => (
                    <div key={`${day}-${index}`} className="flex h-2.5 items-center">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-flow-col grid-rows-7 justify-start gap-[3px]">
                  {heatmapDays.map((date) => {
                    const entry = entries[date];
                    const written = hasJournalContent(entry);
                    const itemCompletion = entry ? computeCompletion(entry) : 0;
                    const active = date === selectedDate;
                    const label = written ? `已写 ${itemCompletion}%` : '未写';

                    return (
                      <button
                        key={date}
                        type="button"
                        title={`${date} · ${label}`}
                        aria-label={`${date} ${label}`}
                        onClick={() => setSelectedDate(date)}
                        className={`h-2.5 w-2.5 rounded-[2px] border transition ${getJournalHeatmapClass(entry)} ${
                          active ? 'ring-1 ring-cyan-200 ring-offset-1 ring-offset-[#0d1015]' : ''
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-white/35">
                <span>少</span>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-[2px] border border-white/[0.06] bg-white/[0.04]" />
                  <span className="h-2.5 w-2.5 rounded-[2px] border border-cyan-300/20 bg-cyan-300/25" />
                  <span className="h-2.5 w-2.5 rounded-[2px] border border-cyan-200/30 bg-cyan-300/60" />
                  <span className="h-2.5 w-2.5 rounded-[2px] border border-emerald-200/40 bg-emerald-300/80" />
                </div>
                <span>多</span>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{selectedDateDisplay}</div>
                  <div className="mt-1 text-xs text-white/40">
                    {selectedHasContent ? selectedEntry.marketPhase || '已写笔记，未填写阶段判断' : '这天还没写笔记'}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    selectedHasContent ? 'bg-cyan-300/10 text-cyan-100' : 'bg-white/[0.04] text-white/35'
                  }`}
                >
                  {selectedHasContent ? `${completion}%` : '空白'}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 px-4 py-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/35">本地文件备份</div>
            <p className="text-sm leading-6 text-white/45">
              第一次选择一个 JSON 文件，之后每次修改日记都会同步写入这个文件。
            </p>

            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30">Backup File</div>
              <div className="mt-1 truncate text-sm font-medium text-white/75">{backupFileName || '尚未绑定'}</div>
            </div>

            <button
              type="button"
              onClick={handleBindBackupFile}
              disabled={backupBusy || backupStatus === 'unsupported'}
              className="mt-3 w-full rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/30"
            >
              {backupStatus === 'binding' ? '选择中...' : backupHandle ? '更换备份文件' : '绑定本地备份文件'}
            </button>

            <button
              type="button"
              onClick={handleManualBackupSync}
              disabled={backupBusy || backupStatus === 'unsupported'}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:text-white/30"
            >
              {backupStatus === 'syncing' ? '同步中...' : backupHandle ? '立即同步/授权' : '选择并同步'}
            </button>

            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
                backupStatus === 'synced'
                  ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                  : backupStatus === 'error' || backupStatus === 'permission-needed'
                    ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
                    : 'border-white/10 bg-white/[0.03] text-white/45'
              }`}
            >
              {backupMessage}
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
        <section className="rounded-xl border border-white/10 bg-[#0d1015]">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Daily Review</div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{selectedDate}</h2>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/70">
                  完成度 {completion}%
                </div>
                <div className="text-xs text-white/35">{saveState === 'saved' ? '已保存' : '自动保存'}</div>
              </div>
            </div>
          </div>

          <div className="px-5 py-5">
            <div className="mb-4 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
              <div className="flex flex-col gap-4 xl:flex-row">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Daily Method</div>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">每日复盘写法</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    不知道写什么时，先按“事实 → 判断 → 明日动作”三步落笔。每天重点看下面 5 件事，写短一点也可以，但要能指导第二天怎么做。
                  </p>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {dailyReviewChecklist.map((item) => (
                      <div key={item} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm leading-6 text-white/70">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Example</div>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">一篇简短示例</h3>
                  <div className="mt-3 space-y-2">
                    {dailyReviewExample.map((item) => (
                      <div key={item.label} className="text-sm leading-6 text-white/70">
                        <span className="font-semibold text-cyan-100">{item.label}：</span>
                        {item.text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-white/10 bg-[#0d1015]/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">US Market Routine</div>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">美股复盘节奏</h3>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/60">
                    北京时间：夏令时 21:30-04:00 / 冬令时 22:30-05:00
                  </div>
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  {usMarketReviewRoutine.map((routine) => (
                    <div key={routine.title} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">{routine.title}</div>
                        <div className="shrink-0 text-xs font-medium text-cyan-100/80">{routine.timing}</div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {routine.points.map((point) => (
                          <div key={point} className="text-sm leading-6 text-white/60">
                            {point}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm leading-6 text-cyan-50/85">
                  核心原则：早上回答“昨晚我做对/做错了什么”；晚上回答“今晚什么条件下我才出手”。
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <label className="mb-2 block text-sm font-semibold text-white/85">市场阶段</label>
                <input
                  value={selectedEntry.marketPhase}
                  onChange={(event) => updateEntry({ marketPhase: event.target.value })}
                  placeholder="例如：发酵期 / 高潮期 / 退潮期 / 修复期 / 冰点"
                  className="w-full rounded-lg border border-white/10 bg-[#11141b] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-400/50"
                />
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {sectionFields.map((field) => (
                <div key={field.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <label className="mb-2 block text-sm font-semibold text-white/85">{field.label}</label>
                  <textarea
                    value={selectedEntry[field.key] as string}
                    onChange={(event) => updateEntry({ [field.key]: event.target.value } as Partial<JournalEntry>)}
                    placeholder={field.placeholder}
                    rows={field.rows ?? 4}
                    className="w-full resize-none rounded-lg border border-white/10 bg-[#11141b] px-3 py-2.5 text-sm leading-7 text-white outline-none transition placeholder:text-white/25 focus:border-cyan-400/50"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#0d1015]">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300/80">AI Review</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">评价与修正建议</h2>
            <p className="mt-2 text-sm leading-6 text-white/45">基于当日日记内容，检查逻辑漏洞、计划执行性和风险点。</p>
            <button
              type="button"
              onClick={handleGenerateReview}
              disabled={reviewLoading}
              className="mt-4 inline-flex items-center rounded-lg bg-cyan-400 px-3 py-2.5 text-sm font-semibold text-[#071319] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {reviewLoading ? 'AI 分析中...' : '生成 AI 评价'}
            </button>
          </div>

          <div className="px-5 py-5">
            {selectedEntry.aiReview ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/45">
                  {selectedEntry.aiUpdatedAt
                    ? `更新：${new Date(selectedEntry.aiUpdatedAt).toLocaleString('zh-CN')}`
                    : '尚无更新时间'}
                </div>
                <div className="rounded-lg border border-white/10 bg-[#11141b] p-4 text-sm leading-7 whitespace-pre-wrap text-white/85">
                  {selectedEntry.aiReview}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-center">
                <div className="text-base font-semibold text-white">还没有 AI 评价</div>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  先填写当日日记，再生成 AI 评价。结果会和这一天的记录一起保存在本地。
                </p>
              </div>
            )}
          </div>
        </section>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
