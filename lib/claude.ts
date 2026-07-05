/**
 * AI 報告生成（OpenAI 相容 /chat/completions）
 *
 * 中轉站設定：
 *   - 端點：process.env.AI_RELAY_BASE_URL （預設見下方 DEFAULT_BASE_URL）
 *   - 模型：process.env.AI_RELAY_MODEL     （預設 MiniMax-M2.7）
 *   - Key  ：process.env.AI_RELAY_API_KEY  （中轉站 token）
 *
 * 注意：變數名刻意避開 ANTHROPIC_*，因為 Claude Code shell 環境會注入
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:15721 把它導到本地 proxy，
 *   會優先於 .env.local 導致我們的中轉站被忽略。
 *
 * 改動紀錄：
 *   - 2026-07-04：從 @anthropic-ai/sdk 改為 OpenAI 相容 fetch 呼叫中轉站
 *   - 環境變數由 ANTHROPIC_* 改為 AI_RELAY_*
 *   - 介面（generateAIReport / isClaudeAvailable / AIGenerationInput）維持不變，
 *     因此 app/api/ai-report/route.ts 不需改動。
 */

import type { AIReport } from './types';

const DEFAULT_BASE_URL = 'https://your-ai-relay.example.com';
const DEFAULT_MODEL = 'MiniMax-M2.7';

const BASE_URL = (process.env.AI_RELAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const MODEL = process.env.AI_RELAY_MODEL || DEFAULT_MODEL;

function getApiKey(): string | null {
  const key = process.env.AI_RELAY_API_KEY;
  return key && key.trim() !== '' ? key.trim() : null;
}

/** 判斷 AI 服務是否可用（key + 端點齊備即視為可用） */
export function isClaudeAvailable(): boolean {
  return getApiKey() !== null && BASE_URL.length > 0;
}

// ========== OpenAI 相容 chat/completions 呼叫 ==========

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string; type?: string; code?: string | number };
}

async function callChatJSON(systemPrompt: string, userPrompt: string, maxTokens = 4500): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('AI API 金鑰未設定（請在 .env.local 設定 ANTHROPIC_API_KEY）');
  }

  const url = `${BASE_URL}/v1/chat/completions`;
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const body = {
    model: MODEL,
    messages,
    max_tokens: 8000,
    temperature: 0.4,
    // 要求 JSON 格式（OpenAI 相容端點支援 response_format: json_object）
    response_format: { type: 'json_object' as const },
  };

  const doFetch = async (): Promise<ChatCompletionResponse> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const hint = /未配置供应商|provider not configured|供应商/i.test(errText)
        ? '（中轉站尚未啟用此模型/供應商；請聯絡中轉站管理者或在 .env.local 改用其他模型）'
        : '';
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}${hint}`);
    }
    return (await res.json()) as ChatCompletionResponse;
  };

  let json: ChatCompletionResponse;
  try {
    json = await doFetch();
  } catch (err) {
    // 網路瞬斷時 retry 一次
    const msg = err instanceof Error ? err.message : String(err);
    if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(msg)) {
      try {
        json = await doFetch();
      } catch {
        throw new Error('AI API 呼叫失敗（網路錯誤）');
      }
    } else {
      throw new Error(`AI API 呼叫失敗：${msg}`);
    }
  }

  if (json.error) {
    const errCode = typeof json.error.code === 'number' ? String(json.error.code) : json.error.code;
  const errMsg = json.error.message ?? errCode ?? 'unknown';
    // 將常見中轉站錯誤訊息翻成中文，幫助排查
    const hint = /未配置供应商|provider not configured|供应商/i.test(errMsg)
      ? '（中轉站尚未啟用此模型/供應商；請聯絡中轉站管理者或在 .env.local 改用其他模型）'
      : '';
    throw new Error(`AI API 錯誤：${errMsg}${hint}`);
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI 回傳內容為空');
  }
  return content;
}

function parseJSON<T>(text: string): T {
  let cleaned = text.trim();

  // 1. 移除 markdown code block
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  // 2. 嘗試直接解析
  if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // 落到下方 brace-extract
    }
  }

  // 3. 從文字中抽出第一個完整 {...} JSON 物件
  //    用 brace counter 避免被字串內的 { } 干擾
  const start = cleaned.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end > start) {
      const candidate = cleaned.slice(start, end + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch (err) {
        console.error('[ai] brace-extract failed:', err, '\nCandidate:', candidate.slice(0, 500));
      }
    }
  }

  console.error('[ai] JSON parse failed. Text preview:', text.slice(0, 500));
  throw new Error('AI 回傳格式無法解析');
}

// ========== 對外入口（介面與舊版完全相同） ==========

export async function generateAIReport(input: AIGenerationInput): Promise<AIReport> {
  const { buildMainPrompt } = await import('./prompts');
  const systemPrompt = buildMainPrompt.system();
  const userPrompt = buildMainPrompt.user(input);

  const text = await callChatJSON(systemPrompt, userPrompt, 8000);
  return parseJSON<AIReport>(text);
}

export interface AIGenerationInput {
  overview: {
    symbol: string;
    name: string;
    exchange: string;
    sector?: string;
    industry?: string;
    description?: string;
    marketCap?: number;
    price: number;
    eps?: number;
    pe?: number;
    currency: string;
  };
  financials: {
    years: Array<{
      year: number;
      revenue: number;
      grossProfit: number;
      netIncome: number;
      eps: number;
      freeCashFlow: number;
      totalLiabilities: number;
      totalEquity: number;
      grossMargin: number;
      netMargin: number;
      roe: number;
      debtToEquity: number;
    }>;
  };
  news: Array<{
    title: string;
    summary: string;
    sentiment: string;
    category: string;
  }>;
  competitors: Array<{
    name: string;
    marketPosition: string;
    coreStrength: string;
    coreRisk: string;
  }>;
}