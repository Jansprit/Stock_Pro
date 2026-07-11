/**
 * 共用 HTTP utility（給所有 source 共用）
 */

import { Agent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

/** 共用 keep-alive agent（避免每個 fetch 都建新連線） */
export const newHttpAgent = () => ({
  http: new Agent({ keepAlive: true, maxSockets: 8 }),
  https: new HttpsAgent({ keepAlive: true, maxSockets: 8 }),
});

/** 帶 timeout 的 fetch（預設 12 秒，台灣網站通常比較慢） */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  options: { timeout?: number; agent?: ReturnType<typeof newHttpAgent> } = {},
): Promise<string> {
  const { timeout = 12000, agent } = options;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      // @ts-expect-error Node fetch 擴充
      agent: agent,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  } finally {
    clearTimeout(id);
  }
}
