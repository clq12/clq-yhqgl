import { NextRequest, NextResponse } from "next/server";
import { SearchClient, Config } from "coze-coding-dev-sdk";
import { LLMClient } from "coze-coding-dev-sdk";
import { getWebDAVConfigFromRequest } from "@/lib/config";

export interface OilPriceTrend {
  trend: "上涨" | "下跌" | "搁浅";
  confidence: number;
  core_factor: string;
  currentPrice?: {
    gasoline92?: number;
    gasoline95?: number;
    gasoline98?: number;
    diesel0?: number;
  };
}

/**
 * 使用52api获取当前油价
 */
async function getCurrentOilPrice(apiKey: string): Promise<{
  gasoline92?: number;
  gasoline95?: number;
  gasoline98?: number;
  diesel0?: number;
} | null> {
  try {
    const response = await fetch(`https://apis.52vmy.cn/api/query/gasPrice?apikey=${apiKey}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10秒超时
    });

    if (!response.ok) {
      console.error(`52api请求失败: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // 根据实际API返回格式解析
    if (data && data.code === 200 && data.data) {
      return {
        gasoline92: data.data.gasoline92,
        gasoline95: data.data.gasoline95,
        gasoline98: data.data.gasoline98,
        diesel0: data.data.diesel0,
      };
    }

    return null;
  } catch (error) {
    console.error("调用52api失败:", error);
    return null;
  }
}

/**
 * 使用AI分析油价趋势
 */
async function analyzeOilPriceWithAI(currentPrice?: {
  gasoline92?: number;
  gasoline95?: number;
  gasoline98?: number;
  diesel0?: number;
}): Promise<OilPriceTrend> {
  try {
    const config = new Config();
    const searchClient = new SearchClient(config);

    let searchContext = "";

    // 如果有当前油价，加入到搜索上下文
    if (currentPrice && currentPrice.gasoline92) {
      searchContext = `当前油价参考：92号汽油 ${currentPrice.gasoline92} 元/升`;
      if (currentPrice.gasoline95) {
        searchContext += `，95号汽油 ${currentPrice.gasoline95} 元/升`;
      }
      if (currentPrice.gasoline98) {
        searchContext += `，98号汽油 ${currentPrice.gasoline98} 元/升`;
      }
      if (currentPrice.diesel0) {
        searchContext += `，0号柴油 ${currentPrice.diesel0} 元/升`;
      }
      searchContext += "\n\n";
    }

    // 搜索油价调整相关信息
    const searchQuery = "中国下一轮油价调整 油价变化趋势 2025年";
    const searchResponse = await searchClient.webSearch(searchQuery, 5, true);

    if (searchResponse.web_items && searchResponse.web_items.length > 0) {
      searchContext += searchResponse.web_items
        .map((item) => `${item.title}：${item.snippet}`)
        .join("\n\n");
    }

    if (searchResponse.summary) {
      searchContext += `\n\n搜索摘要：${searchResponse.summary}`;
    }

    // 使用LLM分析趋势
    const llmClient = new LLMClient(config);

    const messages = [
      {
        role: "system" as const,
        content: `角色：能源趋势判断系统。

任务：根据提供的油价信息和搜索结果，判断中国下一轮油价趋势。

规则：
- 只输出一行JSON
- 不允许换行
- 不允许解释
- 不允许代码块

格式：
{"trend":"上涨/下跌/搁浅","confidence":整数,"core_factor":"一句话原因"}

如果信息不足，confidence不超过60。

油价信息：
${searchContext}`,
      },
    ];

    const response = await llmClient.invoke(messages, {
      model: "doubao-seed-1-8-251228",
      temperature: 0.3,
    });

    // 解析JSON响应
    const content = response.content.trim();
    let trendResult: OilPriceTrend;

    try {
      // 移除可能的markdown代码块标记
      const jsonStr = content.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      trendResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("解析LLM响应失败:", content);
      throw new Error("AI分析失败");
    }

    // 验证数据结构
    if (!trendResult.trend || !trendResult.core_factor) {
      throw new Error("LLM返回的数据格式不正确");
    }

    return trendResult;
  } catch (error) {
    console.error("AI分析油价趋势失败:", error);
    throw error;
  }
}

/**
 * 油价趋势分析API
 * 优先使用52api获取当前油价，然后使用AI分析趋势
 */
export async function GET(request: NextRequest) {
  try {
    // 1. 获取配置（优先从环境变量）
    let api52Key = process.env.API52_KEY;

    // 2. 如果环境变量没有配置，尝试从Cookie获取
    if (!api52Key) {
      const webdavConfig = getWebDAVConfigFromRequest(request);
      if (webdavConfig && webdavConfig.api52Key) {
        api52Key = webdavConfig.api52Key;
      }
    }

    let currentPrice: {
      gasoline92?: number;
      gasoline95?: number;
      gasoline98?: number;
      diesel0?: number;
    } | null = null;

    // 3. 优先使用52api获取当前油价
    if (api52Key) {
      console.log("使用52api获取当前油价...");
      currentPrice = await getCurrentOilPrice(api52Key);

      if (currentPrice) {
        console.log(`获取到当前油价: 92号=${currentPrice.gasoline92}, 95号=${currentPrice.gasoline95}, 98号=${currentPrice.gasoline98}`);
      } else {
        console.log("52api获取失败，将使用AI搜索获取油价信息");
      }
    } else {
      console.log("未配置52api Key，将使用AI搜索获取油价信息");
    }

    // 4. 使用AI分析趋势
    const trendResult = await analyzeOilPriceWithAI(currentPrice || undefined);

    // 5. 返回结果
    return NextResponse.json({
      success: true,
      data: {
        ...trendResult,
        currentPrice: currentPrice || undefined,
      },
    });
  } catch (error) {
    console.error("油价趋势分析失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "油价趋势分析失败",
        data: {
          trend: "搁浅",
          confidence: 50,
          core_factor: "系统错误，请稍后重试",
        },
      },
      { status: 500 }
    );
  }
}
