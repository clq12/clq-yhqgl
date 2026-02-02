import { NextRequest, NextResponse } from 'next/server';

const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

interface GLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GLMRequest {
  model: string;
  messages: GLMMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface GLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
    code?: string;
  };
}

interface ParsedCoupon {
  title: string | null;
  type: '满减' | '折扣' | '直减' | '其他' | null;
  threshold: number | null;
  amountOff: number | null;
  discountRate: number | null;
  validFrom: string | null;
  validTo: string | null;
  platform: string | null;
  notes: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, apiKey } = body;

    if (!text) {
      return NextResponse.json(
        { error: '请提供优惠券文本' },
        { status: 400 }
      );
    }

    // API Key 优先级：请求参数 > 环境变量
    const finalApiKey = apiKey || process.env.GLM_API_KEY;

    if (!finalApiKey) {
      return NextResponse.json(
        { error: '请提供API Key或在环境变量中配置GLM_API_KEY' },
        { status: 401 }
      );
    }

    const messages: GLMMessage[] = [
      {
        role: 'system',
        content: '你是一个优惠券信息抽取引擎，只负责从文本中提取结构化数据，禁止解释、禁止补全、禁止对话。'
      },
      {
        role: 'user',
        content: `【字段说明】\n- title: 优惠券名称\n- type: 满减 | 折扣 | 直减 | 其他\n- threshold: number | null\n- amountOff: number | null\n- discountRate: number | null\n- validFrom: string | null\n- validTo: string | null\n- platform: string | null\n- notes: string | null\n\n【规则】\n- 文本中没有的信息必须返回 null\n- 不允许猜测或补全\n- 必须严格输出 JSON 对象\n- 不要包含多余字段\n\n【优惠券文本】\n${text}`
      }
    ];

    const requestBody: GLMRequest = {
      model: 'glm-4.7-flash',
      messages,
      temperature: 0,
      max_tokens: 512
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${finalApiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    const data: GLMResponse = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'GLM API 调用失败' },
        { status: response.status }
      );
    }

    const content = data.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'API返回内容为空' },
        { status: 500 }
      );
    }

    // 提取JSON内容（可能包含markdown标记）
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    let parsedCoupon: ParsedCoupon;
    try {
      parsedCoupon = JSON.parse(jsonStr);
    } catch (parseError) {
      return NextResponse.json(
        { error: '解析JSON失败', rawContent: content },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: parsedCoupon,
      rawContent: content
    });

  } catch (error) {
    console.error('GLM API Error:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
