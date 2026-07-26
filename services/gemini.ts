
import { GoogleGenAI } from "@google/genai";
import { AnalysisMode, Stock, NewsItem, AnalysisResponse } from "../types";
import { SYSTEM_PROMPTS } from "../constants";

type JournalReviewInput = {
  date: string;
  marketPhase: string;
  positionPlan?: string;
  marketNotes: string;
  hotThemes?: string;
  targetStocks?: string;
  logicValidation?: string;
  buyPlan?: string;
  sellRules?: string;
  contingencyPlan?: string;
  tradePlan?: string;
  dailySummary: string;
};

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

const GEMINI_MODEL = 'gemini-3-flash-preview';
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

// 辅助函数：睡眠
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getErrorMessage = (error: any) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return error?.message || '未知原因';
};

// 带重试机制的生成函数
const generateWithRetry = async (
  ai: any,
  modelName: string,
  params: any,
  maxRetries = 1
): Promise<any> => {
  let lastError: any;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await ai.models.generateContent({
        model: modelName,
        ...params
      });
    } catch (error: any) {
      lastError = error;
      // 429 错误处理：如果是第一次尝试且有工具调用，尝试去掉工具后重试
      if (error.message?.includes('429') || error.status === 429) {
        if (params.config?.tools && i === 0) {
          console.warn("联网搜索配额限制，尝试降级为无搜索模式...");
          const newParams = { ...params, config: { ...params.config, tools: undefined } };
          return await ai.models.generateContent({
            model: modelName,
            ...newParams
          });
        }
        
        // 普通 429 等待重试
        if (i < maxRetries) {
          const waitTime = Math.pow(2, i + 1) * 1000;
          await sleep(waitTime);
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
};

const generateDeepSeekChat = async (
  messages: DeepSeekMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    maxRetries?: number;
  } = {}
): Promise<string> => {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('DeepSeek API Key 未配置');
  }

  const maxRetries = options.maxRetries ?? 1;
  let lastError: any;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          temperature: options.temperature ?? 0.5,
          max_tokens: options.maxTokens ?? 2200,
          stream: false,
        }),
      });

      const raw = await response.text();
      let data: DeepSeekChatResponse | null = null;

      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const error = new Error(
          `DeepSeek 请求失败(${response.status}): ${data?.error?.message || raw || response.statusText || '未知原因'}`
        );
        (error as any).status = response.status;
        throw error;
      }

      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('DeepSeek 未返回有效评价');
      }

      return text;
    } catch (error: any) {
      lastError = error;
      const status = error?.status;
      const canRetry = !status || status === 429 || status >= 500;

      if (i < maxRetries && canRetry) {
        await sleep(Math.pow(2, i + 1) * 1000);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
};

export const generateAnalysis = async (
  mode: AnalysisMode,
  stock: Stock,
  relevantNews: NewsItem[]
): Promise<AnalysisResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const newsContext = relevantNews
    .slice(0, 5)
    .map((n) => `新闻标题: ${n.title}\n内容: ${n.content}`)
    .join("\n---\n");

  const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const prompt = `
当前时间: ${currentTime}
标的: ${stock.name} (${stock.symbol})
价格: ${stock.price.toFixed(2)}

${newsContext ? `[本地参考资讯]:\n${newsContext}` : "[暂无本地资讯]"}

任务: 执行 ${mode} 分析。
注意: 如果搜索结果不可用，请务必基于上述[本地参考资讯]进行深度逻辑推演，不要返回空结果。
  `;

  try {
    const config: any = {
      systemInstruction: SYSTEM_PROMPTS[mode === AnalysisMode.OVERVIEW ? 'OVERVIEW' : mode === AnalysisMode.EARNINGS ? 'EARNINGS' : 'SENTIMENT'],
      temperature: 0.7,
    };

    // 默认仅 OVERVIEW 开启搜索
    if (mode === AnalysisMode.OVERVIEW) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await generateWithRetry(ai, GEMINI_MODEL, {
      contents: prompt,
      config: config,
    });

    let text = response.text || "未能生成分析结果。";
    const sources: { title: string; uri: string }[] = [];
    
    // 检查是否发生了降级（即返回的内容中是否包含 groundingMetadata）
    const isDegraded = !response.candidates?.[0]?.groundingMetadata;
    if (isDegraded && mode === AnalysisMode.OVERVIEW) {
       text = "【配额受限 · 离线分析模式】\n由于联网搜索请求过多，当前结果仅基于已有新闻资讯生成，未包含实时搜索数据。\n\n" + text;
    }

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          sources.push({
            title: chunk.web.title || "参考来源",
            uri: chunk.web.uri
          });
        }
      });
    }

    return { text, sources };
  } catch (error: any) {
    console.error("Gemini Error:", error);
    
    if (error.message?.includes('429')) {
      return { 
        text: "【请求过于频繁】Gemini 免费额度已耗尽。请：\n1. 点击右上角绑定付费 API Key。\n2. 稍等一分钟后再试。",
        sources: []
      };
    }

    return { 
      text: `分析失败: ${error.message || "未知原因"}。`,
      sources: []
    };
  }
};

