/**
 * Finnhub 適配器
 *
 * 免費額度：60 次/分鐘
 * 用途：報價、搜尋、新聞、公司資料、估值指標
 * API key：https://finnhub.io/ 註冊取得
 */

import type { SearchResult, StockOverview, NewsItem, Sentiment } from '../types';

const BASE_URL = 'https://finnhub.io/api/v1';

function getApiKey(): string | null {
  const key = process.env.FINNHUB_API_KEY;
  return key && key.length > 0 ? key : null;
}

/** 判斷 API key 是否可用（沒設 key 就跳過 Finnhub 進入下一個備援） */
export function isAvailable(): boolean {
  return getApiKey() !== null;
}

// ========== 即時報價 ==========
// /quote — 公開報價（last price、change、high、low、open、prevClose）

export interface FinnhubQuote {
  c: number; // current price
  d: number; // change
  dp: number; // percent change
  h: number; // day high
  l: number; // day low
  o: number; // day open
  pc: number; // previous close
  t: number; // timestamp
}

export async function fetchQuote(symbol: string): Promise<FinnhubQuote | null> {
  const key = getApiKey();
  if (!key) return null;
  try {
    const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[finnhub] /quote ${symbol}: HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as FinnhubQuote;
    if (!json.c || json.c === 0) return null; // 0 代表沒資料
    return json;
  } catch (e) {
    console.error(`[finnhub] /quote ${symbol} failed:`, e);
    return null;
  }
}

// ========== 公司基本資料 ==========
// /stock/profile2 — name、ticker、exchange、currency、country、industry、weburl、logo、marketCap

interface FinnhubProfile {
  country?: string;
  currency?: string;
  exchange?: string;
  name?: string;
  ticker?: string;
  weburl?: string;
  logo?: string;
  marketCapitalization?: number; // 單位百萬
  shareOutstanding?: number;
  ipo?: string;
  industry?: string;
  finnhubIndustry?: string;
  description?: string;
}

export async function fetchProfile(symbol: string): Promise<FinnhubProfile | null> {
  const key = getApiKey();
  if (!key) return null;
  try {
    const url = `${BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as FinnhubProfile;
    return json?.name ? json : null;
  } catch (e) {
    console.error(`[finnhub] /profile2 ${symbol} failed:`, e);
    return null;
  }
}

// ========== 估值指標 ==========
// /stock/metric?metric=all — peBasicExtraTTM、epsBasicExtraTTM、beta、52WeekHigh、52WeekLow、dividendYieldIndicatedAnnual 等

interface FinnhubMetric {
  metric: Record<string, number | string | null>;
  series?: Record<string, { period: string[]; value: number[] }>;
}

export async function fetchMetric(symbol: string): Promise<FinnhubMetric['metric'] | null> {
  const key = getApiKey();
  if (!key) return null;
  try {
    const url = `${BASE_URL}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as FinnhubMetric;
    return json?.metric ?? null;
  } catch (e) {
    console.error(`[finnhub] /metric ${symbol} failed:`, e);
    return null;
  }
}

// ========== 搜尋 ==========
// /search?q= — symbol、description、type、displaySymbol

interface FinnhubSearchResult {
  count: number;
  result: Array<{
    symbol: string;
    description: string;
    type: string;
    displaySymbol?: string;
  }>;
}

export async function fetchSearch(query: string): Promise<SearchResult[]> {
  const key = getApiKey();
  if (!key) return [];
  try {
    const url = `${BASE_URL}/search?q=${encodeURIComponent(query)}&token=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[finnhub] /search ${query}: HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as FinnhubSearchResult;
    return (json.result ?? [])
      // 放寬 filter：除了股票/ADR/Equity，也接受 ETF/ETP/Closed End Fund
      // 否則台股 ETF（00918 等）會被過濾掉，導致前端無法查詢
      .filter((r) => r.symbol && /Common Stock|ADR|Equity|ETF|ETP|Fund|REIT/i.test(r.type))
      .slice(0, 10)
      .map((r) => ({
        symbol: r.symbol,
        name: r.description,
        exchange: r.displaySymbol ?? '',
        type: r.type,
      }));
  } catch (e) {
    console.error(`[finnhub] /search ${query} failed:`, e);
    return [];
  }
}

// ========== 公司新聞 ==========
// /company-news?symbol=&from=YYYY-MM-DD&to=YYYY-MM-DD

interface FinnhubNewsItem {
  category: string;
  datetime: number; // unix seconds
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export async function fetchCompanyNews(symbol: string, daysBack = 7): Promise<NewsItem[]> {
  const key = getApiKey();
  if (!key) return [];
  const now = new Date();
  const past = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const from = past.toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  try {
    const url = `${BASE_URL}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[finnhub] /company-news ${symbol}: HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as FinnhubNewsItem[];
    if (!Array.isArray(json)) return [];
    return json.slice(0, 10).map((n) => ({
      title: n.headline,
      publisher: n.source,
      link: n.url,
      publishDate: new Date(n.datetime * 1000).toISOString(),
      summary: truncate(n.summary || n.headline, 120),
      category: categorizeNews(n.category, n.headline),
      sentiment: detectSentiment(n.headline),
      impact: '', // 將由 combine 階段填入
    }));
  } catch (e) {
    console.error(`[finnhub] /company-news ${symbol} failed:`, e);
    return [];
  }
}

