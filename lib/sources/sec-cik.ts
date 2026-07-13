/**
 * SEC EDGAR CIK 反查工具
 *
 * 從 ticker symbol 反查 10 位 CIK 編號。
 * 端點：https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={sym}&type=10-K&dateb=&owner=include&count=10
 *
 * 由於 SEC EDGAR 對 symbol 搜尋的 HTML 頁面非結構化，這裡用 ticker→CIK JSON 對照表：
 * 端點：https://www.sec.gov/files/company_tickers.json
 * 該檔案每日更新，包含所有上市公司的 symbol→CIK 對應。
 *
 * 24h 快取即可（每日更新）。
 */

import { cached } from '../cache';

const TTL = 24 * 60 * 60 * 1000;
const UA = `Stock-Pro Research ${process.env.SEC_USER_AGENT ?? 'research@example.com'}`;
const HEADERS = { 'User-Agent': UA, Accept: 'application/json' };

interface SecTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

type SecTickerMap = Record<string, SecTickerEntry>;

async function fetchTickerMap(): Promise<SecTickerMap | null> {
  return cached('sec:ticker-map:v2', TTL, async () => {
    try {
      const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
        headers: HEADERS,
        // 公司 ticker 對照表 ~800KB，接近 Next.js fetch cache 2MB 上限
        cache: 'no-store',
      });
      if (!res.ok) {
        console.warn(`[sec-cik] tickers.json HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as SecTickerMap;
    } catch (e) {
      console.warn('[sec-cik] tickers.json failed:', e instanceof Error ? e.message : e);
      return null;
    }
  });
}

/**
 * 把 ticker symbol 轉成 SEC CIK 編號
 *
 * @returns CIK 數字，若查不到回傳 null
 */
export async function lookupCikByTicker(symbol: string): Promise<number | null> {
  const map = await fetchTickerMap();
  if (!map) return null;
  const target = symbol.toUpperCase().replace(/\.(TW|TWO)$/i, '');

  // 1. 直接對應（精確比對）
  for (const entry of Object.values(map)) {
    if (entry.ticker.toUpperCase() === target) {
      // 但要排除常見的「同名陷阱」：例如 HP 對到 Helmerich & Payne
      // 而 HPQ 才對到 HP Inc. — Q-suffix ticker 通常是 NYSE/NASDAQ 的普通股
      // 簡單啟發：若 ticker 只有 1-3 個字母，且 .Q/.X 版也在 map 裡，
      //   優先選 .Q 版本（避免對到石油鑽探、礦業等小型同名公司）
      const len = target.length;
      if (len <= 3 && !target.endsWith('Q')) {
        const qVer = `${target}Q`;
        const qHit = Object.values(map).find((e) => e.ticker.toUpperCase() === qVer);
        if (qHit) return qHit.cik_str;
      }
      return entry.cik_str;
    }
  }

  // 2. 退路：嘗試加 .Q 後綴
  if (!target.endsWith('Q')) {
    for (const entry of Object.values(map)) {
      if (entry.ticker.toUpperCase() === `${target}Q`) return entry.cik_str;
    }
  }

  return null;
}