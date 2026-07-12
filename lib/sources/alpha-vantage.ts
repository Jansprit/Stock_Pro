/**
 * Alpha Vantage 適配器
 *
 * 免費額度：25 次/天、上限 5 次/分鐘（嚴格）
 * 用途：詳細基本面、年度/季度財報、技術指標、估值
 * API key：https://www.alphavantage.co/support/#api-key 免費申請
 *
 * 注意：此 API 在額度耗盡時會回 "Note" 或 "Information" 訊息而非錯誤，
 * 因此需特別處理這種「軟錯誤」。
 */

import type { FinancialsData, FinancialYear, SearchResult, StockOverview } from '../types';

const BASE_URL = 'https://www.alphavantage.co/query';

function getApiKey(): string | null {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  return key && key.length > 0 ? key : null;
}

export function isAvailable(): boolean {
  return getApiKey() !== null;
}

interface AlphaVantageResponse {
  [key: string]: unknown;
}

/**
 * 統一 fetch + 處理「Note/Information」軟錯誤
 * 當額度耗盡會回 {"Note": "..."} 或 {"Information": "..."}
 *
 * 速率節流：免費額度 25 次/天、上限 5 次/分鐘 → 強制每 13 秒最多一次
 * 最後呼叫時間記在全域變數，逾時就睡到能打為止
 */
let lastCallAt = 0;
const MIN_INTERVAL_MS = 13_000; // 13 秒 > 5/分鐘 餘裕

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = lastCallAt + MIN_INTERVAL_MS - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCallAt = Date.now();
}

export async function avFetch(params: Record<string, string>): Promise<AlphaVantageResponse | null> {
  const key = getApiKey();
  if (!key) return null;

  await throttle();

  const searchParams = new URLSearchParams({ ...params, apikey: key });
  const url = `${BASE_URL}?${searchParams.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[alphavantage] HTTP ${res.status} for ${params.function}`);
      return null;
    }
    const json = (await res.json()) as AlphaVantageResponse;

    // 軟錯誤：額度耗盡
    if (typeof json.Note === 'string' || typeof json.Information === 'string') {
      const msg = (json.Note as string) || (json.Information as string);
      console.warn(`[alphavantage] rate-limited: ${msg.slice(0, 200)}`);
      // 回傳特殊 sentinel，讓路由層知道要切下一個源（不再 retry）
      return { __AV_RATE_LIMITED__: true };
    }

    return json;
  } catch (e) {
    console.error(`[alphavantage] fetch failed for ${params.function}:`, e);
    return null;
  }
}

/** 是否為額度耗盡 sentinel */
export function isRateLimited(json: AlphaVantageResponse | null): boolean {
  return !!json && '__AV_RATE_LIMITED__' in json;
}

// ========== 公司總覽（OVERVIEW） ==========
// function=OVERVIEW — Symbol、Name、Description、Exchange、Currency、Country、Sector、Industry、
//   MarketCapitalization、PERatio、PEGRatio、EPS、Beta、DividendYield、52WeekHigh、52WeekLow 等

interface AlphaOverview {
  Symbol?: string;
  Name?: string;
  Description?: string;
  Exchange?: string;
  Currency?: string;
  Country?: string;
  Sector?: string;
  Industry?: string;
  MarketCapitalization?: string;
  PERatio?: string;
  PEGRatio?: string;
  EPS?: string;
  Beta?: string;
  DividendYield?: string;
  '52WeekHigh'?: string;
  '52WeekLow'?: string;
  '50DayMovingAverage'?: string;
  '200DayMovingAverage'?: string;
  SharesOutstanding?: string;
  Address?: string;
  OfficialSite?: string;
  FullTimeEmployees?: string;
  IPOYear?: string;
}

export async function fetchOverview(symbol: string): Promise<AlphaOverview | null> {
  const json = await avFetch({ function: 'OVERVIEW', symbol });
  if (!json || isRateLimited(json)) return null;
  return json as AlphaOverview;
}

/**
 * 把 AlphaOverview 轉成 StockOverview
 * （注意：這只填「估值+基本」，price/volume 還是要靠 Yahoo 或 Finnhub）
 */
