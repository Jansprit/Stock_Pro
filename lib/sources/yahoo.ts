/**
 * Yahoo Finance v8/chart 適配器
 *
 * 為何不用 yahoo-finance2 套件：實測 2026-07-04 該套件走 query{1,2}/v10/quoteSummary
 * 對本機 IP 已 IP-level 持續 429。但 query{1,2}/v8/finance/chart 仍可直連 200，
 * 因此本適配器完全手動呼叫。
 *
 * 提供：
 *  - getHistoricalChart(symbol, range) — K 線 + meta 報價
 */

import type { PricePoint, ChartRange } from '../types';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://finance.yahoo.com',
  Referer: 'https://finance.yahoo.com/',
};

const QUERY_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

export interface YahooChartMeta {
  symbol: string;
  shortName?: string;
  longName?: string;
  currency: string;
  exchangeName: string;
  fullExchangeName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  marketCap?: number;
  trailingPE?: number;
  // 時間戳
  regularMarketTime: number;
}

export interface YahooChartResult {
  meta: YahooChartMeta;
  points: PricePoint[];
}

/**
 * range → (Yahoo range 字串, interval 字串) 對照
 */
const RANGE_CONFIG: Record<ChartRange, { range: string; interval: string }> = {
  '1M': { range: '1mo', interval: '1d' },
  '3M': { range: '3mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
};

/**
 * 從 Yahoo v8/chart 抓取即時報價 + K 線
 *
 * 會輪流嘗試 query1 / query2，任一成功即可。
 */
export async function fetchYahooChart(
  symbol: string,
  range: ChartRange = '1Y',
): Promise<YahooChartResult | null> {
  const sym = encodeURIComponent(symbol);
  const { range: rangeStr, interval } = RANGE_CONFIG[range];

  const errors: string[] = [];

  for (const host of QUERY_HOSTS) {
    const url = `https://${host}/v8/finance/chart/${sym}?range=${rangeStr}&interval=${interval}`;
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) {
        errors.push(`${host}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as YahooChartApiResponse;
      const result = json?.chart?.result?.[0];
      if (!result) {
        errors.push(`${host}: no result`);
        continue;
      }

      const meta = parseYahooMeta(result.meta);
      const points = parseYahooQuotes(result);
      return { meta, points };
    } catch (e) {
      errors.push(`${host}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.error(`[yahoo] chart failed for ${symbol}: ${errors.join(' | ')}`);
  return null;
}

/**
 * 只抓即時報價（range=1d, interval=5m）— 比 fetchYahooChart 輕量
 */
export async function fetchYahooQuickQuote(symbol: string): Promise<YahooChartMeta | null> {
  const sym = encodeURIComponent(symbol);

  for (const host of QUERY_HOSTS) {
    const url = `https://${host}/v8/finance/chart/${sym}?range=1d&interval=5m`;
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) continue;
      const json = (await res.json()) as YahooChartApiResponse;
      const meta = json?.chart?.result?.[0]?.meta;
      if (meta) return parseYahooMeta(meta);
    } catch {
      // try next host
    }
  }
  return null;
}

// ========== Yahoo API 原始回傳型別（部分） ==========

interface YahooChartApiResponse {
  chart: {
    result?: Array<{
      meta: YahooRawMeta;
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
        adjclose?: Array<{
          adjclose?: Array<number | null>;
        }>;
      };
    }>;
    error: unknown | null;
  };
}

interface YahooRawMeta {
  symbol: string;
  shortName?: string;
  longName?: string;
  currency: string;
  exchangeName: string;
  fullExchangeName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  marketCap?: number;
  trailingPE?: number;
  regularMarketTime: number;
}

// ========== 型別轉換 ==========

function parseYahooMeta(raw: YahooRawMeta): YahooChartMeta {
  return {
    symbol: raw.symbol,
    shortName: raw.shortName,
    longName: raw.longName,
    currency: raw.currency || 'USD',
    exchangeName: raw.exchangeName || '',
    fullExchangeName: raw.fullExchangeName || '',
    regularMarketPrice: num(raw.regularMarketPrice),
    regularMarketChange: num(raw.regularMarketChange),
    regularMarketChangePercent: num(raw.regularMarketChangePercent),
    regularMarketPreviousClose: num(raw.regularMarketPreviousClose),
    regularMarketOpen: num(raw.regularMarketOpen),
    regularMarketDayHigh: num(raw.regularMarketDayHigh),
    regularMarketDayLow: num(raw.regularMarketDayLow),
    regularMarketVolume: num(raw.regularMarketVolume),
    fiftyTwoWeekHigh: raw.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: raw.fiftyTwoWeekLow,
    marketCap: raw.marketCap,
    trailingPE: raw.trailingPE,
    regularMarketTime: raw.regularMarketTime,
  };
}

function parseYahooQuotes(result: NonNullable<YahooChartApiResponse['chart']['result']>[number]): PricePoint[] {
  const ts = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) return [];

  const out: PricePoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];

    // 跳過 null 值
    if (close == null || open == null || high == null || low == null) continue;

    out.push({
      date: new Date(t * 1000).toISOString().split('T')[0],
      open: num(open),
      high: num(high),
      low: num(low),
      close: num(close),
      volume: num(volume ?? 0),
    });
  }
  return out;
}

function num(v: number | null | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}