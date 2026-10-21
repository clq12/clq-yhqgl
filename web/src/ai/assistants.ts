import type { AiAssistant, AppSettings, Coupon } from '../types/coupon';
import type { AIContext } from './provider';

/**
 * 实际生效的助手列表。
 *
 * 老配置里只有一个 `ai`（provider/key/baseUrl/model），没有 `aiAssistants`。
 * 为了不让升级后「设置里的 key 突然不见了」，这里把它当成唯一助手兜底出来。
 * 一旦用户在设置里点过「添加助手」，就以 `aiAssistants` 为准。
 */
export function effectiveAssistants(settings: AppSettings | undefined | null): AiAssistant[] {
  if (!settings) return [];
  const list = settings.aiAssistants ?? [];
  if (list.length > 0) return list;

  const legacy = settings.ai;
  if (!legacy?.apiKey) return [];
  return [
    {
      id: 'legacy-default',
      name: legacy.provider === 'agnes' ? '默认助手' : legacy.provider || 'AI 助手',
      provider: legacy.provider || 'agnes',
      baseUrl: legacy.baseUrl,
      model: legacy.model,
      apiKey: legacy.apiKey,
      // 老配置里看不出模型是否支持图片，先允许尝试：真不支持时接口会报错，提示比"禁用按钮"更有用
      vision: true,
    },
  ];
}

/** 当前选中的助手；没指定就取第一个 */
export function activeAssistant(settings: AppSettings | undefined | null): AiAssistant | null {
  const list = effectiveAssistants(settings);
  if (list.length === 0) return null;
  const id = settings?.activeAssistantId;
  return list.find((a) => a.id === id) ?? list[0];
}

/** 能识图的助手（设置里勾了「支持图片」） */
export function visionAssistants(settings: AppSettings | undefined | null): AiAssistant[] {
  return effectiveAssistants(settings).filter((a) => a.vision);
}

export function toContext(assistant: AiAssistant, coupons: Coupon[]): AIContext {
  return {
    coupons,
    provider: assistant.provider,
    apiKey: assistant.apiKey,
    baseUrl: assistant.baseUrl,
    model: assistant.model,
  };
}

/** 生成一个不重复的助手 id（用时间戳 + 随机后缀，够用且不用引依赖） */
export function newAssistantId(): string {
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
