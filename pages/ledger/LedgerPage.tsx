import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  JournalEntryRecord,
  JournalTradeRecord,
  lockJournalPlan,
  saveJournalEntry,
  syncJournalEntries,
  unlockJournalPlan,
} from '../../services/journalApi';

type LedgerTab = 'overview' | 'stats' | 'bills' | 'assets' | 'journal' | 'report';
type Period = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';
type AssetType = 'cash' | 'investment' | 'fund' | 'realAsset' | 'receivable' | 'liability' | 'other';
type TransactionDirection = 'income' | 'expense' | 'transfer';
type ImportSource = '微信' | '支付宝' | '银行' | '证券' | '手工' | '其他';

type AssetRecord = {
  id: string;
  date: string;
  source: ImportSource;
  account: string;
  name: string;
  type: AssetType;
  value: number;
  liability: number;
  currency: string;
  note: string;
  importedAt: string;
};

type LedgerTransaction = {
  id: string;
  date: string;
  source: ImportSource;
  account: string;
  counterparty: string;
  category: string;
  amount: number;
  direction: TransactionDirection;
  memo: string;
  importedAt: string;
};

type LedgerState = {
  assets: AssetRecord[];
  transactions: LedgerTransaction[];
};

type JournalEntry = JournalEntryRecord;
type JournalSyncStatus = 'loading' | 'saved' | 'saving' | 'offline';
type JournalStage = 'pre' | 'execution' | 'post';

type NetWorthPoint = {
  date: string;
  label: string;
  value: number;
};

type ImportResult = {
  transactions: LedgerTransaction[];
  assets: AssetRecord[];
  message: string;
};

const LEDGER_STORAGE_KEY = 'personal_ledger_state_v1';
const JOURNAL_STORAGE_KEY = 'strategy_journal_entries_v1';
const OWNER_NAME = 'Henry';
const todayKey = () => new Date().toLocaleDateString('sv-SE');
const nowIso = () => new Date().toISOString();

const navItems: Array<{ id: LedgerTab; zh: string; en: string }> = [
  { id: 'overview', zh: '总览', en: 'Overview' },
  { id: 'stats', zh: '统计', en: 'Stats' },
  { id: 'bills', zh: '账单', en: 'Bills' },
  { id: 'assets', zh: '资产', en: 'Assets' },
  { id: 'journal', zh: '日记', en: 'Journal' },
  { id: 'report', zh: '报告', en: 'Report' },
];

const periodOptions: Array<{ id: Period; label: string }> = [
  { id: 'day', label: '日' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
  { id: 'quarter', label: '季' },
  { id: 'year', label: '年' },
  { id: 'all', label: '全部' },
];

const sourceOptions: ImportSource[] = ['微信', '支付宝', '银行', '证券', '手工', '其他'];

const assetTypeLabels: Record<AssetType, string> = {
  cash: '现金',
  investment: '股票/期权',
  fund: '基金/理财',
  realAsset: '实物资产',
  receivable: '应收',
  liability: '负债',
  other: '其他',
};

const assetTypeColors: Record<AssetType, string> = {
  cash: '#8fd3ff',
  investment: '#2f6ff2',
  fund: '#f5b84b',
  realAsset: '#a78bfa',
  receivable: '#34d399',
  liability: '#fb7185',
  other: '#94a3b8',
};

const reportRanges = [
  { id: 'month', label: '本月' },
  { id: 'quarter', label: '本季' },
  { id: 'year', label: '本年' },
  { id: 'all', label: '全部' },
] as const;

const premarketFields: Array<{ key: keyof JournalEntry; label: string; placeholder: string; rows: number }> = [
  {
    key: 'marketNotes',
    label: '大盘与情绪',
    placeholder: '指数方向、量能、涨跌停、主线强弱、市场阶段判断',
    rows: 5,
  },
  {
    key: 'focus',
    label: '主线与方向',
    placeholder: '今天最值得关注的 1-2 条主线、驱动逻辑、持续性判断',
    rows: 4,
  },
  {
    key: 'targets',
    label: '目标个股',
    placeholder: '龙头、中军、补涨、放弃观察的票，以及对应原因',
    rows: 4,
  },
  {
    key: 'tradePlan',
    label: '交易计划',
    placeholder: '买入条件、仓位、止盈止损、不同开盘情境下的应对',
    rows: 6,
  },
];

const postmarketFields: Array<{ key: keyof JournalEntry; label: string; placeholder: string; rows: number }> = [
  { key: 'marketOutcome', label: '市场实际走势', placeholder: '实际指数、量能、主线与盘前判断有哪些差异', rows: 4 },
  { key: 'dailySummary', label: '今日总结', placeholder: '今天发生了什么，最终盈亏与主要原因', rows: 4 },
  { key: 'planAdherence', label: '计划执行度', placeholder: '哪些交易按计划，哪些是临盘冲动；为什么偏离', rows: 4 },
  { key: 'lessons', label: '经验与错误', placeholder: '保留一个有效动作，指出一个关键错误', rows: 4 },
  { key: 'nextImprovement', label: '下一交易日只改一件事', placeholder: '写成可执行、可验证的一句话', rows: 3 },
];

const parseDateKey = (value: string) => {
  const cleaned = value.trim().replace(/[年月.]/g, '-').replace(/日/g, '').replace(/\//g, '-');
  const match = cleaned.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('sv-SE');
};

const toDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date: string, amount: number) => {
  const next = toDate(date);
  next.setDate(next.getDate() + amount);
  return next.toLocaleDateString('sv-SE');
};

const formatCurrency = (value: number, compact = false) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
  }).format(value);

const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const makeId = (prefix: string, value: string) => `${prefix}_${hashString(value)}`;

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[\s:：()（）\[\]【】{}"'`,，。._-]/g, '');

const parseMoney = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw === '-' || raw === '--') return null;
  const negativeByParen = /^\(.*\)$/.test(raw);
  const cleaned = raw
    .replace(/[￥¥元,\s]/g, '')
    .replace(/[^\d.+-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '+') return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negativeByParen ? -Math.abs(parsed) : parsed;
};

const detectDelimiter = (text: string) => {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  const semicolons = (sample.match(/;/g) || []).length;
  if (tabs >= commas && tabs >= semicolons) return '\t';
  if (semicolons > commas) return ';';
  return ',';
};

const parseDelimitedText = (text: string) => {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

const buildHeaderMap = (headers: string[]) => {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized && !map.has(normalized)) map.set(normalized, index);
  });
  return map;
};

const findCell = (row: string[], headerMap: Map<string, number>, aliases: string[]) => {
  for (const alias of aliases) {
    const index = headerMap.get(normalizeHeader(alias));
    if (index !== undefined && row[index] !== undefined) return row[index];
  }
  return '';
};

const knownHeaderAliases = [
  '日期',
  '交易时间',
  '交易创建时间',
  '记账日期',
  '发生日期',
  '金额',
  '交易金额',
  '余额',
  '账户',
  '资产名称',
  '资产类型',
  '收/支',
  '收入/支出',
  '交易对方',
  '商品名称',
  '备注',
];

