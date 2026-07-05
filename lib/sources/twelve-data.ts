/**
 * Twelve Data 適配器
 *
 * 免費額度：800 credits/天、8 credits/分鐘（不同端點扣不同 credits）
 * 用途：K 線、技術指標、報價、搜尋、貨幣/加密貨幣
 * API key：https://twelvedata.com/ 註冊取得
 *
 * 主要作為 Yahoo / Finnhub 的備援，避免單點故障。
 */

import type { PricePoint, SearchResult, ChartRange } from '../types';

const BASE_URL = 'https://api.twelvedata.com';

function getApiKey(): string | null {
  const key = process.env.TWELVE_DATA_API_KEY;
  return key && key.length > 0 ? key : null;
}

export function isAvailable(): boolean {
  return getApiKey() !== null;
}

interface TwelveDataResponse {
  status?: string; // 'ok' | 'error'
  message?: string; // error message
  code?: number;
  [key: string]: unknown;
}

/** 共用 fetch helper */
async function tdFetch(path: string, params: Record<string, string>): Promise<TwelveDataResponse | null> {
  const key = getApiKey();
  if (!key) return null;
  const searchParams = new URLSearchParams({ ...params, apikey: key });
  const url = `${BASE_URL}${path}?${searchParams.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[twelvedata] HTTP ${res.status} for ${path}`);
      return null;
    }
    const json = (await res.json()) as TwelveDataResponse;
    if (json.status === 'error' || json.code) {
      console.warn(`[twelvedata] ${path} error: ${json.message ?? json.code}`);
      return { __TD_ERROR__: true, message: json.message };
    }
    return json;
  } catch (e) {
    console.error(`[twelvedata] ${path} failed:`, e);
    return null;
  }
}

// ========== 報價 ==========
// /quote — symbol、name、exchange、currency、close、change、percent_change、volume、open、high、low、previous_close

interface TwelveQuote {
  symbol: string;
  name?: string;
  exchange?: string;
  currency?: string;
  close?: string;
  change?: string;
  percent_change?: string;
  volume?: string;
  open?: string;
  high?: string;
  low?: string;
  previous_close?: string;
}

export async function fetchQuote(symbol: string): Promise<TwelveQuote | null> {
  const json = await tdFetch('/quote', { symbol });
  if (!json || '__TD_ERROR__' in json) return null;
  return json as unknown as TwelveQuote;
}

// ========== K 線 ==========
// /time_series — values: [{datetime, open, high, low, close, volume}]

interface TwelveTimeSeriesValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface TwelveTimeSeries {
  meta?: { symbol: string; interval: string; currency?: string };
  values?: TwelveTimeSeriesValue[];
}

const RANGE_TO_TD: Record<ChartRange, { interval: string; outputsize: number }> = {
  '1M': { interval: '1day', outputsize: 30 },
  '3M': { interval: '1day', outputsize: 90 },
  '1Y': { interval: '1day', outputsize: 365 },
  '5Y': { interval: '1week', outputsize: 260 },
};

export async function fetchTimeSeries(
  symbol: string,
  range: ChartRange = '1Y',
): Promise<PricePoint[]> {
  const cfg = RANGE_TO_TD[range];
  const json = await tdFetch('/time_series', {
    symbol,
    interval: cfg.interval,
    outputsize: String(cfg.outputsize),
    order: 'ASC',
  });
  if (!json || '__TD_ERROR__' in json) return [];

  const values = (json as unknown as TwelveTimeSeries).values ?? [];
  return values
    .filter((v) => v.close && v.open)
    .map((v) => ({
      date: v.datetime.split(' ')[0], // 取 YYYY-MM-DD
      open: Number(v.open),
      high: Number(v.high),
      low: Number(v.low),
      close: Number(v.close),
      volume: Number(v.volume ?? 0),
    }));
}

// ========== 搜尋 ==========
// /symbol_search — data: [{symbol, instrument_name, exchange, country, currency}]

interface TwelveSearchItem {
  symbol: string;
  instrument_name: string;
  exchange: string;
  mic_code?: string;
  country?: string;
  currency?: string;
  type?: string;
}

interface TwelveSearchResponse {
  data: TwelveSearchItem[];
}

export async function fetchSearch(query: string): Promise<SearchResult[]> {
  const json = await tdFetch('/symbol_search', { symbol: query });
  if (!json || '__TD_ERROR__' in json) return [];
  const data = (json as unknown as TwelveSearchResponse).data ?? [];
  return data.slice(0, 10).map((d) => ({
    symbol: normalizeTwSymbol(d.symbol, d.exchange, d.mic_code),
    name: d.instrument_name,
    exchange: d.exchange,
    type: d.type ?? 'Equity',
    currency: d.currency,
  }));
}

/**
 * Twelve Data 對台股的 symbol 不含 .TW 後綴（例如 "00918"），
 * 但 Yahoo / Finnhub 都必須加 .TW 才能查到。
 * 統一在這層處理，避免呼叫端要個別處理。
 */
function normalizeTwSymbol(symbol: string, exchange?: string, micCode?: string): string {
  if (!symbol) return symbol;
  // 已經有 .TW / .TWO / .KS 等後綴就不處理
  if (/\.[A-Z]{2,3}$/.test(symbol)) return symbol;
  const isTaiwan =
    /TWSE|Taiwan|XTAI|TPEx/i.test(exchange ?? '') ||
    /XTAI|XTAE/i.test(micCode ?? '');
  if (isTaiwan) return `${symbol}.TW`;
  return symbol;
}