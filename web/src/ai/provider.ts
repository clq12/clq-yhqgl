import type { Coupon } from '../types/coupon';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIContext {
  coupons: Coupon[];
  provider: string;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
}

export interface AiIntent {
  intent: 'create' | 'update' | 'delete' | 'query' | 'chat';
  targetId: string | null;
  changes: Record<string, string | null>;
  filters: Record<string, string | null>;
  reasoning: string;
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string>;
  parseIntent(text: string, context: AIContext, signal?: AbortSignal): Promise<AiIntent>;
  /** 识图：传 data URL（data:image/jpeg;base64,...），返回与文字指令一致的结构 */
  recognizeImage?(imageDataUrl: string, context: AIContext, signal?: AbortSignal): Promise<AiIntent>;
}
