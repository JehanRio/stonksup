
import { GoogleGenAI } from "@google/genai";
import { AnalysisMode, Stock, NewsItem, AnalysisResponse } from "../types";
import { SYSTEM_PROMPTS } from "../constants";

// 辅助函数：睡眠
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

    const response = await generateWithRetry(ai, 'gemini-3-flash-preview', {
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

export const generateJournalReview = async (journal: {
  date: string;
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
}): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const prompt = `
当前时间：${currentTime}
复盘日期：${journal.date}

你要扮演一名严谨的短线交易复盘教练。请基于以下日记内容，给出结构化评价和修正建议。

市场阶段：${journal.marketPhase || '未填写'}
次日仓位计划：${journal.positionPlan || '未填写'}

1. 大盘与情绪分析：
${journal.marketNotes || '未填写'}

2. 热点板块：
${journal.hotThemes || '未填写'}

3. 目标个股：
${journal.targetStocks || '未填写'}

4. 消息面与逻辑验证：
${journal.logicValidation || '未填写'}

5. 买入计划：
${journal.buyPlan || '未填写'}

6. 卖出纪律：
${journal.sellRules || '未填写'}

7. 应变预案：
${journal.contingencyPlan || '未填写'}

8. 每日总结：
${journal.dailySummary || '未填写'}

请严格按以下结构输出，使用中文：

一、总评
- 简要评价这篇复盘是否完整、是否有清晰交易闭环

二、做得好的地方
- 列出 2 到 4 条

三、主要问题
- 列出 2 到 5 条
- 重点指出逻辑跳跃、证据不足、计划模糊、纪律缺失

四、修正建议
- 给出可执行的修正动作，不要空泛

五、明日最该盯住的重点
- 给出 3 条以内最重要事项
`;

  try {
    const response = await generateWithRetry(ai, 'gemini-3-flash-preview', {
      contents: prompt,
      config: {
        temperature: 0.5,
      },
    });

    return response.text || 'AI 未返回有效评价。';
  } catch (error: any) {
    console.error('Journal Review Error:', error);
    return `AI 评价失败: ${error.message || '未知原因'}`;
  }
};