export function overviewToStockOverview(alpha: AlphaOverview, baseSymbol: string): StockOverview {
  const num = (v: string | undefined): number | undefined => {
    if (v == null || v === 'None' || v === '-') return undefined;
    const n = Number(v);
    return isFinite(n) ? n : undefined;
  };

  return {
    symbol: alpha.Symbol ?? baseSymbol.toUpperCase(),
    name: alpha.Name ?? baseSymbol,
    exchange: alpha.Exchange ?? '',
    currency: alpha.Currency ?? 'USD',
    price: 0, // 由其他來源填
    change: 0,
    changePercent: 0,
    previousClose: 0,
    open: 0,
    dayHigh: 0,
    dayLow: 0,
    volume: 0,
    marketCap: num(alpha.MarketCapitalization),
    trailingPE: num(alpha.PERatio),
    forwardPE: undefined,
    eps: num(alpha.EPS),
    beta: num(alpha.Beta),
    dividendYield: num(alpha.DividendYield),
    fiftyTwoWeekHigh: num(alpha['52WeekHigh']),
    fiftyTwoWeekLow: num(alpha['52WeekLow']),
    sector: alpha.Sector ?? '',
    industry: alpha.Industry ?? '',
    description: alpha.Description,
    website: alpha.OfficialSite,
    country: alpha.Country,
    employees: num(alpha.FullTimeEmployees),
    founded: alpha.IPOYear,
    headquarters: alpha.Address,
    ceo: '',
  };
}

// ========== 年度損益表（INCOME_STATEMENT） ==========
// function=INCOME_STATEMENT — annualReports: [{fiscalDateEnding, totalRevenue, grossProfit, operatingIncome, netIncome, dilutedEPS}]

interface AlphaIncomeReport {
  fiscalDateEnding: string;
  reportedCurrency: string;
  totalRevenue?: string;
  grossProfit?: string;
  operatingIncome?: string;
  netIncome?: string;
  dilutedEPS?: string;
}

interface AlphaIncomeStatement {
  symbol: string;
  annualReports: AlphaIncomeReport[];
}

export async function fetchIncomeStatement(symbol: string): Promise<AlphaIncomeReport[] | null> {
  const json = await avFetch({ function: 'INCOME_STATEMENT', symbol });
  if (!json || isRateLimited(json)) return null;
  const reports = (json as unknown as AlphaIncomeStatement).annualReports;
  return reports ?? null;
}

// ========== 年度資產負債表（BALANCE_SHEET） ==========
// function=BALANCE_SHEET — annualReports: [{totalAssets, totalLiabilities, totalShareholderEquity, ...}]

interface AlphaBalanceSheetReport {
  fiscalDateEnding: string;
  reportedCurrency: string;
  totalAssets?: string;
  totalLiabilities?: string;
  totalShareholderEquity?: string;
  totalCurrentAssets?: string;
  totalCurrentLiabilities?: string;
}

interface AlphaBalanceSheet {
  symbol: string;
  annualReports: AlphaBalanceSheetReport[];
}

export async function fetchBalanceSheet(symbol: string): Promise<AlphaBalanceSheetReport[] | null> {
  const json = await avFetch({ function: 'BALANCE_SHEET', symbol });
  if (!json || isRateLimited(json)) return null;
  const reports = (json as unknown as AlphaBalanceSheet).annualReports;
  return reports ?? null;
}

// ========== 年度現金流量表（CASH_FLOW） ==========
// function=CASH_FLOW — annualReports: [{operatingCashflow, capitalExpenditures, ...}]

interface AlphaCashFlowReport {
  fiscalDateEnding: string;
  reportedCurrency: string;
  operatingCashflow?: string;
  capitalExpenditures?: string;
}

interface AlphaCashFlow {
  symbol: string;
  annualReports: AlphaCashFlowReport[];
}

export async function fetchCashFlow(symbol: string): Promise<AlphaCashFlowReport[] | null> {
  const json = await avFetch({ function: 'CASH_FLOW', symbol });
  if (!json || isRateLimited(json)) return null;
  const reports = (json as unknown as AlphaCashFlow).annualReports;
  return reports ?? null;
}

// ========== 完整財務報表組合 ==========

