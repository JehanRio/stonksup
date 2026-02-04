
import { Stock, NewsItem, OHLC, Timeframe } from './types';

const generateMockHistory = (basePrice: number, timeframe: Timeframe): OHLC[] => {
  const history: OHLC[] = [];
  let current = basePrice;
  const now = new Date();
  
  let count = 30;
  let intervalMs = 24 * 60 * 60 * 1000; // Default 1 day
  let formatOptions: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit' };

  if (timeframe === 'INTRADAY') {
    count = 40;
    intervalMs = 15 * 60 * 1000; // 15 mins
    formatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  } else if (timeframe === '1W') {
    count = 7;
    intervalMs = 24 * 60 * 60 * 1000;
    formatOptions = { weekday: 'short' };
  } else if (timeframe === '1M') {
    count = 30;
    intervalMs = 24 * 60 * 60 * 1000;
    formatOptions = { month: '2-digit', day: '2-digit' };
  } else if (timeframe === 'YTD') {
    count = 60;
    intervalMs = 3 * 24 * 60 * 60 * 1000; // Every 3 days for YTD view
    formatOptions = { month: 'short', day: '2-digit' };
  }

  // Generate backwards from now
  for (let i = count - 1; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * intervalMs);
    const timeStr = timestamp.toLocaleString('zh-CN', formatOptions);
    
    const volatility = basePrice * (timeframe === 'INTRADAY' ? 0.005 : 0.02);
    const open = current;
    const close = current + (Math.random() * volatility - (volatility / 2.05));
    const high = Math.max(open, close) + Math.random() * (volatility / 3);
    const low = Math.min(open, close) - Math.random() * (volatility / 3);
    
    history.push({
      time: timeStr,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 1000000)
    });
    current = close;
  }
  return history;
};

// Fix: Removed 'history' property as it does not exist in the 'Stock' type definition.
// Real-time history data is fetched via fetchStockHistory when needed.
const createStock = (id: string, name: string, symbol: string, price: number, change: number, changePct: number): Stock => ({
  id,
  name,
  symbol,
  price,
  change,
  changePercent: changePct,
  sparkline: [price - 3, price - 1, price + 2, price - 1, price + 4, price + 2, price]
});

export const MOCK_STOCKS: Stock[] = [
  createStock('1', '英伟达', 'NVDA', 135.58, 2.45, 1.84),
  createStock('2', '苹果', 'AAPL', 228.22, -1.12, -0.49),
  createStock('3', '特斯拉', 'TSLA', 345.16, 12.30, 3.70),
  createStock('4', '微软', 'MSFT', 415.20, 0.85, 0.21)
];

export const MOCK_NEWS: NewsItem[] = [
  {
    id: 'n1',
    title: '英伟达发布新一代 Blackwell 架构芯片，性能提升 2.5 倍',
    source: '科技时报',
    time: '2小时前',
    content: '英伟达在 GTC 大会上正式公布了 Blackwell GPU 架构，首款芯片 B200 拥有 2080 亿个晶体管。黄仁勋表示，Blackwell 将开启生成式 AI 的新纪元。'
  },
  {
    id: 'n2',
    title: '苹果计划在 iPhone 17 中引入自研 Wi-Fi 芯片',
    source: '华尔街日报',
    time: '5小时前',
    content: '据知情人士透露，苹果正加速摆脱对博通的依赖，预计 2025 年推出的 iPhone 17 将部分采用自研 Wi-Fi 及蓝牙芯片。'
  },
  {
    id: 'n3',
    title: '特斯拉 2024 年 Q3 交付量超预期，Robotaxi 发布在即',
    source: '财经周刊',
    time: '10小时前',
    content: '特斯拉第三季度交付量达到 46.2 万辆，略高于市场预期。市场正密切关注 10 月 10 日的 Robotaxi 发布活动，这可能重新定义特斯拉的估值逻辑。'
  }
];

export const SYSTEM_PROMPTS = {
  OVERVIEW: `你是一个专业的投资分析助手。请对该股票进行【全面速览】分析。
要求结构：
1. 现状总结（当前价格表现、关键驱动力）
2. 核心看多逻辑（至少2条）
3. 核心看空逻辑/风险点（至少2条）
4. 投资建议草案（基于现状的判断，声明非投资建议）`,
  EARNINGS: `你是一个财报解读专家。请分析该股票的最新财报。
输出结构必须是：
1. 本次财报 vs 市场预期（高于 / 低于 / 符合）
2. 3 个最重要的变化点（详细说明）
3. 哪些变化是“一次性”的，哪些可能持续`,
  SENTIMENT: `你是一个市场情绪解读专家。你只回答一个问题：
最近的新闻，对该股票的市场情绪是偏正面、偏负面，还是分化？
要求：
- 不做情绪量化分数
- 不推导价格结论
- 只解释“为什么会这样感受”`
};