// ========== 型別轉換：合併 quote + profile + metric 成 StockOverview ==========

/**
 * 把 Finnhub 的三塊資料合併成 StockOverview
 * 回傳 null 表示完全沒拿到資料
 */
export async function buildStockOverview(symbol: string): Promise<StockOverview | null> {
  if (!isAvailable()) return null;
  const [quote, profile, metric] = await Promise.all([
    fetchQuote(symbol),
    fetchProfile(symbol),
    fetchMetric(symbol),
  ]);

  if (!quote && !profile) return null;

  const num = (v: unknown): number | undefined => {
    if (v == null) return undefined;
    const n = Number(v);
    return isFinite(n) ? n : undefined;
  };

  // profile 給的基本資料優先
  const overview: StockOverview = {
    symbol: symbol.toUpperCase(),
    name: profile?.name ?? symbol,
    exchange: profile?.exchange ?? '',
    currency: profile?.currency ?? 'USD',
    price: num(quote?.c) ?? 0,
    change: num(quote?.d) ?? 0,
    changePercent: num(quote?.dp) ?? 0,
    previousClose: num(quote?.pc) ?? 0,
    open: num(quote?.o) ?? 0,
    dayHigh: num(quote?.h) ?? 0,
    dayLow: num(quote?.l) ?? 0,
    volume: 0,
    marketCap: profile?.marketCapitalization !== undefined
      ? profile.marketCapitalization * 1e6 // Finnhub 單位是百萬
      : undefined,
    trailingPE: num(metric?.peBasicExtraTTM),
    forwardPE: undefined,
    eps: num(metric?.epsBasicExtraTTM),
    beta: num(metric?.beta),
    dividendYield: num(metric?.dividendYieldIndicatedAnnual),
    fiftyTwoWeekHigh: num(metric?.['52WeekHigh']),
    fiftyTwoWeekLow: num(metric?.['52WeekLow']),
    sector: '',
    industry: profile?.finnhubIndustry ?? profile?.industry ?? '',
    description: profile?.description,
    website: profile?.weburl,
    country: profile?.country,
    employees: undefined,
    founded: profile?.ipo,
    headquarters: profile?.country,
    ceo: '',
  };

  return overview;
}

// ========== 工具函式 ==========

function truncate(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

const POSITIVE_KEYWORDS = [
  'beat', 'beats', 'exceed', 'surge', 'rally', 'jump', 'gain', 'rise', 'record', 'high',
  'upgrade', 'strong', 'growth', 'profit', 'wins', 'success', 'breakthrough',
];

const NEGATIVE_KEYWORDS = [
  'miss', 'fall', 'drop', 'plunge', 'decline', 'loss', 'downgrade', 'weak', 'lawsuit',
  'investigation', 'fine', 'recall', 'layoff', 'cuts', 'bankruptcy', 'fraud', 'scandal',
];

function detectSentiment(text: string): Sentiment {
  const lower = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const k of POSITIVE_KEYWORDS) if (lower.includes(k)) pos++;
  for (const k of NEGATIVE_KEYWORDS) if (lower.includes(k)) neg++;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

function categorizeNews(category: string, title: string): NewsItem['category'] {
  const t = title.toLowerCase();
  if (/lawsuit|investigation|probe|fine|regulator|sec|antitrust|legal|scandal/.test(t)) return 'legal';
  if (/earnings|revenue|profit|quarter|q[1-4]|fiscal|guidance|forecast|eps/.test(t)) return 'financials';
  if (/industry|market|sector|competitor|rival|launch|product/.test(t)) return 'industry';
  if (/stock|share price|investor|analyst|upgrade|downgrade|target/.test(t)) return 'market';
  // Finnhub 的 category 給的 hint
  if (category === 'company') return 'operations';
  return 'operations';
}