const findHeaderIndex = (rows: string[][]) => {
  const normalizedAliases = new Set(knownHeaderAliases.map(normalizeHeader));
  let bestIndex = 0;
  let bestScore = -1;

  rows.slice(0, 20).forEach((row, index) => {
    const score = row.reduce((total, cell) => total + (normalizedAliases.has(normalizeHeader(cell)) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const inferCategory = (text: string) => {
  const target = text.toLowerCase();
  if (/工资|薪资|奖金|劳务|收入/.test(target)) return '收入';
  if (/餐|饭|咖啡|奶茶|外卖|美团|饿了么/.test(target)) return '餐饮';
  if (/地铁|公交|打车|滴滴|高铁|机票|加油|停车/.test(target)) return '交通';
  if (/房租|物业|水费|电费|燃气|宽带/.test(target)) return '居住';
  if (/医院|药|医保|体检/.test(target)) return '医疗';
  if (/基金|股票|证券|转入|转出|理财/.test(target)) return '投资';
  if (/京东|淘宝|天猫|拼多多|超市|便利店/.test(target)) return '购物';
  return '未分类';
};

const inferAssetType = (text: string): AssetType => {
  if (/现金|银行卡|银行|零钱|余额|活期|存款/.test(text)) return 'cash';
  if (/股票|证券|期权|美股|港股|a股|etf/.test(text.toLowerCase())) return 'investment';
  if (/基金|理财|债券|货币/.test(text)) return 'fund';
  if (/房|车|黄金|实物/.test(text)) return 'realAsset';
  if (/应收|借出/.test(text)) return 'receivable';
  if (/信用卡|花呗|白条|贷款|负债|借款/.test(text)) return 'liability';
  return 'other';
};

const inferDirection = (directionRaw: string, amount: number): TransactionDirection => {
  if (/不计|转账|转入|转出|还款|提现|充值/.test(directionRaw)) return 'transfer';
  if (/收入|收款|入账|贷方|转入/.test(directionRaw)) return 'income';
  if (/支出|付款|消费|借方|转出/.test(directionRaw)) return 'expense';
  return amount >= 0 ? 'income' : 'expense';
};

const normalizeSignedAmount = (amount: number, direction: TransactionDirection, directionRaw: string) => {
  if (direction === 'income') return Math.abs(amount);
  if (direction === 'expense') return -Math.abs(amount);
  if (/转出|提现|还款|付款/.test(directionRaw)) return -Math.abs(amount);
  if (/转入|充值|收款/.test(directionRaw)) return Math.abs(amount);
  return amount;
};

const readJsonArray = (text: string): unknown[] | null => {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.transactions)) return parsed.transactions;
    if (Array.isArray(parsed?.assets)) return parsed.assets;
    if (Array.isArray(parsed?.records)) return parsed.records;
    if (Array.isArray(parsed?.snapshots)) return parsed.snapshots;
    return null;
  } catch {
    return null;
  }
};

const parseTransactionsFromRows = (rows: string[][], source: ImportSource) => {
  const headerIndex = findHeaderIndex(rows);
  const headers = rows[headerIndex] || [];
  const headerMap = buildHeaderMap(headers);
  const importedAt = nowIso();

  return rows
    .slice(headerIndex + 1)
    .map((row) => {
      const dateRaw = findCell(row, headerMap, ['日期', '交易时间', '交易创建时间', '记账日期', '发生日期', '交易日期', '时间']);
      const date = parseDateKey(dateRaw);
      if (!date) return null;

      const directionRaw = findCell(row, headerMap, ['收/支', '收支', '收入/支出', '方向', '交易类型', '类型']);
      const incomeRaw = findCell(row, headerMap, ['收入', '收入金额', '贷方发生额', '存入']);
      const expenseRaw = findCell(row, headerMap, ['支出', '支出金额', '借方发生额', '取出']);
      const amountRaw =
        findCell(row, headerMap, ['金额', '金额元', '交易金额', '发生额', '人民币金额', '本币金额', 'amount']) ||
        incomeRaw ||
        expenseRaw;
      const parsedAmount = parseMoney(amountRaw);
      if (parsedAmount === null) return null;

      const counterparty =
        findCell(row, headerMap, ['交易对方', '对方', '商户', '商家名称', '付款方', '收款方', 'counterparty']) ||
        findCell(row, headerMap, ['商品名称', '摘要', '交易摘要', '说明', '用途']) ||
        source;
      const memo =
        findCell(row, headerMap, ['备注', '商品名称', '摘要', '交易摘要', '说明', '用途', 'memo']) || counterparty;
      const account = findCell(row, headerMap, ['账户', '付款方式', '收付款方式', '银行卡', '账号', 'account']) || source;
      const category = findCell(row, headerMap, ['分类', '交易分类', '类别', 'category']) || inferCategory(`${counterparty} ${memo}`);
      const direction = inferDirection(directionRaw || (incomeRaw ? '收入' : expenseRaw ? '支出' : ''), parsedAmount);
      const amount = normalizeSignedAmount(parsedAmount, direction, directionRaw);
      const key = `${date}|${source}|${account}|${counterparty}|${category}|${amount}|${memo}`;

      return {
        id: makeId('txn', key),
        date,
        source,
        account,
        counterparty,
        category,
        amount,
        direction,
        memo,
        importedAt,
      } satisfies LedgerTransaction;
    })
    .filter((item): item is LedgerTransaction => Boolean(item));
};

const parseAssetsFromRows = (rows: string[][], source: ImportSource) => {
  const headerIndex = findHeaderIndex(rows);
  const headers = rows[headerIndex] || [];
  const headerMap = buildHeaderMap(headers);
  const importedAt = nowIso();

  return rows
    .slice(headerIndex + 1)
    .map((row) => {
      const dateRaw = findCell(row, headerMap, ['日期', '快照日期', '净值日期', '统计日期', '交易日期', '记账日期', '时间']);
      const date = parseDateKey(dateRaw);
      if (!date) return null;

      const account = findCell(row, headerMap, ['账户', '账号', '平台', '机构', '付款方式', 'account']) || source;
      const name = findCell(row, headerMap, ['资产名称', '资产', '名称', '科目', '产品', '币种', 'name']) || account;
      const typeText = findCell(row, headerMap, ['资产类型', '类型', '分类', 'category']) || `${account}${name}`;
      const valueRaw = findCell(row, headerMap, [
        '金额',
        '资产金额',
        '市值',
        '净值',
        '余额',
        '账户余额',
        '当前价值',
        'value',
        'balance',
      ]);
      const liabilityRaw = findCell(row, headerMap, ['负债', '欠款', '贷款', 'liability', 'debt']) || '';
      const value = parseMoney(valueRaw);
      if (value === null) return null;
      const liability = parseMoney(liabilityRaw) ?? 0;
      const type = inferAssetType(typeText);
      const note = findCell(row, headerMap, ['备注', '说明', 'memo', 'note']) || '';
      const key = `${date}|${source}|${account}|${name}|${type}`;

      return {
        id: makeId('asset', key),
        date,
        source,
        account,
        name,
        type,
        value,
        liability,
        currency: findCell(row, headerMap, ['币种', 'currency']) || 'CNY',
        note,
        importedAt,
      } satisfies AssetRecord;
    })
    .filter((item): item is AssetRecord => Boolean(item));
};

const parseBalanceAssetsFromBillRows = (rows: string[][], source: ImportSource) => {
  const headerIndex = findHeaderIndex(rows);
  const headers = rows[headerIndex] || [];
  const headerMap = buildHeaderMap(headers);
  const importedAt = nowIso();

  return rows
    .slice(headerIndex + 1)
    .map((row) => {
      const balanceRaw = findCell(row, headerMap, ['余额', '账户余额', 'balance']);
      const balance = parseMoney(balanceRaw);
      if (balance === null) return null;
      const date = parseDateKey(
        findCell(row, headerMap, ['日期', '交易时间', '交易创建时间', '记账日期', '发生日期', '交易日期', '时间'])
      );
      if (!date) return null;
      const account = findCell(row, headerMap, ['账户', '付款方式', '收付款方式', '银行卡', '账号', 'account']) || source;
      const key = `${date}|${source}|${account}|账户余额`;
      return {
        id: makeId('asset', key),
        date,
        source,
        account,
        name: '账户余额',
        type: inferAssetType(account),
        value: balance,
        liability: 0,
        currency: 'CNY',
        note: '由账单余额列生成',
        importedAt,
      } satisfies AssetRecord;
    })
    .filter((item): item is AssetRecord => Boolean(item));
};

const normalizeJsonTransaction = (item: any, source: ImportSource): LedgerTransaction | null => {
  const date = parseDateKey(String(item.date || item.time || item.transactionTime || item['交易时间'] || item['日期'] || ''));
  const parsedAmount = parseMoney(item.amount ?? item.money ?? item['金额'] ?? item['交易金额']);
  if (!date || parsedAmount === null) return null;
  const directionRaw = String(item.direction || item.type || item['收/支'] || item['类型'] || '');
  const direction = inferDirection(directionRaw, parsedAmount);
  const account = String(item.account || item['账户'] || source);
  const counterparty = String(item.counterparty || item.merchant || item['交易对方'] || item['商品名称'] || source);
  const memo = String(item.memo || item.note || item['备注'] || item['摘要'] || counterparty);
  const category = String(item.category || item['分类'] || inferCategory(`${counterparty} ${memo}`));
  const amount = normalizeSignedAmount(parsedAmount, direction, directionRaw);
  const key = `${date}|${source}|${account}|${counterparty}|${category}|${amount}|${memo}`;
  return {
    id: makeId('txn', key),
    date,
    source,
    account,
    counterparty,
    category,
    amount,
    direction,
    memo,
    importedAt: nowIso(),
  };
};

const normalizeJsonAsset = (item: any, source: ImportSource): AssetRecord | null => {
  const date = parseDateKey(String(item.date || item.snapshotDate || item['日期'] || item['快照日期'] || ''));
  const value = parseMoney(item.value ?? item.balance ?? item.marketValue ?? item['金额'] ?? item['余额'] ?? item['市值']);
  if (!date || value === null) return null;
  const account = String(item.account || item.platform || item['账户'] || source);
  const name = String(item.name || item.asset || item.product || item['资产名称'] || account);
  const type = inferAssetType(String(item.type || item.category || item['资产类型'] || `${account}${name}`));
  const liability = parseMoney(item.liability ?? item.debt ?? item['负债']) ?? 0;
  const key = `${date}|${source}|${account}|${name}|${type}`;
  return {
    id: makeId('asset', key),
    date,
    source,
    account,
    name,
    type,
    value,
    liability,
    currency: String(item.currency || item['币种'] || 'CNY'),
    note: String(item.note || item.memo || item['备注'] || ''),
    importedAt: nowIso(),
  };
};

const importFileContent = (content: string, kind: 'transactions' | 'assets', source: ImportSource): ImportResult => {
  const jsonRows = readJsonArray(content);

  if (jsonRows) {
    const transactions = kind === 'transactions' ? jsonRows.map((item) => normalizeJsonTransaction(item, source)).filter(Boolean) : [];
    const assets = kind === 'assets' ? jsonRows.map((item) => normalizeJsonAsset(item, source)).filter(Boolean) : [];
    return {
      transactions: transactions as LedgerTransaction[],
      assets: assets as AssetRecord[],
      message: `已读取 JSON：${transactions.length} 条账单，${assets.length} 条资产记录`,
    };
  }

  const rows = parseDelimitedText(content);
  const transactions = kind === 'transactions' ? parseTransactionsFromRows(rows, source) : [];
  const assets =
    kind === 'assets'
      ? parseAssetsFromRows(rows, source)
      : parseBalanceAssetsFromBillRows(rows, source);

  return {
    transactions,
    assets,
    message: `已读取文件：${transactions.length} 条账单，${assets.length} 条资产记录`,
  };
};

const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) => {
  const map = new Map<string, T>();
  current.forEach((item) => map.set(item.id, item));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()];
};

