import { NextRequest, NextResponse } from "next/server";
import { SearchClient, Config } from "coze-coding-dev-sdk";
import { LLMClient } from "coze-coding-dev-sdk";

export interface OilPriceTrend {
  trend: "上涨" | "下跌" | "搁浅";
  confidence: number;
  core_factor: string;
}

/**
 * 油价趋势分析API
 * 使用AI搜索油价信息并分析下一轮趋势
 */
export async function GET(request: NextRequest) {
  try {
    const config = new Config();

    // 步骤1：搜索油价相关信息
    const searchClient = new SearchClient(config);
    const searchQuery = "中国下一轮油价调整 油价变化趋势 2025年";
    const searchResponse = await searchClient.webSearch(searchQuery, 5, true);

    // 收集搜索结果
    let searchContext = "";
    if (searchResponse.web_items && searchResponse.web_items.length > 0) {
      searchContext = searchResponse.web_items
        .map((item) => `${item.title}：${item.snippet}`)
        .join("\n\n");
    }

    if (searchResponse.summary) {
      searchContext += `\n\n搜索摘要：${searchResponse.summary}`;
    }

    // 步骤2：使用LLM分析趋势
    const llmClient = new LLMClient(config);

    const messages = [
      {
        role: "system" as const,
        content: `角色：能源趋势判断系统。

任务：根据提供的搜索结果，判断中国下一轮油价趋势。

规则：
- 只输出一行JSON
- 不允许换行
- 不允许解释
- 不允许代码块

格式：
{"trend":"上涨/下跌/搁浅","confidence":整数,"core_factor":"一句话原因"}

如果信息不足，confidence不超过60。

搜索结果如下：
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
      // 如果解析失败，返回默认值
      trendResult = {
        trend: "搁浅",
        confidence: 50,
        core_factor: "AI分析失败，信息不足",
      };
    }

    // 验证数据结构
    if (!trendResult.trend || !trendResult.core_factor) {
      throw new Error("LLM返回的数据格式不正确");
    }

    return NextResponse.json({
      success: true,
      data: trendResult,
      searchContext: searchContext.substring(0, 500), // 返回部分搜索上下文用于调试
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
