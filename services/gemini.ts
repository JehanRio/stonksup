
import { GoogleGenAI } from "@google/genai";
import { AnalysisMode, Stock, NewsItem, AnalysisResponse } from "../types";
import { SYSTEM_PROMPTS } from "../constants";

// Fix: Standardized initialization with direct process.env.API_KEY usage.
// Fix: Use 'gemini-3-pro-preview' for complex investment reasoning and analysis.
export const generateAnalysis = async (
  mode: AnalysisMode,
  stock: Stock,
  relevantNews: NewsItem[]
): Promise<AnalysisResponse> => {
  // Always use a new instance with a named parameter for apiKey.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const newsContext = relevantNews
    .map((n) => `新闻标题: ${n.title}\n内容: ${n.content}`)
    .join("\n---\n");

  const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const prompt = `
当前系统时间: ${currentTime}
目标股票: ${stock.name} (${stock.symbol})
静态数据价格: ${stock.price} (注：仅供参考，请以搜索到的最新行情为准)

本地相关新闻参考:
${newsContext}

任务要求：
1. 如果是“全面速览”或“新闻情绪”模式，请务必利用 Google Search 获取该股票【今日】及【近期】的最核心动态。
2. 结合实时搜索结果和提供的本地参考信息，执行 ${mode} 任务。
  `;

  try {
    const config: any = {
      systemInstruction: SYSTEM_PROMPTS[mode === AnalysisMode.OVERVIEW ? 'OVERVIEW' : mode === AnalysisMode.EARNINGS ? 'EARNINGS' : 'SENTIMENT'],
      temperature: 0.7,
    };

    // 为全面速览和新闻情绪开启搜索增强
    if (mode === AnalysisMode.OVERVIEW || mode === AnalysisMode.SENTIMENT) {
      config.tools = [{ googleSearch: {} }];
    }

    // Call generateContent with the appropriate model name and prompt.
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: config,
    });

    // Directly access the .text property from GenerateContentResponse.
    const text = response.text || "未能生成分析结果。";
    
    // 提取 Grounding 元数据中的来源链接并确保提取 URL
    const sources: { title: string; uri: string }[] = [];
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
  } catch (error) {
    console.error("Analysis generation failed:", error);
    return { 
      text: "生成分析时发生错误，请检查网络或稍后重试。",
      sources: []
    };
  }
};