const createSeedLedgerState = (): LedgerState => {
  const assets: AssetRecord[] = [];
  const transactions: LedgerTransaction[] = [];
  const start = new Date(2024, 6, 1);
  const end = toDate(todayKey());
  let index = 0;

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 7)) {
    const date = cursor.toLocaleDateString('sv-SE');
    const progress = index / 100;
    const growth = 18000 + index * 6200 + Math.pow(Math.max(progress - 0.25, 0), 2.3) * 460000;
    const wave = Math.sin(index / 3.2) * 16000 + Math.cos(index / 7) * 9000;
    const total = Math.max(11000, growth + wave);
    const cash = Math.max(8000, total * (0.17 + Math.sin(index / 11) * 0.025));
    const fund = total * (0.12 + Math.cos(index / 9) * 0.018);
    const investment = total - cash - fund + (index > 55 ? Math.sin(index / 2.1) * 42000 : 0);
    const liability = index % 5 === 0 ? 2600 + (index % 3) * 900 : 1300;

    [
      ['招商银行', '活期余额', 'cash', cash, 0],
      ['支付宝', '余额宝', 'fund', fund, 0],
      ['证券账户', '股票组合', 'investment', investment, 0],
      ['信用卡', '信用卡待还', 'liability', 0, liability],
    ].forEach(([account, name, type, value, debt]) => {
      const key = `${date}|示例|${account}|${name}`;
      assets.push({
        id: makeId('asset', key),
        date,
        source: '其他',
        account: String(account),
        name: String(name),
        type: type as AssetType,
        value: Number(value),
        liability: Number(debt),
        currency: 'CNY',
        note: '示例数据，可导入真实数据覆盖',
        importedAt: nowIso(),
      });
    });

    index += 1;
  }

  const billSeeds = [
    ['2026-06-01', '招商银行', '工资', '收入', 42000, '工资入账'],
    ['2026-06-02', '支付宝', '房租', '居住', -8500, '房租'],
    ['2026-06-03', '微信', '餐饮', '餐饮', -128, '工作餐'],
    ['2026-06-05', '支付宝', '基金申购', '投资', -6000, '定投'],
    ['2026-06-08', '微信', '交通', '交通', -76, '打车'],
    ['2026-06-11', '银行', '奖金', '收入', 12000, '项目奖金'],
    ['2026-06-14', '支付宝', '购物', '购物', -1890, '数码配件'],
  ];

  billSeeds.forEach(([date, source, counterparty, category, amount, memo]) => {
    const key = `${date}|${source}|${counterparty}|${amount}|${memo}`;
    transactions.push({
      id: makeId('txn', key),
      date: String(date),
      source: source as ImportSource,
      account: String(source),
      counterparty: String(counterparty),
      category: String(category),
      amount: Number(amount),
      direction: Number(amount) >= 0 ? 'income' : 'expense',
      memo: String(memo),
      importedAt: nowIso(),
    });
  });

  return { assets, transactions };
};

const loadLedgerState = (): LedgerState => {
  try {
    const raw = localStorage.getItem(LEDGER_STORAGE_KEY);
    if (!raw) return createSeedLedgerState();
    const parsed = JSON.parse(raw);
    return {
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    };
  } catch {
    return createSeedLedgerState();
  }
};

const createEmptyJournalEntry = (date: string): JournalEntry => ({
  date,
  status: 'draft',
  marketPhase: '',
  marketNotes: '',
  focus: '',
  targets: '',
  tradePlan: '',
  maxDailyLossPct: '',
  marketOutcome: '',
  executionNotes: '',
  dailySummary: '',
  planAdherence: '',
  lessons: '',
  nextImprovement: '',
  postmarketCompletedAt: null,
  trades: [],
  planIsLocked: false,
  planLockedAt: null,
  planRevision: 0,
  planHistory: [],
  aiReview: '',
  aiUpdatedAt: null,
  updatedAt: nowIso(),
});

const migrateJournalEntry = (entry: any, date: string): JournalEntry => {
  if (!entry || typeof entry !== 'object') return createEmptyJournalEntry(date);
  return {
    date: entry.date || date,
    status: entry.status === 'completed' ? 'completed' : 'draft',
    marketPhase: entry.marketPhase || '',
    marketNotes: entry.marketNotes || '',
    focus: entry.focus || entry.hotThemes || '',
    targets: entry.targets || entry.targetStocks || '',
    tradePlan:
      entry.tradePlan ||
      [entry.buyPlan, entry.sellRules, entry.contingencyPlan].filter(Boolean).join('\n') ||
      '',
    maxDailyLossPct: entry.maxDailyLossPct == null ? '' : String(entry.maxDailyLossPct),
    marketOutcome: entry.marketOutcome || '',
    executionNotes: entry.executionNotes || '',
    dailySummary: entry.dailySummary || '',
    planAdherence: entry.planAdherence || '',
    lessons: entry.lessons || '',
    nextImprovement: entry.nextImprovement || '',
    postmarketCompletedAt: entry.postmarketCompletedAt || null,
    trades: Array.isArray(entry.trades) ? entry.trades : [],
    planIsLocked: Boolean(entry.planIsLocked),
    planLockedAt: entry.planLockedAt || null,
    planRevision: Number(entry.planRevision || 0),
    planHistory: Array.isArray(entry.planHistory) ? entry.planHistory : [],
    aiReview: entry.aiReview || '',
    aiUpdatedAt: entry.aiUpdatedAt || null,
    updatedAt: entry.updatedAt || nowIso(),
  };
};

const loadJournalEntries = () => {
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(parsed).map(([date, entry]) => [date, migrateJournalEntry(entry, date)])
    ) as Record<string, JournalEntry>;
  } catch {
    return {};
  }
};

const computeJournalCompletion = (entry: JournalEntry) => {
  const fields: Array<keyof JournalEntry> = [
    'marketPhase', 'marketNotes', 'focus', 'targets', 'tradePlan',
    'marketOutcome', 'dailySummary', 'planAdherence', 'lessons', 'nextImprovement',
  ];
  const done = fields.filter((field) => String(entry[field] || '').trim()).length;
  const tradeCredit = entry.trades.length > 0 ? 1 : 0;
  return Math.round(((done + tradeCredit) / (fields.length + 1)) * 100);
};

const buildNetWorthSeries = (assets: AssetRecord[]) => {
  if (assets.length === 0) return [];
  const sorted = [...assets].sort((a, b) => a.date.localeCompare(b.date) || a.importedAt.localeCompare(b.importedAt));
  const firstDate = sorted[0].date;
  const finalDate = sorted.reduce((latest, item) => (item.date > latest ? item.date : latest), todayKey());
  const byDate = new Map<string, AssetRecord[]>();
  sorted.forEach((item) => {
    byDate.set(item.date, [...(byDate.get(item.date) || []), item]);
  });

  const latestByAsset = new Map<string, number>();
  const series: NetWorthPoint[] = [];

  for (let date = firstDate; date <= finalDate; date = addDays(date, 1)) {
    const records = byDate.get(date) || [];
    records.forEach((record) => {
      const key = `${record.source}|${record.account}|${record.name}`;
      const netValue = record.type === 'liability' ? -Math.abs(record.liability || record.value) : record.value - record.liability;
      latestByAsset.set(key, netValue);
    });

    const value = [...latestByAsset.values()].reduce((total, item) => total + item, 0);
    series.push({
      date,
      label: date.slice(5).replace('-', '/'),
      value,
    });
  }

  return series;
};

const groupSeriesByPeriod = (series: NetWorthPoint[], period: Period) => {
  const getBucket = (date: string) => {
    const parsed = toDate(date);
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    if (period === 'week') {
      const weekStart = new Date(parsed);
      weekStart.setDate(parsed.getDate() - ((parsed.getDay() + 6) % 7));
      return weekStart.toLocaleDateString('sv-SE');
    }
    if (period === 'month' || period === 'all') return `${year}-${String(month).padStart(2, '0')}`;
    if (period === 'quarter') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    if (period === 'year') return String(year);
    return date;
  };

  const labelBucket = (bucket: string) => {
    if (period === 'week') return `${bucket.slice(5).replace('-', '/')}`;
    if (period === 'month' || period === 'all') return bucket.replace('-', '/');
    return bucket;
  };

  if (period === 'day') return series.slice(-45);

  const grouped = new Map<string, NetWorthPoint>();
  series.forEach((point) => {
    const bucket = getBucket(point.date);
    grouped.set(bucket, {
      ...point,
      label: labelBucket(bucket),
    });
  });

  const result = [...grouped.values()];
  if (period === 'week') return result.slice(-32);
  if (period === 'month') return result.slice(-18);
  if (period === 'quarter') return result.slice(-12);
  if (period === 'year') return result.slice(-8);
  return result;
};

