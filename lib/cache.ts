/**
 * 簡易記憶體快取 - 避免重複打 Yahoo Finance
 *
 * 注意：這是單機進程記憶體，重啟失效。
 * 在 Vercel 等 serverless 環境中每個 instance 各有獨立快取。
 */

interface CacheEntry<T> {
  value: T;
  expireAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * 取得快取值；若過期返回 undefined
 */
export function get<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expireAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/**
 * 設定快取值（TTL 毫秒，預設 60 分鐘）
 *
 * 從原本的 5 分鐘延長為 60 分鐘：因為多源架構下每個資料源都有免費額度限制，
 * 大幅延長快取可顯著降低 API 請求次數。股價等即時資料若有需要仍可傳入較短 TTL。
 */
export function set<T>(key: string, value: T, ttlMs: number = 60 * 60 * 1000): void {
  store.set(key, { value, expireAt: Date.now() + ttlMs });
}

/**
 * 包裝函式：自動套用快取
 *
 * @example
 *   const data = await cached('aapl:quote', 5 * 60 * 1000, () => fetchQuote('AAPL'));
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = get<T>(key);
  if (hit !== undefined) return hit;
  const fresh = await fetcher();
  set(key, fresh, ttlMs);
  return fresh;
}

/**
 * 清除所有快取
 */
export function clear(): void {
  store.clear();
}