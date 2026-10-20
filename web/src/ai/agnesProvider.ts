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