const buildJournalReviewPrompt = (journal: JournalReviewInput) => {
  const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const hotThemesText = journal.hotThemes || '';
  const targetsText = journal.targetStocks || '';
  const tradePlanText = journal.tradePlan || '';

  return `
当前时间：${currentTime}
复盘日期：${journal.date}

=== 你的任务 ===
你是一位严谨的交易复盘教练。你的核心工作是：
1. 事实核验：使用搜索功能，检查用户日记里的关键判断是否与事实一致
2. 逻辑评价：指出用户思路中的优点和问题
3. 给出建议：提供可落地的修正方案

=== 用户复盘内容 ===
市场阶段：${journal.marketPhase || '未填写'}

1. 大盘与情绪：
${journal.marketNotes || '未填写'}

2. 主线与方向：
${hotThemesText || '未填写'}

3. 目标个股：
${targetsText || '未填写'}

4. 交易计划：
${tradePlanText || '未填写'}

5. 今日总结：
${journal.dailySummary || '未填写'}

=== 输出要求 ===
请按以下结构输出：

零、事实核验（最重要！）
- 提取用户日记中最关键的 3-8 个判断
- 逐一说明：这个判断是【符合事实】、【部分符合】、【不符合】还是【未能核验】
- 每条都必须说明：你是根据什么（行情/新闻/公告/政策）做出的判断，或者为什么查不到

一、总评
- 1-2 句话总结这篇复盘的质量

二、做得好的地方
- 列出 2-4 点，具体说明好在哪里

三、需要注意的问题
- 列出 2-5 点，重点指出：
  - 逻辑跳跃
  - 证据不足
  - 计划模糊
  - 缺乏纪律

四、具体建议
- 给出可执行的建议，不要空泛

五、明日观察重点
- 2-3 条明天最该关注的事项
`;
};

const generateGeminiJournalReview = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await generateWithRetry(ai, GEMINI_MODEL, {
    contents: prompt,
    config: {
      temperature: 0.5,
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text?.trim();

  if (!text) {
    throw new Error('Gemini 未返回有效评价');
  }

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = groundingChunks
    .map((chunk: any) => chunk.web)
    .filter((web: any): web is { title?: string; uri: string } => Boolean(web?.uri))
    .slice(0, 6);

  if (sources.length === 0) {
    return `【未检测到实时搜索来源】\nGemini 没有返回可展示的搜索来源；以下内容可能只基于模型知识和你的日记文本生成，请谨慎参考。\n\n${text}`;
  }

  const sourceText = sources
    .map((source: { title?: string; uri: string }, index: number) => `${index + 1}. ${source.title || '参考来源'} - ${source.uri}`)
    .join('\n');

  return `${text}\n\n参考资料（Gemini 搜索）：\n${sourceText}`;
};

const generateDeepSeekJournalReview = async (prompt: string): Promise<string> => {
  return generateDeepSeekChat(
    [
      {
        role: 'system',
        content: '你是一名严谨的短线交易复盘教练。当前降级通道没有联网搜索工具，必须明确说明未进行实时资料核验；请只基于用户提供内容评价，使用中文输出，保持结构清晰，重点给出可执行修正建议。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    {
      temperature: 0.5,
      maxTokens: 2200,
    }
  );
};

export const generateJournalReview = async (journal: JournalReviewInput): Promise<string> => {
  const prompt = buildJournalReviewPrompt(journal);

  try {
    return await generateGeminiJournalReview(prompt);
  } catch (geminiError: any) {
    console.warn('Gemini journal review failed, falling back to DeepSeek:', geminiError);

    try {
      const review = await generateDeepSeekJournalReview(prompt);
      return `【DeepSeek 降级模式｜未联网核验】\nGemini 实时搜索评价暂时不可用，以下评价只基于你填写的日记内容生成，没有核验实时行情或新闻。\n\n${review}`;
    } catch (deepSeekError: any) {
      console.error('Journal Review Error:', {
        gemini: geminiError,
        deepseek: deepSeekError,
      });
      return `AI 评价失败: Gemini ${getErrorMessage(geminiError)}；DeepSeek 降级失败: ${getErrorMessage(deepSeekError)}`;
    }
  }
};