const getLatestAssetPositions = (assets: AssetRecord[]) => {
  const map = new Map<string, AssetRecord>();
  [...assets]
    .sort((a, b) => a.date.localeCompare(b.date) || a.importedAt.localeCompare(b.importedAt))
    .forEach((record) => {
      map.set(`${record.source}|${record.account}|${record.name}`, record);
    });
  return [...map.values()].sort((a, b) => (b.value - b.liability) - (a.value - a.liability));
};

const sumTransactions = (transactions: LedgerTransaction[], direction: TransactionDirection) =>
  transactions
    .filter((item) => item.direction === direction)
    .reduce((total, item) => total + Math.abs(item.amount), 0);

const buildMonthlyCashflow = (transactions: LedgerTransaction[]) => {
  const grouped = new Map<string, { month: string; income: number; expense: number }>();
  transactions.forEach((item) => {
    const month = item.date.slice(0, 7);
    const row = grouped.get(month) || { month, income: 0, expense: 0 };
    if (item.direction === 'income') row.income += Math.abs(item.amount);
    if (item.direction === 'expense') row.expense += Math.abs(item.amount);
    grouped.set(month, row);
  });
  return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-8);
};

const buildCategorySpending = (transactions: LedgerTransaction[]) => {
  const grouped = new Map<string, number>();
  transactions
    .filter((item) => item.direction === 'expense')
    .forEach((item) => grouped.set(item.category, (grouped.get(item.category) || 0) + Math.abs(item.amount)));
  return [...grouped.entries()]
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
};

const getRangeStart = (range: (typeof reportRanges)[number]['id']) => {
  const now = new Date();
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('sv-SE');
  if (range === 'quarter') {
    const quarterStart = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), quarterStart, 1).toLocaleDateString('sv-SE');
  }
  if (range === 'year') return new Date(now.getFullYear(), 0, 1).toLocaleDateString('sv-SE');
  return '0000-01-01';
};

const buildReport = (
  range: (typeof reportRanges)[number]['id'],
  series: NetWorthPoint[],
  transactions: LedgerTransaction[],
  latestAssets: AssetRecord[]
) => {
  const start = getRangeStart(range);
  const rangeSeries = series.filter((item) => item.date >= start);
  const startPoint = rangeSeries[0] || series[0];
  const endPoint = rangeSeries.at(-1) || series.at(-1);
  const rangeTransactions = transactions.filter((item) => item.date >= start);
  const income = sumTransactions(rangeTransactions, 'income');
  const expense = sumTransactions(rangeTransactions, 'expense');
  const cashflow = income - expense;
  const change = endPoint && startPoint ? endPoint.value - startPoint.value : 0;
  const changePercent = startPoint && startPoint.value !== 0 ? (change / startPoint.value) * 100 : 0;
  const topCategory = buildCategorySpending(rangeTransactions)[0];
  const topAsset = latestAssets[0];
  const staleAssets = latestAssets.filter((item) => item.date < addDays(todayKey(), -10));

  return [
    `# ${OWNER_NAME} 个人资产报告 ${todayKey()}`,
    '',
    `净资产：${endPoint ? formatCurrency(endPoint.value) : '暂无数据'}`,
    `区间变化：${formatCurrency(change)}（${formatPercent(changePercent)}）`,
    `账单现金流：收入 ${formatCurrency(income)}，支出 ${formatCurrency(expense)}，净流入 ${formatCurrency(cashflow)}`,
    topCategory ? `最大支出分类：${topCategory.category}，${formatCurrency(topCategory.value)}` : '最大支出分类：暂无',
    topAsset ? `最大资产项：${topAsset.account} / ${topAsset.name}，${formatCurrency(topAsset.value - topAsset.liability)}` : '最大资产项：暂无',
    `数据新鲜度：${staleAssets.length === 0 ? '资产快照都在 10 天内' : `${staleAssets.length} 个资产项超过 10 天未更新`}`,
    '',
    '## 建议节奏',
    '- 投资账户：交易日收盘后或每周五晚上更新一次。',
    '- 银行/微信/支付宝账单：每月 1-3 日导入上月账单。',
    '- 工资、房租、大额转账、证券入金出金：发生当天补一条资产快照。',
  ].join('\n');
};

