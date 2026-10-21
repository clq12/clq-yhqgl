import type { AIProvider, AIContext, AiIntent, ChatMessage } from './provider';

export class AgnesProvider implements AIProvider {
  name = 'agnes';

  constructor(
    private apiKey: string,
    private baseUrl = 'https://api.agnes.ai/v1',
    private model = 'agnes-chat'
  ) {}

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0,
      }),
    });
    if (!res.ok) throw new Error(`AI 请求失败: ${res.status}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? '';
  }

  async parseIntent(text: string, context: AIContext, signal?: AbortSignal): Promise<AiIntent> {
    const systemPrompt = `你是优惠券管理助手。请把用户的自然语言命令解析为结构化 JSON。
字段：intent(create/update/delete/query/chat)、targetId(string|null)、changes(Map<string,string|null>)、filters(Map<string,string|null>)、reasoning(string)。
折扣类型只能是 amount/percentage/full/group 之一。日期格式 YYYY-MM-DD。
当前共有 ${context.coupons.length} 张优惠券。
只输出合法 JSON，不要多余解释。`;

    const raw = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      signal
    );

    const cleaned = raw
      .trim()
      .replace(/^```json\s*/, '')
      .replace(/^```\s*/, '')
      .replace(/```$/, '')
      .trim();

    return JSON.parse(cleaned) as AiIntent;
  }

  /**
   * 识图：把优惠券截图丢给多模态模型，抽成和文字指令一样的 AiIntent。
   *
   * 走 OpenAI 兼容的 content 数组格式（text + image_url），base64 内联不依赖图床。
   * 模型不支持图片时接口一般返回 400，这里原样抛出，让用户去设置里换个模型。
   */
  async recognizeImage(
    imageDataUrl: string,
    _context: AIContext,
    signal?: AbortSignal,
  ): Promise<AiIntent> {
    const systemPrompt = `你是优惠券识别助手。请读取图片里的优惠券信息并输出结构化 JSON。
字段：intent 固定为 "create"、targetId 为 null、changes 为对象、filters 为空对象、reasoning 为简短说明。
changes 可用键：title、description、discountType、discountAmount、fullAmount、startDate、endDate、endHour、endMinute、notes、tags。
discountType 只能是 amount（立减金额）/percentage（几折）/full（满减）/group（团购）之一；日期格式 YYYY-MM-DD；tags 用逗号分隔。
图片里没有的信息不要编造，直接省略该键。只输出合法 JSON，不要解释。`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: '识别这张图里的优惠券' },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`识图失败（${res.status}）。请确认该助手选择的是支持图片的模型。${body.slice(0, 120)}`);
    }
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const raw = data.choices[0]?.message?.content ?? '';
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/, '')
      .replace(/^```\s*/, '')
      .replace(/```$/, '')
      .trim();
    return JSON.parse(cleaned) as AiIntent;
  }
}

export function createProvider(context: AIContext): AIProvider {
  const key = context.apiKey;
  if (!key) throw new Error('未配置 AI API Key');
  switch (context.provider) {
    case 'agnes':
      return new AgnesProvider(key, context.baseUrl || undefined, context.model || undefined);
    default:
      throw new Error(`不支持的 AI Provider: ${context.provider}`);
  }
}