export async function fetchFinancials(symbol: string): Promise<FinancialsData | null> {
  if (!isAvailable()) return null;
  // 串行抓以避免節流碰撞（節流已內建 13s 間隔）
  const income = await fetchIncomeStatement(symbol);
  if (!income || income.length === 0) return null;
  const balance = await fetchBalanceSheet(symbol);
  const cashflow = await fetchCashFlow(symbol);

  // 從 OVERVIEW 拿最近 TTM EPS（給 INCOME_STATEMENT 缺 dilutedEPS 的外國發行人 fallback）
  let overviewEPS: number | undefined;
  try {
    const overview = await fetchOverview(symbol);
    if (overview?.EPS) {
      const n = Number(overview.EPS);
      if (isFinite(n) && n !== 0) overviewEPS = n;
    }
  } catch {
    // 忽略
  }

  const num = (v: string | undefined): number => {
    if (v == null || v === 'None' || v === '-') return 0;
    const n = Number(v);
    return isFinite(n) ? n : 0;
  };

  const safeDiv = (n: number, d: number): number =>
    !isFinite(n) || !isFinite(d) || d === 0 ? 0 : n / d;

  const years: FinancialYear[] = [];
  const limit = Math.min(income.length, 5);

  for (let i = 0; i < limit; i++) {
    const iy = income[i];
    const by = balance?.find((b) => b.fiscalDateEnding === iy.fiscalDateEnding);
    const cf = cashflow?.find((c) => c.fiscalDateEnding === iy.fiscalDateEnding);

    const revenue = num(iy.totalRevenue);
    const grossProfit = num(iy.grossProfit);
    const operatingIncome = num(iy.operatingIncome);
    const netIncome = num(iy.netIncome);
    // Alpha Vantage INCOME_STATEMENT 的 dilutedEPS 對外國發行人（NOK、TM 等 ADR）
    // 常是 "None"（漏欄位），需 fallback 用 OVERVIEW 的 EPS（最近 TTM）
    // 對美股本土發行人（如 AAPL）dilutedEPS 通常有值
    let eps = num(iy.dilutedEPS);
    if (eps === 0) {
      eps = overviewEPS ?? 0;
    }
    const totalAssets = num(by?.totalAssets);
    const totalLiabilities = num(by?.totalLiabilities);
    const totalEquity = num(by?.totalShareholderEquity);
    const operatingCashFlow = num(cf?.operatingCashflow);
    const capitalExpenditures = Math.abs(num(cf?.capitalExpenditures));
    const freeCashFlow = operatingCashFlow - capitalExpenditures;
    const totalCurrentAssets = num(by?.totalCurrentAssets);
    const totalCurrentLiabilities = num(by?.totalCurrentLiabilities);

    const year = iy.fiscalDateEnding ? Number(iy.fiscalDateEnding.slice(0, 4)) : 0;

    years.push({
      year,
      revenue,
      grossProfit,
      operatingIncome,
      netIncome,
      eps, // 改用 dilutedEPS（Alpha Vantage 仍有提供）
      totalAssets,
      totalLiabilities,
      totalEquity,
      operatingCashFlow,
      freeCashFlow,
      grossMargin: safeDiv(grossProfit, revenue) * 100,
      operatingMargin: safeDiv(operatingIncome, revenue) * 100,
      netMargin: safeDiv(netIncome, revenue) * 100,
      roe: safeDiv(netIncome, totalEquity) * 100,
      roa: safeDiv(netIncome, totalAssets) * 100,
      debtToEquity: safeDiv(totalLiabilities, totalEquity) * 100,
      currentRatio: totalCurrentLiabilities > 0
        ? totalCurrentAssets / totalCurrentLiabilities
        : undefined,
    });
  }

  return {
    symbol: symbol.toUpperCase(),
    currency: income[0]?.reportedCurrency ?? 'USD',
    years,
  };
}

// ========== 搜尋（SYMBOL_SEARCH） ==========
// function=SYMBOL_SEARCH — bestMatches: [{1. symbol, 2. name, 3. type, 4. region, 5. marketOpen, 6. marketClose, 7. timezone, 8. currency, 9. matchScore}]

interface AlphaSearchMatch {
  '1. symbol': string;
  '2. name': string;
  '3. type': string;
  '4. region': string;
  '8. currency'?: string;
}

interface AlphaSearchResult {
  bestMatches: AlphaSearchMatch[];
}

export async function fetchSearch(query: string): Promise<SearchResult[]> {
  const json = await avFetch({ function: 'SYMBOL_SEARCH', keywords: query });
  if (!json || isRateLimited(json)) return [];
  const matches = (json as unknown as AlphaSearchResult).bestMatches ?? [];
  return matches.slice(0, 10).map((m) => ({
    symbol: m['1. symbol'],
    name: m['2. name'],
    exchange: m['4. region'] ?? '',
    type: m['3. type'],
    currency: m['8. currency'],
  }));
}

// ========== 日線時序（TIME_SERIES_DAILY） ==========
// function=TIME_SERIES_DAILY — "Time Series (Daily)": { "YYYY-MM-DD": { "1. open", "2. high", "3. low", "4. close", "5. volume" } }

interface AlphaTimeSeries {
  'Meta Data'?: Record<string, string>;
  'Time Series (Daily)'?: Record<string, Record<string, string>>;
}

export async function fetchDailySeries(
  symbol: string,
  outputSize: 'compact' | 'full' = 'compact',
): Promise<AlphaTimeSeries | null> {
  const json = await avFetch({
    function: 'TIME_SERIES_DAILY',
    symbol,
    outputsize: outputSize,
  });
  if (!json || isRateLimited(json)) return null;
  return json as AlphaTimeSeries;
}