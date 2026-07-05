/**
 * FRED API 適配器
 *
 * 用途：抓 10 年期美國公債殖利率（DGS10），作為 WACC 公式的無風險利率（rf）。
 *
 * 免費，但需 API key。註冊：https://fred.stlouisfed.org/docs/api/api_key.html
 * 沒設 FRED_API_KEY 時 fallback 到寫死常數 4.5%（2026 年合理中位數）。
 *
 * 24h 快取：美債殖利率每日變動幅度不大。
 */

const URL = 'https://api.stlouisfed.org/fred/series/observations';
const TTL = 24 * 60 * 60 * 1000;

export const FALLBACK_RF = 0.045; // 4.5%

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

export async function fetchRiskFreeRate(): Promise<number> {
  const { cached } = await import('../cache');
  return cached('fred:DGS10', TTL, async () => {
    const key = process.env.FRED_API_KEY;
    if (!key) {
      console.log('[fred] no FRED_API_KEY, using fallback rf=4.5%');
      return FALLBACK_RF;
    }
    try {
      const params = new URLSearchParams({
        series_id: 'DGS10',
        api_key: key,
        file_type: 'json',
        sort_order: 'desc',
        limit: '5', // 取最近 5 筆，避免單日缺值
      });
      const res = await fetch(`${URL}?${params.toString()}`);
      if (!res.ok) {
        console.warn(`[fred] DGS10 HTTP ${res.status}, using fallback`);
        return FALLBACK_RF;
      }
      const json = (await res.json()) as FredResponse;
      const obs = json.observations ?? [];
      // 第一筆非空值
      for (const o of obs) {
        const v = parseFloat(o.value);
        if (isFinite(v)) return v / 100; // FRED 回傳百分位數字，轉小數
      }
      return FALLBACK_RF;
    } catch (e) {
      console.warn('[fred] DGS10 failed:', e instanceof Error ? e.message : e);
      return FALLBACK_RF;
    }
  });
}