const StatTile: React.FC<{ label: string; value: string; hint?: string; tone?: 'blue' | 'green' | 'rose' | 'gold' }> = ({
  label,
  value,
  hint,
  tone = 'blue',
}) => {
  const toneClass = {
    blue: 'border-sky-300/20 bg-[linear-gradient(135deg,rgba(56,189,248,0.12),rgba(12,18,28,0.78))] text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
    green: 'border-emerald-300/20 bg-[linear-gradient(135deg,rgba(52,211,153,0.12),rgba(12,18,28,0.78))] text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
    rose: 'border-rose-300/20 bg-[linear-gradient(135deg,rgba(251,113,133,0.12),rgba(12,18,28,0.78))] text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
    gold: 'border-amber-300/20 bg-[linear-gradient(135deg,rgba(245,184,75,0.14),rgba(12,18,28,0.78))] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
  }[tone];

  return (
    <div className={`relative overflow-hidden rounded-lg border px-4 py-3 ${toneClass}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/18" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-55">{label}</div>
      <div className="mt-2 break-words text-xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs leading-5 opacity-55">{hint}</div>}
    </div>
  );
};

const EmptyChart: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.03] text-sm text-white/45">
    {label}
  </div>
);

const LedgerPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LedgerTab>(() => {
    const hash = window.location.hash.replace('#/', '');
    return navItems.some((item) => item.id === hash) ? (hash as LedgerTab) : 'overview';
  });
  const [period, setPeriod] = useState<Period>('all');
  const [state, setState] = useState<LedgerState>(loadLedgerState);
  const [journalEntries, setJournalEntries] = useState<Record<string, JournalEntry>>(loadJournalEntries);
  const [journalSyncStatus, setJournalSyncStatus] = useState<JournalSyncStatus>('loading');
  const journalSyncReady = useRef(false);
  const journalSaveTimers = useRef<Record<string, number>>({});
  const pendingJournalEntries = useRef<Record<string, JournalEntry>>({});
  const [selectedJournalDate, setSelectedJournalDate] = useState(todayKey());
  const [journalStage, setJournalStage] = useState<JournalStage>('pre');
  const [billSource, setBillSource] = useState<ImportSource>('微信');
  const [assetSource, setAssetSource] = useState<ImportSource>('手工');
  const [importStatus, setImportStatus] = useState('等待导入真实数据');
  const [reportRange, setReportRange] = useState<(typeof reportRanges)[number]['id']>('month');
  const [manualAsset, setManualAsset] = useState({
    date: todayKey(),
    account: '',
    name: '',
    type: 'cash' as AssetType,
    value: '',
    liability: '',
    note: '',
  });

  useEffect(() => {
    document.title = `${OWNER_NAME} Ledger · 个人资产账本`;
  }, []);

  useEffect(() => {
    const syncTabWithHash = () => {
      const hash = window.location.hash.replace('#/', '').split('?')[0];
      if (navItems.some((item) => item.id === hash)) {
        setActiveTab(hash as LedgerTab);
      }
    };

    window.addEventListener('hashchange', syncTabWithHash);
    syncTabWithHash();
    return () => window.removeEventListener('hashchange', syncTabWithHash);
  }, []);

  useEffect(() => {
    window.history.replaceState(null, '', `#/${activeTab}`);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journalEntries));
  }, [journalEntries]);

  useEffect(() => {
    let cancelled = false;
    const localEntries = Object.values(loadJournalEntries());

    syncJournalEntries(localEntries)
      .then((entries) => {
        if (cancelled) return;
        const merged = Object.fromEntries(entries.map((entry) => [entry.date, entry])) as Record<string, JournalEntry>;
        const pending = Object.values(pendingJournalEntries.current);
        pending.forEach((entry) => {
          const remote = merged[entry.date];
          if (!remote || entry.updatedAt >= remote.updatedAt) merged[entry.date] = entry;
        });
        setJournalEntries(merged);
        journalSyncReady.current = true;

        if (pending.length === 0) {
          setJournalSyncStatus('saved');
          return;
        }
        setJournalSyncStatus('saving');
        Promise.all(pending.map(saveJournalEntry))
          .then(() => {
            pendingJournalEntries.current = {};
            if (!cancelled) setJournalSyncStatus('saved');
          })
          .catch(() => {
            if (!cancelled) setJournalSyncStatus('offline');
          });
      })
      .catch(() => {
        if (!cancelled) {
          journalSyncReady.current = true;
          setJournalSyncStatus('offline');
        }
      });

    return () => {
      cancelled = true;
      Object.values(journalSaveTimers.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const netWorthSeries = useMemo(() => buildNetWorthSeries(state.assets), [state.assets]);
  const chartSeries = useMemo(() => groupSeriesByPeriod(netWorthSeries, period), [netWorthSeries, period]);
  const latestAssets = useMemo(() => getLatestAssetPositions(state.assets), [state.assets]);
  const latestNetWorth = netWorthSeries.at(-1)?.value || 0;
  const firstChartValue = chartSeries[0]?.value || 0;
  const latestChartValue = chartSeries.at(-1)?.value || 0;
  const periodChange = latestChartValue - firstChartValue;
  const periodChangePercent = firstChartValue ? (periodChange / firstChartValue) * 100 : 0;
  const monthlyCashflow = useMemo(() => buildMonthlyCashflow(state.transactions), [state.transactions]);
  const categorySpending = useMemo(() => buildCategorySpending(state.transactions), [state.transactions]);
  const totalIncome = useMemo(() => sumTransactions(state.transactions, 'income'), [state.transactions]);
  const totalExpense = useMemo(() => sumTransactions(state.transactions, 'expense'), [state.transactions]);
  const reportText = useMemo(
    () => buildReport(reportRange, netWorthSeries, state.transactions, latestAssets),
    [latestAssets, netWorthSeries, reportRange, state.transactions]
  );

  const latestAssetValueByType = useMemo(() => {
    const grouped = new Map<AssetType, number>();
    latestAssets.forEach((asset) => {
      const value = asset.type === 'liability' ? -Math.abs(asset.liability || asset.value) : asset.value - asset.liability;
      grouped.set(asset.type, (grouped.get(asset.type) || 0) + value);
    });
    return [...grouped.entries()]
      .map(([type, value]) => ({
        type,
        label: assetTypeLabels[type],
        value: Math.abs(value),
        signedValue: value,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [latestAssets]);

  const selectedJournalEntry = journalEntries[selectedJournalDate] || createEmptyJournalEntry(selectedJournalDate);
  const journalCompletion = computeJournalCompletion(selectedJournalEntry);

  const handleImport = async (file: File | null, kind: 'transactions' | 'assets', source: ImportSource) => {
    if (!file) return;
    const content = await file.text();
    const result = importFileContent(content, kind, source);

    setState((current) => ({
      assets: mergeById(current.assets, result.assets),
      transactions: mergeById(current.transactions, result.transactions),
    }));

    setImportStatus(`${file.name}：${result.message}`);
  };

  const addManualAsset = () => {
    const date = parseDateKey(manualAsset.date);
    const value = parseMoney(manualAsset.value);
    const liability = parseMoney(manualAsset.liability) ?? 0;
    if (!date || !manualAsset.account.trim() || !manualAsset.name.trim() || value === null) {
      setImportStatus('手工资产缺少日期、账户、名称或金额');
      return;
    }

    const key = `${date}|手工|${manualAsset.account}|${manualAsset.name}|${manualAsset.type}`;
    const record: AssetRecord = {
      id: makeId('asset', key),
      date,
      source: '手工',
      account: manualAsset.account.trim(),
      name: manualAsset.name.trim(),
      type: manualAsset.type,
      value,
      liability,
      currency: 'CNY',
      note: manualAsset.note.trim(),
      importedAt: nowIso(),
    };

    setState((current) => ({
      ...current,
      assets: mergeById(current.assets, [record]),
    }));
    setManualAsset({ date: todayKey(), account: '', name: '', type: 'cash', value: '', liability: '', note: '' });
    setImportStatus('已新增一条资产快照');
  };

  const updateJournalEntry = (patch: Partial<JournalEntry>) => {
    setJournalEntries((current) => {
      const base = current[selectedJournalDate] || createEmptyJournalEntry(selectedJournalDate);
      const next = {
        ...base,
        ...patch,
        updatedAt: nowIso(),
      };
      next.status = next.postmarketCompletedAt ? 'completed' : 'draft';

      if (journalSyncReady.current) {
        window.clearTimeout(journalSaveTimers.current[selectedJournalDate]);
        setJournalSyncStatus('saving');
        journalSaveTimers.current[selectedJournalDate] = window.setTimeout(() => {
          saveJournalEntry(next)
            .then(() => setJournalSyncStatus('saved'))
            .catch(() => setJournalSyncStatus('offline'));
        }, 700);
      } else {
        pendingJournalEntries.current[selectedJournalDate] = next;
      }

      return {
        ...current,
        [selectedJournalDate]: next,
      };
    });
  };

  const replaceJournalEntry = (entry: JournalEntry) => {
    setJournalEntries((current) => ({ ...current, [entry.date]: entry }));
    pendingJournalEntries.current[entry.date] = entry;
  };

  const handlePlanLock = async () => {
    const entry = { ...selectedJournalEntry, updatedAt: nowIso() };
    window.clearTimeout(journalSaveTimers.current[selectedJournalDate]);
    setJournalSyncStatus('saving');
    try {
      const saved = await lockJournalPlan(entry);
      replaceJournalEntry(saved);
      delete pendingJournalEntries.current[saved.date];
      setJournalSyncStatus('saved');
      setJournalStage('execution');
    } catch {
      setJournalSyncStatus('offline');
    }
  };

  const handlePlanUnlock = async () => {
    setJournalSyncStatus('saving');
    try {
      const saved = await unlockJournalPlan(selectedJournalDate);
      replaceJournalEntry(saved);
      delete pendingJournalEntries.current[saved.date];
      setJournalSyncStatus('saved');
    } catch {
      setJournalSyncStatus('offline');
    }
  };

  const addJournalTrade = () => {
    const trade: JournalTradeRecord = {
      id: crypto.randomUUID(), symbol: '', side: 'buy', executedAt: null,
      price: '', quantity: '', planned: true, note: '',
    };
    updateJournalEntry({ trades: [...selectedJournalEntry.trades, trade] });
  };

  const updateJournalTrade = (id: string, patch: Partial<JournalTradeRecord>) => {
    updateJournalEntry({
      trades: selectedJournalEntry.trades.map((trade) => trade.id === id ? { ...trade, ...patch } : trade),
    });
  };

  const removeJournalTrade = (id: string) => {
    updateJournalEntry({ trades: selectedJournalEntry.trades.filter((trade) => trade.id !== id) });
  };

  const completePostmarketReview = () => {
    updateJournalEntry({ postmarketCompletedAt: nowIso(), status: 'completed' });
  };

  const downloadReport = () => {
    const blob = new Blob([reportText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledger-report-${todayKey()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyReport = async () => {
    await navigator.clipboard.writeText(reportText);
    setImportStatus('报告已复制到剪贴板');
  };

  const resetDemoData = () => {
    if (!window.confirm('这会用示例资产和账单覆盖当前账本数据，确定继续吗？')) return;
    setState(createSeedLedgerState());
    setImportStatus('已恢复示例数据');
  };

  const clearLedgerData = () => {
    if (!window.confirm('这会清空资产和账单数据，交易日记不会删除，确定继续吗？')) return;
    setState({ assets: [], transactions: [] });
    setImportStatus('已清空资产和账单数据');
  };

  const renderImportPanel = (kind: 'transactions' | 'assets') => {
    const source = kind === 'transactions' ? billSource : assetSource;
    const setSource = kind === 'transactions' ? setBillSource : setAssetSource;
    const label = kind === 'transactions' ? '导入账单' : '导入资产快照';
    return (
      <div className="rounded-lg border border-white/10 bg-[#0f141b] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/55">Import</div>
            <h3 className="mt-1 text-lg font-semibold text-white">{label}</h3>
          </div>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as ImportSource)}
            className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-white outline-none"
          >
            {sourceOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <label className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-sky-300/25 bg-sky-300/[0.04] px-4 text-center text-sm text-sky-100 transition hover:bg-sky-300/[0.07]">
          <span className="font-semibold">选择 CSV / TXT / JSON 文件</span>
          <span className="mt-1 text-xs text-white/40">
            {kind === 'transactions' ? '支持微信、支付宝、银行流水常见字段' : '字段可包含日期、账户、资产名称、金额、负债'}
          </span>
          <input
            type="file"
            accept=".csv,.txt,.json"
            className="hidden"
            onChange={(event) => {
              void handleImport(event.target.files?.[0] || null, kind, source);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>
    );
  };

  const renderOverview = () => (
    <div className="space-y-5">
      <section className="relative min-h-[360px] overflow-hidden rounded-lg border border-sky-300/15 bg-[radial-gradient(circle_at_12%_10%,rgba(96,165,250,0.24),transparent_32%),radial-gradient(circle_at_72%_18%,rgba(245,184,75,0.16),transparent_26%),linear-gradient(145deg,#101926_0%,#08111b_48%,#03070d_100%)] px-5 py-8 shadow-[0_28px_90px_-52px_rgba(56,189,248,0.55)] lg:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 rounded-full border border-amber-300/20" />
        <div className="pointer-events-none absolute right-8 top-8 hidden h-40 w-40 rounded-full border border-sky-200/10 lg:block" />

        <div className="absolute right-7 top-7 hidden w-[390px] overflow-hidden rounded-lg border border-amber-300/35 bg-[linear-gradient(135deg,#f8c846_0%,#2b1707_42%,#050505_100%)] p-4 shadow-[0_0_52px_rgba(245,184,75,0.20)] lg:block">
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.32),transparent_18%),linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.22)_42%,transparent_44%)]" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-24 w-36 items-end gap-2 rounded-md border border-black/30 bg-[linear-gradient(180deg,#ffd957,#d1911e)] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.26)]">
              {[22, 34, 48, 62, 76, 92].map((height) => (
                <span key={height} className="w-3 rounded-sm bg-[#2d1908]" style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="min-w-0">
              <div className="ledger-display text-2xl font-black text-white">第一桶金</div>
              <p className="mt-2 text-xs leading-5 text-amber-50/75">资产曲线进入可复盘阶段</p>
              <div className="mt-3 inline-flex rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-amber-200">
                净资产 {formatCurrency(latestNetWorth, true)}
              </div>
            </div>
          </div>
        </div>

        <div className="relative max-w-4xl">
          <div className="text-[12px] font-semibold uppercase tracking-[0.32em] text-sky-200/65">
            {OWNER_NAME} Ledger · 截至 {todayKey()}
          </div>
          <h1 className="ledger-display mt-7 max-w-[860px] text-5xl font-black tracking-tight text-sky-50 md:text-7xl">
            {formatCurrency(latestNetWorth)}
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-sky-300/20 bg-sky-300/[0.08] px-3 py-1.5 text-sm font-semibold text-sky-100">
              {periodChange >= 0 ? '▲' : '▼'} 较区间起点 {formatCurrency(periodChange)} · {formatPercent(periodChangePercent)}
            </div>
            <div className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1.5 text-sm font-semibold text-amber-100">
              {state.assets.length} 条资产快照
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <StatTile label="资产项" value={`${latestAssets.length}`} hint="按最新快照计算" />
        <StatTile label="账单收入" value={formatCurrency(totalIncome, true)} tone="green" />
        <StatTile label="账单支出" value={formatCurrency(totalExpense, true)} tone="rose" />
        <StatTile label="导入状态" value={state.assets.length || state.transactions.length ? '已建档' : '待导入'} hint={importStatus} tone="gold" />
      </section>

      <section className="rounded-lg border border-white/10 bg-[linear-gradient(180deg,#101720_0%,#0b1119_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">01 财富增长 · 全部 · 日期粒度</div>
            <h2 className="mt-1 text-xl font-semibold text-white">净资产增长 {formatCurrency(periodChange, true)}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPeriod(item.id)}
                className={`h-9 min-w-10 rounded-md border px-3 text-sm font-semibold transition ${
                  period === item.id
                    ? 'border-sky-300 bg-sky-300 text-[#06111c]'
                    : 'border-white/10 bg-white/[0.03] text-white/55 hover:border-sky-300/40 hover:text-sky-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 h-[420px]">
          {chartSeries.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartSeries} margin={{ top: 20, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2f6ff2" stopOpacity={0.42} />
                    <stop offset="95%" stopColor="#2f6ff2" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 5" />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.38)" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis stroke="rgba(255,255,255,0.38)" tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(Number(value), true)} width={72} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), '净资产']}
                  labelClassName="text-slate-900"
                  contentStyle={{ border: '1px solid rgba(148,163,184,0.28)', borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="value" stroke="#6fb6ff" strokeWidth={3} fill="url(#netWorthFill)" dot={false} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="导入资产快照后生成净资产曲线" />
          )}
        </div>
      </section>
    </div>
  );

  const renderStats = () => (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-lg border border-white/10 bg-[#0f141b] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Asset Mix</div>
            <h2 className="mt-1 text-xl font-semibold text-white">资产结构</h2>
          </div>
          <div className="text-right text-sm text-white/45">最新快照 {latestAssets[0]?.date || '暂无'}</div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="h-[300px]">
            {latestAssetValueByType.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={latestAssetValueByType} dataKey="value" nameKey="label" innerRadius={70} outerRadius={118} paddingAngle={3}>
                    {latestAssetValueByType.map((item) => (
                      <Cell key={item.type} fill={assetTypeColors[item.type]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [formatCurrency(Number(value)), '金额']} contentStyle={{ borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label="暂无资产结构" />
            )}
          </div>
          <div className="space-y-2">
            {latestAssetValueByType.map((item) => (
              <div key={item.type} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: assetTypeColors[item.type] }} />
                  <span className="text-sm font-medium text-white/80">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-white">{formatCurrency(item.signedValue, true)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0f141b] p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Cash Flow</div>
        <h2 className="mt-1 text-xl font-semibold text-white">月度收支</h2>
        <div className="mt-5 h-[300px]">
          {monthlyCashflow.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyCashflow}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 5" />
                <XAxis dataKey="month" stroke="rgba(255,255,255,0.38)" tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.38)" tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(Number(value), true)} width={68} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 8 }} />
                <Bar dataKey="income" name="收入" fill="#34d399" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="支出" fill="#fb7185" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="导入账单后生成收支统计" />
          )}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0f141b] p-5 xl:col-span-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Expense Categories</div>
        <h2 className="mt-1 text-xl font-semibold text-white">支出分类</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {categorySpending.map((item, index) => (
            <div key={item.category} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-white/40">
                <span>#{index + 1}</span>
                <span>{((item.value / Math.max(totalExpense, 1)) * 100).toFixed(1)}%</span>
              </div>
              <div className="mt-2 text-base font-semibold text-white">{item.category}</div>
              <div className="mt-1 text-sm text-white/55">{formatCurrency(item.value)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderBills = () => (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-4">
        {renderImportPanel('transactions')}
        <div className="rounded-lg border border-white/10 bg-[#0f141b] p-4">
          <div className="text-sm font-semibold text-white">导入节奏</div>
          <div className="mt-3 space-y-2 text-sm leading-6 text-white/55">
            <p>微信/支付宝：每月初导入上月账单。</p>
            <p>银行流水：工资、房租、信用卡还款后补导一次。</p>
            <p>如果账单带余额列，会自动生成当天资产快照。</p>
          </div>
        </div>
      </aside>

      <section className="rounded-lg border border-white/10 bg-[#0f141b]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Bills</div>
            <h2 className="mt-1 text-xl font-semibold text-white">账单流水</h2>
          </div>
          <div className="text-sm text-white/45">{state.transactions.length} 条</div>
        </div>
        <div className="max-h-[680px] overflow-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-[#0f141b] text-xs uppercase tracking-[0.14em] text-white/35">
              <tr>
                <th className="px-5 py-3">日期</th>
                <th className="px-5 py-3">来源</th>
                <th className="px-5 py-3">对方</th>
                <th className="px-5 py-3">分类</th>
                <th className="px-5 py-3 text-right">金额</th>
                <th className="px-5 py-3">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {[...state.transactions]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 300)
                .map((item) => (
                  <tr key={item.id} className="text-white/70 hover:bg-white/[0.03]">
                    <td className="px-5 py-3 font-medium text-white/85">{item.date}</td>
                    <td className="px-5 py-3">{item.source}</td>
                    <td className="px-5 py-3">{item.counterparty}</td>
                    <td className="px-5 py-3">{item.category}</td>
                    <td className={`px-5 py-3 text-right font-semibold ${item.amount >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
                      {item.amount >= 0 ? '+' : ''}
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-5 py-3 text-white/45">{item.memo}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderAssets = () => (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-4">
        {renderImportPanel('assets')}
        <div className="rounded-lg border border-white/10 bg-[#0f141b] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Manual Snapshot</div>
          <h3 className="mt-1 text-lg font-semibold text-white">手工补录资产</h3>
          <div className="mt-4 grid gap-3">
            <input
              type="date"
              value={manualAsset.date}
              onChange={(event) => setManualAsset((current) => ({ ...current, date: event.target.value }))}
              className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-white outline-none"
            />
            <input
              value={manualAsset.account}
              onChange={(event) => setManualAsset((current) => ({ ...current, account: event.target.value }))}
              placeholder="账户，例如 招商银行"
              className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
            />
            <input
              value={manualAsset.name}
              onChange={(event) => setManualAsset((current) => ({ ...current, name: event.target.value }))}
              placeholder="资产名称，例如 活期余额"
              className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
            />
            <select
              value={manualAsset.type}
              onChange={(event) => setManualAsset((current) => ({ ...current, type: event.target.value as AssetType }))}
              className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-white outline-none"
            >
              {Object.entries(assetTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={manualAsset.value}
              onChange={(event) => setManualAsset((current) => ({ ...current, value: event.target.value }))}
              placeholder="金额"
              className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
            />
            <input
              value={manualAsset.liability}
              onChange={(event) => setManualAsset((current) => ({ ...current, liability: event.target.value }))}
              placeholder="负债，可为空"
              className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
            />
            <input
              value={manualAsset.note}
              onChange={(event) => setManualAsset((current) => ({ ...current, note: event.target.value }))}
              placeholder="备注"
              className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
            />
            <button
              type="button"
              onClick={addManualAsset}
              className="rounded-md bg-sky-300 px-3 py-2.5 text-sm font-semibold text-[#06111c] transition hover:bg-sky-200"
            >
              新增快照
            </button>
          </div>
        </div>
      </aside>

      <section className="rounded-lg border border-white/10 bg-[#0f141b]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Assets</div>
            <h2 className="mt-1 text-xl font-semibold text-white">最新资产表</h2>
          </div>
          <div className="text-sm text-white/45">{state.assets.length} 条快照</div>
        </div>
        <div className="max-h-[760px] overflow-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="sticky top-0 bg-[#0f141b] text-xs uppercase tracking-[0.14em] text-white/35">
              <tr>
                <th className="px-5 py-3">日期</th>
                <th className="px-5 py-3">账户</th>
                <th className="px-5 py-3">资产</th>
                <th className="px-5 py-3">类型</th>
                <th className="px-5 py-3 text-right">资产值</th>
                <th className="px-5 py-3 text-right">负债</th>
                <th className="px-5 py-3 text-right">净值</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {latestAssets.map((item) => (
                <tr key={item.id} className="text-white/70 hover:bg-white/[0.03]">
                  <td className="px-5 py-3 font-medium text-white/85">{item.date}</td>
                  <td className="px-5 py-3">{item.account}</td>
                  <td className="px-5 py-3">{item.name}</td>
                  <td className="px-5 py-3">{assetTypeLabels[item.type]}</td>
                  <td className="px-5 py-3 text-right">{formatCurrency(item.value)}</td>
                  <td className="px-5 py-3 text-right text-rose-200">{item.liability ? formatCurrency(item.liability) : '-'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-sky-100">
                    {formatCurrency(item.type === 'liability' ? -Math.abs(item.liability || item.value) : item.value - item.liability)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderJournal = () => {
    const stageMeta: Array<{ id: JournalStage; number: string; title: string; hint: string }> = [
      { id: 'pre', number: '01', title: '盘前计划', hint: selectedJournalEntry.planIsLocked ? `已锁定 · V${selectedJournalEntry.planRevision}` : '等待锁定' },
      { id: 'execution', number: '02', title: '交易执行', hint: `${selectedJournalEntry.trades.length} 笔记录` },
      { id: 'post', number: '03', title: '盘后复盘', hint: selectedJournalEntry.postmarketCompletedAt ? '复盘完成' : '等待复盘' },
    ];
    const textareaClass = 'w-full resize-none rounded-md border border-white/10 bg-[#080b10] px-3 py-2.5 text-sm leading-7 text-white outline-none placeholder:text-white/25 focus:border-sky-300/45 disabled:cursor-not-allowed disabled:bg-black/20 disabled:text-white/45';
    const inputClass = 'w-full rounded-md border border-white/10 bg-[#080b10] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-sky-300/45 disabled:cursor-not-allowed disabled:bg-black/20 disabled:text-white/45';

    return (
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border border-white/10 bg-[#0f141b] p-4 xl:sticky xl:top-24">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/55">Trading Journal</div>
          <h2 className="mt-1 text-xl font-semibold text-white">交易日记</h2>
          <div className="mt-4 grid grid-cols-[42px_minmax(0,1fr)_42px] gap-2">
            <button type="button" onClick={() => setSelectedJournalDate(addDays(selectedJournalDate, -1))} className="rounded-md border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]" aria-label="前一天">‹</button>
            <input type="date" value={selectedJournalDate} onChange={(event) => setSelectedJournalDate(event.target.value)} className="rounded-md border border-white/10 bg-[#080b10] px-3 py-2 text-sm text-white outline-none" />
            <button type="button" onClick={() => setSelectedJournalDate(addDays(selectedJournalDate, 1))} className="rounded-md border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]" aria-label="后一天">›</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setSelectedJournalDate(todayKey()); setJournalStage('pre'); }} className="rounded-md border border-sky-300/20 bg-sky-300/[0.08] px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-300/[0.12]">今天计划</button>
            <button type="button" onClick={() => { setSelectedJournalDate(addDays(todayKey(), -1)); setJournalStage('post'); }} className="rounded-md border border-amber-300/20 bg-amber-300/[0.07] px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-300/[0.12]">补写昨日复盘</button>
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3"><span className="text-sm text-white/55">记录完整度</span><span className="text-sm font-semibold text-sky-100">{journalCompletion}%</span></div>
            <div className="mt-3 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-300" style={{ width: `${journalCompletion}%` }} /></div>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, index) => addDays(todayKey(), index - 34)).map((date) => {
              const entry = journalEntries[date];
              const completion = entry ? computeJournalCompletion(entry) : 0;
              return <button key={date} type="button" title={`${date} ${completion}%`} onClick={() => setSelectedJournalDate(date)} className={`aspect-square rounded-[3px] border ${date === selectedJournalDate ? 'border-sky-200 bg-sky-300' : entry?.postmarketCompletedAt ? 'border-emerald-200/30 bg-emerald-300/70' : completion > 0 ? 'border-sky-300/20 bg-sky-300/30' : 'border-white/[0.06] bg-white/[0.04]'}`} aria-label={`${date} ${completion}%`} />;
            })}
          </div>
          <div className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-white/35">绿色：已完成复盘 · 蓝色：记录中<br />每个日期独立保存，不再混写昨天和今天。</div>
        </aside>

        <section className="overflow-hidden rounded-lg border border-white/10 bg-[#0f141b]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Decision Record</div><h2 className="mt-1 text-xl font-semibold text-white">{selectedJournalDate}</h2></div>
            <div className="flex flex-wrap items-center gap-2">
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${journalSyncStatus === 'offline' ? 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100/80' : 'border-sky-300/20 bg-sky-300/[0.08] text-sky-100/75'}`}>{{ loading: '正在同步数据库', saving: '正在保存', saved: '云端已保存', offline: '仅保存在本机' }[journalSyncStatus]}</div>
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${selectedJournalEntry.postmarketCompletedAt ? 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100' : selectedJournalEntry.planIsLocked ? 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100' : 'border-white/10 bg-white/[0.03] text-white/55'}`}>{selectedJournalEntry.postmarketCompletedAt ? '已复盘' : selectedJournalEntry.planIsLocked ? '待复盘' : '盘前未锁定'}</div>
            </div>
          </div>

          <div className="grid border-b border-white/10 md:grid-cols-3">
            {stageMeta.map((stage) => <button key={stage.id} type="button" onClick={() => setJournalStage(stage.id)} className={`relative border-b px-5 py-4 text-left transition md:border-b-0 md:border-r ${journalStage === stage.id ? 'bg-sky-300/[0.08]' : 'hover:bg-white/[0.025]'}`}>
              {journalStage === stage.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-300" />}
              <div className="flex items-start gap-3"><span className={`font-mono text-xs ${journalStage === stage.id ? 'text-sky-200' : 'text-white/25'}`}>{stage.number}</span><span><span className={`block text-sm font-semibold ${journalStage === stage.id ? 'text-white' : 'text-white/55'}`}>{stage.title}</span><span className="mt-1 block text-xs text-white/30">{stage.hint}</span></span></div>
            </button>)}
          </div>

          {journalStage === 'pre' && <div className="space-y-4 p-5">
            <div className={`rounded-lg border p-4 ${selectedJournalEntry.planIsLocked ? 'border-emerald-300/20 bg-emerald-300/[0.05]' : 'border-amber-300/20 bg-amber-300/[0.05]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-semibold text-white">{selectedJournalEntry.planIsLocked ? '盘前计划已锁定' : '先写判断，再锁定计划'}</div><div className="mt-1 text-xs text-white/40">{selectedJournalEntry.planIsLocked ? `版本 V${selectedJournalEntry.planRevision} · 锁定后盘中无法悄悄改写` : '锁定会在数据库保留版本快照，用来对照盘后执行。'}</div></div>{selectedJournalEntry.planIsLocked ? <button type="button" onClick={handlePlanUnlock} className="rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/[0.08]">解锁修订</button> : <button type="button" onClick={handlePlanLock} className="rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-[#171006] hover:bg-amber-200">锁定盘前计划</button>}</div>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><label className="mb-2 block text-sm font-semibold text-white/85">市场阶段</label><input disabled={selectedJournalEntry.planIsLocked} value={selectedJournalEntry.marketPhase} onChange={(event) => updateJournalEntry({ marketPhase: event.target.value })} placeholder="发酵期 / 高潮期 / 退潮期 / 修复期" className={inputClass} /></div>
              <div className="rounded-lg border border-rose-300/15 bg-rose-300/[0.025] p-4"><label className="mb-2 block text-sm font-semibold text-white/85">单日最大亏损 %</label><input disabled={selectedJournalEntry.planIsLocked} type="number" min="0" max="100" step="0.1" value={selectedJournalEntry.maxDailyLossPct} onChange={(event) => updateJournalEntry({ maxDailyLossPct: event.target.value })} placeholder="例如 1.5" className={inputClass} /></div>
            </div>
            {premarketFields.map((field) => <div key={field.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><label className="mb-2 block text-sm font-semibold text-white/85">{field.label}</label><textarea disabled={selectedJournalEntry.planIsLocked} value={selectedJournalEntry[field.key] as string} onChange={(event) => updateJournalEntry({ [field.key]: event.target.value } as Partial<JournalEntry>)} rows={field.rows} placeholder={field.placeholder} className={textareaClass} /></div>)}
            {selectedJournalEntry.planHistory.length > 0 && <details className="rounded-lg border border-white/10 bg-black/10 p-4"><summary className="cursor-pointer text-sm font-semibold text-white/60">查看计划版本记录（{selectedJournalEntry.planHistory.length}）</summary><div className="mt-3 space-y-2 text-xs text-white/40">{selectedJournalEntry.planHistory.map((revision, index) => <div key={index} className="rounded border border-white/10 px-3 py-2">V{String(revision.revision || index + 1)} · {revision.locked_at ? new Date(String(revision.locked_at)).toLocaleString('zh-CN') : '已保存'}</div>)}</div></details>}
          </div>}

          {journalStage === 'execution' && <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-base font-semibold text-white">逐笔交易记录</h3><p className="mt-1 text-xs text-white/40">价格、数量和是否符合计划将成为后续统计与 AI 分析的证据。</p></div><button type="button" onClick={addJournalTrade} className="rounded-md bg-sky-300 px-4 py-2 text-sm font-bold text-[#06111c] hover:bg-sky-200">＋ 新增交易</button></div>
            {selectedJournalEntry.trades.length === 0 ? <button type="button" onClick={addJournalTrade} className="flex min-h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed border-white/12 bg-white/[0.02] text-white/35 hover:border-sky-300/30 hover:text-sky-100/70"><span className="text-2xl">＋</span><span className="mt-2 text-sm">记录第一笔交易</span></button> : <div className="space-y-3">{selectedJournalEntry.trades.map((trade, index) => <div key={trade.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><div className="mb-3 flex items-center justify-between"><span className="font-mono text-xs text-sky-200/60">TRADE {String(index + 1).padStart(2, '0')}</span><button type="button" onClick={() => removeJournalTrade(trade.id)} className="text-xs text-rose-200/55 hover:text-rose-200">删除</button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <label className="text-xs text-white/45">代码<input value={trade.symbol} onChange={(event) => updateJournalTrade(trade.id, { symbol: event.target.value.toUpperCase() })} placeholder="MRNA" className={`${inputClass} mt-1 font-mono uppercase`} /></label>
              <label className="text-xs text-white/45">方向<select value={trade.side} onChange={(event) => updateJournalTrade(trade.id, { side: event.target.value as JournalTradeRecord['side'] })} className={`${inputClass} mt-1`}><option value="buy">买入</option><option value="sell">卖出</option><option value="short">做空</option><option value="cover">平空</option></select></label>
              <label className="text-xs text-white/45 xl:col-span-2">成交时间<input type="datetime-local" value={trade.executedAt ? trade.executedAt.slice(0, 16) : ''} onChange={(event) => updateJournalTrade(trade.id, { executedAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className={`${inputClass} mt-1`} /></label>
              <label className="text-xs text-white/45">成交价<input type="number" min="0" step="0.0001" value={trade.price} onChange={(event) => updateJournalTrade(trade.id, { price: event.target.value })} placeholder="0.00" className={`${inputClass} mt-1`} /></label>
              <label className="text-xs text-white/45">数量<input type="number" min="0" step="0.01" value={trade.quantity} onChange={(event) => updateJournalTrade(trade.id, { quantity: event.target.value })} placeholder="0" className={`${inputClass} mt-1`} /></label>
            </div><div className="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]"><label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/15 px-3 text-sm text-white/65"><input type="checkbox" checked={trade.planned} onChange={(event) => updateJournalTrade(trade.id, { planned: event.target.checked })} className="accent-sky-300" />符合盘前计划</label><input value={trade.note} onChange={(event) => updateJournalTrade(trade.id, { note: event.target.value })} placeholder="触发条件、临盘判断或偏离原因" className={inputClass} /></div></div>)}</div>}
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><label className="mb-2 block text-sm font-semibold text-white/85">盘中执行备注</label><textarea value={selectedJournalEntry.executionNotes} onChange={(event) => updateJournalEntry({ executionNotes: event.target.value })} rows={4} placeholder="错过的机会、情绪变化、临时调整与原因" className={textareaClass} /></div>
          </div>}

          {journalStage === 'post' && <div className="space-y-4 p-5">
            <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.035] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-semibold text-white">用结果检验判断，不用盈亏定义对错</div><div className="mt-1 text-xs text-white/40">复盘属于所选交易日；第二天补写时请切到昨天，不要写进今天。</div></div>{selectedJournalEntry.postmarketCompletedAt ? <span className="rounded-full border border-emerald-300/20 px-3 py-1 text-xs text-emerald-100">完成于 {new Date(selectedJournalEntry.postmarketCompletedAt).toLocaleString('zh-CN')}</span> : null}</div></div>
            {postmarketFields.map((field) => <div key={field.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><label className="mb-2 block text-sm font-semibold text-white/85">{field.label}</label><textarea value={selectedJournalEntry[field.key] as string} onChange={(event) => updateJournalEntry({ [field.key]: event.target.value } as Partial<JournalEntry>)} rows={field.rows} placeholder={field.placeholder} className={textareaClass} /></div>)}
            {selectedJournalEntry.aiReview && <div className="rounded-lg border border-violet-300/15 bg-violet-300/[0.04] p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200/60">AI Review</div><div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/65">{selectedJournalEntry.aiReview}</div></div>}
            <div className="flex justify-end"><button type="button" onClick={completePostmarketReview} className="rounded-md bg-emerald-300 px-5 py-2.5 text-sm font-bold text-[#06130e] hover:bg-emerald-200">{selectedJournalEntry.postmarketCompletedAt ? '更新完成时间' : '完成盘后复盘'}</button></div>
          </div>}
        </section>
      </div>
    );
  };

  const renderReport = () => (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-white/10 bg-[#0f141b] p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/55">Report</div>
        <h2 className="mt-1 text-xl font-semibold text-white">报告生成</h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {reportRanges.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setReportRange(item.id)}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                reportRange === item.id
                  ? 'border-sky-300 bg-sky-300 text-[#06111c]'
                  : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-sky-300/35'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={copyReport}
            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/[0.07]"
          >
            复制报告
          </button>
          <button
            type="button"
            onClick={downloadReport}
            className="rounded-md bg-sky-300 px-3 py-2.5 text-sm font-semibold text-[#06111c] hover:bg-sky-200"
          >
            下载 Markdown
          </button>
        </div>
      </aside>

      <section className="rounded-lg border border-white/10 bg-[#0f141b]">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Preview</div>
          <h2 className="mt-1 text-xl font-semibold text-white">资产报告预览</h2>
        </div>
        <pre className="min-h-[620px] whitespace-pre-wrap p-5 text-sm leading-7 text-white/76">{reportText}</pre>
      </section>
    </div>
  );

  const renderContent = () => {
    if (activeTab === 'stats') return renderStats();
    if (activeTab === 'bills') return renderBills();
    if (activeTab === 'assets') return renderAssets();
    if (activeTab === 'journal') return renderJournal();
    if (activeTab === 'report') return renderReport();
    return renderOverview();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_18%_-10%,rgba(56,189,248,0.16),transparent_28%),linear-gradient(180deg,#050a10_0%,#071019_48%,#04070c_100%)] text-white">
      <header className="sticky top-0 z-30 border-b border-sky-300/12 bg-[#07101a]/90 backdrop-blur-xl">
        <div className="flex min-h-[78px] flex-wrap items-stretch">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="group flex w-40 shrink-0 items-center gap-3 border-r border-sky-300/12 px-4 text-left transition hover:bg-white/[0.03]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-amber-300/30 bg-amber-300/[0.08] text-sm font-bold text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              H
            </span>
            <span>
              <span className="ledger-display block text-xl font-black leading-none tracking-[0.08em] text-sky-50">Henry</span>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.36em] text-sky-200/55">Ledger</span>
            </span>
          </button>

          <nav className="flex min-w-0 flex-1 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-w-[92px] border-r border-sky-300/12 px-4 py-4 text-left transition ${
                  activeTab === item.id
                    ? 'bg-sky-300/[0.10] text-sky-50 shadow-[inset_0_-2px_0_#6fb6ff]'
                    : 'text-white/48 hover:bg-white/[0.03] hover:text-white/80'
                }`}
              >
                <span className="block text-base font-semibold">{item.zh}</span>
                <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.32em] opacity-60">{item.en}</span>
              </button>
            ))}
          </nav>

          <div className="hidden items-center justify-end gap-3 px-5 text-right md:flex">
            <div>
              <div className="text-xs text-white/35">{OWNER_NAME} 的个人资产账本</div>
              <div className="mt-1 text-sm font-semibold text-sky-100">{formatCurrency(latestNetWorth, true)}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5 md:px-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-200/45">
              {navItems.find((item) => item.id === activeTab)?.en}
            </div>
            <h1 className="ledger-display mt-1 text-3xl font-black tracking-tight text-white">
              {navItems.find((item) => item.id === activeTab)?.zh}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetDemoData}
              className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-white/55 hover:bg-white/[0.06]"
            >
              示例数据
            </button>
            <button
              type="button"
              onClick={clearLedgerData}
              className="rounded-md border border-rose-300/20 bg-rose-400/[0.06] px-3 py-2 text-sm font-semibold text-rose-100/75 hover:bg-rose-400/[0.10]"
            >
              清空账本
            </button>
          </div>
        </div>

        {renderContent()}
      </main>
    </div>
  );
};

export default LedgerPage;
