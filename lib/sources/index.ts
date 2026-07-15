/**
 * 聰明路由入口 — 統一對外介面
 *
 * 對外 export 的函式簽名與原 lib/yahoo.ts 完全相同，
 * 所以 7 個 API route 只要改 import 路徑就能無痛切換。
 *
 * 路由策略：
 *   - 報價/K線：Yahoo v8/chart (主, 已驗證可用) → Finnhub (備援) → Twelve Data (備援) → mock
 *   - 估值/基本：Alpha Vantage OVERVIEW (主) → Finnhub (備援) → undefined
 *   - 詳細財報：Alpha Vantage (主) → mock 空財報
 *   - 新聞：Finnhub (主) → mock 空陣列
 *   - 搜尋：Finnhub (主) → Twelve Data (備援) → mock 已知 symbol
 */

import type {
  SearchResult,
  StockOverview,
  PricePoint,
  FinancialsData,
  FinancialYear,
  NewsItem,
  ChartRange,
  Competitor,
} from '../types';
import { cached } from '../cache';

import * as yahoo from './yahoo';
import * as finnhub from './finnhub';
import * as alphaVantage from './alpha-vantage';
import * as twelveData from './twelve-data';
import * as twse from './twse';
import * as mock from './mock';
import * as yahooQs from './yahoo-quote-summary';
import * as secEdgar from './sec-edgar';
import * as secCik from './sec-cik';
import * as fred from './fred';
import * as mopsXbrl from './mops-xbrl';
import { runValuation } from '../valuation';

// ========== 退避重試工具 ==========

interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  retries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
};

/** 判斷是否為可重試的錯誤（429/5xx/網路錯誤） */
function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('429') || msg.includes('too many')) return true;
    if (msg.includes('500') || msg.includes('502') || msg.includes('503')) return true;
    if (msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('enotfound')) return true;
  }
  return false;
}

/** 指數退避：1s → 2s → 4s → 8s (cap) */
async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(
  name: string,
  fn: () => Promise<T | null>,
  opts: RetryOptions = {},
): Promise<T | null> {
  const config = { ...DEFAULT_RETRY, ...opts };
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      const result = await fn();
      if (result !== null && result !== undefined) {
        return result;
      }
      // 回傳 null：可能是「該源沒資料」，不算可重試錯誤，直接放棄
      return null;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === config.retries) {
        console.error(`[${name}] failed (no retry):`, err instanceof Error ? err.message : err);
        return null;
      }
      const delay = Math.min(config.baseDelayMs * 2 ** attempt, config.maxDelayMs);
      console.warn(`[${name}] attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  console.error(`[${name}] exhausted retries:`, lastErr);
  return null;
}

// ========== 對外函式 ==========

/** 預設 TTL：1 小時（從原本的 5 分鐘延長） */
const DEFAULT_TTL = 60 * 60 * 1000;

// ========== 1. 搜尋 ==========
export async function searchSymbol(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  return cached(`search:${q.toLowerCase()}`, DEFAULT_TTL, async () => {
    // 1. Finnhub 主源
    if (finnhub.isAvailable()) {
      const result = await withRetry('finnhub.search', () => finnhub.fetchSearch(q));
      if (result && result.length > 0) return result;
    }
    console.log('[fallback] finnhub search failed, trying twelve-data');

    // 2. Twelve Data 備援
    if (twelveData.isAvailable()) {
      const result = await withRetry('twelvedata.search', () => twelveData.fetchSearch(q));
      if (result && result.length > 0) return result;
    }
    console.log('[fallback] twelve-data search failed, trying mock');

    // 3. mock
    return mock.getMockSearch(q);
  });
}

// ========== 2. 即時報價 + K 線（合併策略） ==========
// 因為 StockOverview 需要 price/volume，K 線需要歷史，兩個來源高度重疊
// 我們在 getStockOverview 內呼叫 fetchYahooChart 一次就拿齊

/** 從各家取「即時報價 + meta」，回傳合併結果（null 表示全部失敗） */
async function fetchBestQuoteAndMeta(symbol: string): Promise<{
  meta: Partial<StockOverview>;
  chartPoints?: PricePoint[];
  range?: ChartRange;
}> {
  const isTaiwan = symbol.toUpperCase().endsWith('.TW') || symbol.toUpperCase().endsWith('.TWO');

  // 0. TWSE/MIS（限台股，優先於 Yahoo — TWSE 是台股原生權威源、且無需 key）
  if (isTaiwan) {
    // 不論使用者給 .TW 還是 .TWO，一次同時送 tse+otc 給 MIS，
    // 再從結果的 ex 欄位決定正確的後綴。
    const rawSymbol = symbol.replace(/\.(TW|TWO)$/i, '');

    const twseQuotes = await withRetry('twse.mis', () => twse.fetchMisQuotes([rawSymbol]));
    const quote = twseQuotes?.[0];

    if (quote) {
      // 用 MIS 回的 ex 決定正確後綴，並回傳給呼叫端決定 usedSymbol
      const correctSuffix = quote.exchange === 'otc' ? '.TWO' : '.TW';
      const fullSymbol = `${rawSymbol}${correctSuffix}`;

      const ov = twse.misQuoteToOverview(quote, rawSymbol);
      ov.symbol = fullSymbol;
      ov.exchange = quote.exchange === 'otc' ? 'Taipei Exchange' : 'Taiwan';

      // K 線選擇
      const kline = quote.exchange === 'otc'
        ? await withRetry('twse.tpexKLine', () => twse.fetchTpexKLine(rawSymbol, '1Y'))
        : await withRetry('twse.kLine', () => twse.fetchTwseKLine(rawSymbol, '1Y'));

      // 用 return 時在 symbol 欄位塞 fullSymbol（呼叫端會用 quoteMeta.symbol 當 usedSymbol）
      return { meta: { ...ov, symbol: fullSymbol }, chartPoints: kline ?? [], range: '1Y' };
    }
    console.log('[fallback] twse mis failed, trying yahoo');
  }

  // 1. Yahoo v8/chart（已驗證可用）
  const yahooChart = await withRetry('yahoo.chart', () => yahoo.fetchYahooChart(symbol, '1Y'));
  if (yahooChart) {
    const m = yahooChart.meta;
    return {
      meta: {
        symbol: m.symbol,
        name: m.longName || m.shortName || symbol,
        exchange: m.fullExchangeName || m.exchangeName,
        currency: m.currency,
        price: m.regularMarketPrice,
        change: m.regularMarketChange,
        changePercent: m.regularMarketChangePercent,
        previousClose: m.regularMarketPreviousClose,
        open: m.regularMarketOpen,
        dayHigh: m.regularMarketDayHigh,
        dayLow: m.regularMarketDayLow,
        volume: m.regularMarketVolume,
        marketCap: m.marketCap,
        trailingPE: m.trailingPE,
        fiftyTwoWeekHigh: m.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: m.fiftyTwoWeekLow,
      },
      chartPoints: yahooChart.points,
      range: '1Y',
    };
  }
  console.log('[fallback] yahoo chart failed, trying finnhub');

  // 2. Finnhub quote + profile（合併）
  if (finnhub.isAvailable()) {
    const result = await withRetry('finnhub.overview', () => finnhub.buildStockOverview(symbol));
    if (result) return { meta: result };
  }
  console.log('[fallback] finnhub failed, trying twelve-data');

  // 3. Twelve Data quote
  if (twelveData.isAvailable()) {
    const q = await withRetry('twelvedata.quote', () => twelveData.fetchQuote(symbol));
    if (q) {
      return {
        meta: {
          symbol: symbol.toUpperCase(),
          name: q.name || symbol,
          exchange: q.exchange || '',
          currency: q.currency || 'USD',
          price: Number(q.close ?? 0),
          change: Number(q.change ?? 0),
          changePercent: Number(q.percent_change ?? 0),
          previousClose: Number(q.previous_close ?? 0),
          open: Number(q.open ?? 0),
          dayHigh: Number(q.high ?? 0),
          dayLow: Number(q.low ?? 0),
          volume: Number(q.volume ?? 0),
        },
      };
    }
  }
  console.log('[fallback] twelve-data failed, trying mock');

  // 4. mock（給基本輪廓，price=0 表示無報價）
  const m = mock.getMockOverview(symbol);
  if (m) return { meta: m };

  return { meta: {} };
}

// ========== 2.5 估值 / 基本面（從 Alpha Vantage 補 Yahoo 缺的部分） ==========

async function fetchValuationAndProfile(symbol: string): Promise<Partial<StockOverview>> {
  const out: Partial<StockOverview> = {};
  const num = (v: unknown): number | undefined => {
    if (v == null) return undefined;
    const n = Number(v);
    return isFinite(n) ? n : undefined;
  };
  const isTaiwan = symbol.toUpperCase().endsWith('.TW') || symbol.toUpperCase().endsWith('.TWO');

  // 0. TWSE BWIBBU 估值（限台股上市 .TW — 上櫃 TPEx 無公開 JSON 估值）
  if (isTaiwan && symbol.toUpperCase().endsWith('.TW')) {
    const rawSymbol = symbol.replace(/\.TW$/i, '');
    const val = await withRetry('twse.bwibbu', () => twse.fetchTwseValuation(rawSymbol));
    if (val) {
      if (val.pe > 0) out.trailingPE = val.pe;
      // val.pb / val.dividendYield 暫存到 out（types 已有 trailingPE/dividendYield 欄位）
      if (val.dividendYield > 0) out.dividendYield = val.dividendYield;
    }
  }

  // 1. Alpha Vantage OVERVIEW：免費版對小眾 symbol 經常無資料，且嚴格節流
  //    → 與 Finnhub 並行抓，任一成功即可
  //    （台股走 TWSE 已拿到 PE，這段主要是補美股/全球股的 sector/industry/description）
  //    台股直接跳過這段（Finnhub 對台股 profile 需付費、Alpha Vantage 免費版常無資料）
  const tasks: Array<Promise<void>> = [];
  const skipUsSources = isTaiwan;

  if (!skipUsSources && alphaVantage.isAvailable()) {
    tasks.push(
      withRetry('alphavantage.overview', () => alphaVantage.fetchOverview(symbol)).then(
        (result) => {
          if (!result) return;
          const av = alphaVantage.overviewToStockOverview(result, symbol);
          Object.assign(out, av);
        },
      ),
    );
  }

  // 2. Finnhub profile：補 sector/industry/country/description/website/CEO 等字串欄位
    if (!skipUsSources && finnhub.isAvailable()) {
    tasks.push(
      withRetry('finnhub.profile', () => finnhub.fetchProfile(symbol)).then((profile) => {
        if (!profile) return;
        if (!out.exchange && profile.exchange) out.exchange = profile.exchange;
        if (!out.currency && profile.currency) out.currency = profile.currency;
        if (!out.sector) out.sector = profile.finnhubIndustry ?? '';
        if (!out.industry) out.industry = profile.industry ?? profile.finnhubIndustry ?? '';
        if (!out.description && profile.description) out.description = profile.description;
        if (!out.website && profile.weburl) out.website = profile.weburl;
        if (!out.country && profile.country) out.country = profile.country;
        if (!out.headquarters && profile.country) out.headquarters = profile.country;
        if (!out.founded && profile.ipo) out.founded = profile.ipo;
        if (out.marketCap === undefined && profile.marketCapitalization) {
          out.marketCap = profile.marketCapitalization * 1e6; // Finnhub 單位百萬
        }
      }),
    );

    // 2b. Finnhub metric：補 PE / EPS / Beta / 52w / 殖利率
    tasks.push(
      withRetry('finnhub.metric', () => finnhub.fetchMetric(symbol)).then((metric) => {
        if (!metric) return;
        if (out.trailingPE === undefined) out.trailingPE = num(metric.peBasicExtraTTM);
        if (out.eps === undefined) out.eps = num(metric.epsBasicExtraTTM);
        if (out.beta === undefined) out.beta = num(metric.beta);
        if (out.fiftyTwoWeekHigh === undefined) out.fiftyTwoWeekHigh = num(metric['52WeekHigh']);
        if (out.fiftyTwoWeekLow === undefined) out.fiftyTwoWeekLow = num(metric['52WeekLow']);
        if (out.dividendYield === undefined) out.dividendYield = num(metric.dividendYieldIndicatedAnnual);
      }),
    );
  }

  await Promise.allSettled(tasks);

  // 3. 當 Alpha Vantage 與 Finnhub 都沒提供字串型元資料時，
  //    用本地 mock seed 補（涵蓋台股與部分美股常見股）
  if (!out.sector || !out.industry || !out.description) {
    const seed = mock.getMockOverview(symbol);
    if (seed) {
      if (!out.sector && seed.sector) out.sector = seed.sector;
      if (!out.industry && seed.industry) out.industry = seed.industry;
      if (!out.description && seed.description) out.description = seed.description;
      if (!out.website && seed.website) out.website = seed.website;
      if (!out.country && seed.country) out.country = seed.country;
      if (!out.headquarters && seed.headquarters) out.headquarters = seed.headquarters;
      if (!out.founded && seed.founded) out.founded = seed.founded;
    }
  }

  return out;
}

// ========== 3. getStockOverview ==========

/**
 * 自動補上可能的交易所後綴（如 .TW / .TWO）
 *
 * Yahoo v8/chart 對台股 ETF 必須用 `00918.TW`，但使用者常只輸入 `00918`。
 * 這個函式會產生候選 symbol 清單，讓 routing 逐一嘗試。
 */
function buildSymbolCandidates(raw: string): string[] {
  const sym = raw.toUpperCase().trim();
  if (!sym) return [];
  const out = [sym];
  // 已經有後綴（.TW / .TWO / .KS / .HK 等）就不補
  if (/\.[A-Z]{2,3}$/.test(sym)) return out;
  // 4-6 位純數字 → 視為台股候選（普通股 .TW、ETF .TW、上櫃 .TWO）
  if (/^\d{4,6}$/.test(sym)) {
    out.push(`${sym}.TW`, `${sym}.TWO`);
  }
  return out;
}

export async function getStockOverview(symbol: string): Promise<StockOverview> {
  const sym = symbol.toUpperCase();
  const candidates = buildSymbolCandidates(sym);

  return cached(`overview:${sym}`, DEFAULT_TTL, async () => {
    // Step 1: 報價 + meta（必有，否則丟 STOCK_NOT_FOUND）
    // 依序嘗試每個 candidate，直到拿到報價
    let quoteMeta: Partial<StockOverview> | null = null;
    let usedSymbol = sym;
    for (const c of candidates) {
      const { meta } = await fetchBestQuoteAndMeta(c);
      if (meta.name && meta.price && meta.price > 0) {
        quoteMeta = meta;
        // 對台股，meta.symbol 已被 TWSE 改為正確後綴（.TW 或 .TWO）
        usedSymbol = meta.symbol?.toUpperCase() ?? c;
        break;
      }
      if (meta.name && !quoteMeta) {
        // 記住 mock fallback 的結果以備不時之需
        quoteMeta = meta;
      }
    }
    if (!quoteMeta || !quoteMeta.name) {
      throw new Error('STOCK_NOT_FOUND');
    }
    if (!quoteMeta.price || quoteMeta.price === 0) {
      console.warn(`[overview] ${sym}: no real-time price (using mock/skeleton)`);
    }

    // Step 2: 估值 / 基本面（用實際成功的 symbol 去查）
    const valuation = await fetchValuationAndProfile(usedSymbol);

    // Step 2.5: 分析師目標價 + SEC EDGAR（美股）/ MOPS XBRL（台股）精確財報
    //           + Yahoo v10 quoteSummary（補 EPS / PE / PB，Finnhub 拿不到時 fallback）
    const usedIsTaiwan = usedSymbol.endsWith('.TW') || usedSymbol.endsWith('.TWO');
    // 對 ETF 跳過 Yahoo v10 quoteSummary + analyst targets（台股 ETF 沒 EPS / PE / 分析師目標價，跑了也白跑）
    const skipQsForEtf = usedSymbol.startsWith('00') && usedIsTaiwan;
    const [analystData, secData, yahooQsData] = await Promise.all([
      skipQsForEtf ? Promise.resolve(null) : fetchAnalystTargets(usedSymbol),
      usedIsTaiwan ? Promise.resolve(null) : fetchSecDataForUs(usedSymbol),
      // Yahoo v10 quoteSummary 是 EPS / PE / PB 的最穩定來源（Finnhub metric 偶爾缺）
      skipQsForEtf ? Promise.resolve(null) : fetchYahooQuoteSummary(usedSymbol),
    ]);

    // Step 2.6: 台股個股抓 MOPS XBRL 精確財報（ETF 自動跳過）
    let mopsData: mopsXbrl.MopsFundamentals | null = null;
    // 對 ETF（如 00897、0050）跳過 MOPS — ETF 沒有公司財報，MOPS endpoint 必回「檔案不存在」
    // 但 MOPS endpoint 每次約 1.5-2s，順序試 5 個 trial 就要 10s。直接跳過省 10s+
    if (skipQsForEtf) {
      console.log(`[overview] ${usedSymbol}: ETF, skip MOPS fetch`);
    } else if (usedIsTaiwan) {
      mopsData = await fetchMopsDataForTw(usedSymbol);
    }

    // Step 3: 跑 5 模型估值（需要 EPS / FCF / 同業 PE 等資料，部分從 valuation 取）
    const rf = await fred.fetchRiskFreeRate();
    const fairValueResult = runFairValueComputation(merged_shell(quoteMeta, valuation), secData, rf, mopsData, usedSymbol);

    // Step 4: 合併，quoteMeta 為基礎，valuation 補缺
    const merged: StockOverview = {
      // 基礎欄位（從 quoteMeta）
      symbol: quoteMeta.symbol ?? usedSymbol,
      name: quoteMeta.name ?? sym,
      exchange: quoteMeta.exchange ?? '',
      currency: quoteMeta.currency ?? 'USD',
      price: quoteMeta.price ?? 0,
      change: quoteMeta.change ?? 0,
      changePercent: quoteMeta.changePercent ?? 0,
      previousClose: quoteMeta.previousClose ?? 0,
      open: quoteMeta.open ?? 0,
      dayHigh: quoteMeta.dayHigh ?? 0,
      dayLow: quoteMeta.dayLow ?? 0,
      volume: quoteMeta.volume ?? 0,
      // 估值欄位（valuation 補，quoteMeta 已有則保留；Yahoo v10 quoteSummary 作為最終 fallback）
      marketCap: valuation.marketCap ?? quoteMeta.marketCap,
      trailingPE: valuation.trailingPE ?? quoteMeta.trailingPE ?? yahooQsData?.trailingPE,
      forwardPE: valuation.forwardPE ?? quoteMeta.forwardPE ?? yahooQsData?.forwardPE,
      // priceToBook 暫存到 forwardPE 旁（types.ts 還沒獨立欄位，先不算）
      eps: valuation.eps ?? quoteMeta.eps ?? yahooQsData?.epsTrailingTwelveMonths ?? yahooQsData?.epsForward,
      beta: valuation.beta ?? quoteMeta.beta,
      dividendYield: valuation.dividendYield ?? quoteMeta.dividendYield,
      fiftyTwoWeekHigh: valuation.fiftyTwoWeekHigh ?? quoteMeta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: valuation.fiftyTwoWeekLow ?? quoteMeta.fiftyTwoWeekLow,
      // 公司基本（valuation 才有，mock 也有 sector/industry；yahooQs 補漏）
      sector: valuation.sector ?? quoteMeta.sector ?? yahooQsData?.sector ?? '',
      industry: valuation.industry ?? quoteMeta.industry ?? yahooQsData?.industry ?? '',
      description: valuation.description ?? quoteMeta.description ?? '',
      website: valuation.website ?? quoteMeta.website ?? '',
      country: valuation.country ?? quoteMeta.country ?? '',
      employees: valuation.employees ?? quoteMeta.employees,
      founded: valuation.founded ?? quoteMeta.founded ?? '',
      headquarters: valuation.headquarters ?? quoteMeta.headquarters ?? '',
      ceo: valuation.ceo ?? quoteMeta.ceo ?? '',
      // 分析師目標價（從 Yahoo v10 quoteSummary）
      analystTargetMean: analystData?.targetMeanPrice,
      analystTargetHigh: analystData?.targetHighPrice,
      analystTargetLow: analystData?.targetLowPrice,
      analystCount: analystData?.numberOfAnalystOpinions,
      analystRating: analystData?.recommendationKey,
      priceTargetSource: analystData?.targetMeanPrice ? 'yahoo-v10' : undefined,
      // 量化公允價值（5 模型加權）
      fairValue: fairValueResult.fairValue,
      premiumToFairValue: premium(fairValueResult.fairValue, merged_shell(quoteMeta, valuation).price),
      premiumToAnalystTarget: premium(analystData?.targetMeanPrice, merged_shell(quoteMeta, valuation).price),
    };

    // Step 5: 為台股從 MOPS 補上 EPS / marketCap / beta；從 Yahoo 補上 52w 與平均成交量
    // 因為台股跳過 Finnhub/Alpha Vantage，這些欄位原本會 N/A。
    // MOPS 的 IssuedCapital ÷ 10 = sharesOutstanding，可算出 marketCap = shares × price
    const needs52w = merged.fiftyTwoWeekHigh === undefined || merged.fiftyTwoWeekLow === undefined || merged.avgVolume === undefined;
    const needsPatch = merged.eps === undefined
      || merged.marketCap === undefined
      || merged.beta === undefined
      || needs52w;
    if (needsPatch) {
      // EPS / marketCap / beta：MOPS 與 mock
      if (merged.eps === undefined && mopsData?.eps !== undefined) {
        merged.eps = mopsData.eps;
      }
      if (merged.marketCap === undefined && mopsData?.sharesOutstanding && merged.price) {
        merged.marketCap = mopsData.sharesOutstanding * merged.price;
      }
      if (merged.beta === undefined) {
        const seed = mock.getMockOverview(usedSymbol);
        if (seed?.beta !== undefined) merged.beta = seed.beta;
      }
      // 52w / 平均成交量：Yahoo v8/chart 對台股仍可用
      if (needs52w) {
        const yahooChart = await withRetry('yahoo.chart.52w', () => yahoo.fetchYahooChart(usedSymbol, '5Y'));
        if (yahooChart?.meta) {
          if (merged.fiftyTwoWeekHigh === undefined && yahooChart.meta.fiftyTwoWeekHigh) {
            merged.fiftyTwoWeekHigh = yahooChart.meta.fiftyTwoWeekHigh;
          }
          if (merged.fiftyTwoWeekLow === undefined && yahooChart.meta.fiftyTwoWeekLow) {
            merged.fiftyTwoWeekLow = yahooChart.meta.fiftyTwoWeekLow;
          }
          if (merged.avgVolume === undefined && yahooChart.points.length > 0) {
            const last30 = yahooChart.points.slice(-30);
            const avg = last30.reduce((s, p) => s + p.volume, 0) / last30.length;
            if (avg > 0) merged.avgVolume = Math.round(avg);
          }
        }
      }
    }

    return merged;
  });
}

/** 計算溢/折價 %（正值 = 溢價，負值 = 折價） */
function premium(reference: number | undefined, price: number | undefined): number | undefined {
  if (reference === undefined || price === undefined || reference <= 0) return undefined;
  return ((price - reference) / reference) * 100;
}

/** 暫存 quoteMeta + valuation 給其他 helper 用（避免重複欄位列舉） */
function merged_shell(q: Partial<StockOverview>, v: Partial<StockOverview>): Partial<StockOverview> {
  return { ...q, ...v };
}

// ========== 4. 歷史 K 線 ==========

export async function getHistoricalPrices(
  symbol: string,
  range: ChartRange = '1Y',
): Promise<PricePoint[]> {
  const sym = symbol.toUpperCase();
  const isTaiwan = sym.endsWith('.TW') || sym.endsWith('.TWO');
  const isOtc = sym.endsWith('.TWO');
  return cached(`chart:${sym}:${range}`, DEFAULT_TTL, async () => {
    // 0. TWSE/TPEx K 線（台股優先 — 無需 key、無額度限制）
    if (isTaiwan) {
      const rawSymbol = sym.replace(/\.(TW|TWO)$/, '');
      // 1Y 範圍可從 getStockOverview 的快取直接拿（已抓過）
      if (range === '1Y') {
        const cached1Y = await getCachedChartPoints(sym, '1Y');
        if (cached1Y && cached1Y.length > 0) return cached1Y;
      }
      const points = isOtc
        ? await withRetry('twse.tpexKLine', () => twse.fetchTpexKLine(rawSymbol, range))
        : await withRetry('twse.kLine', () => twse.fetchTwseKLine(rawSymbol, range));
      if (points && points.length > 0) return points;
      console.log('[fallback] twse kline failed, trying yahoo');
    }

    // 1. Yahoo v8/chart（主）
    const result = await withRetry('yahoo.chart', () => yahoo.fetchYahooChart(sym, range));
    if (result && result.points.length > 0) return result.points;

    console.log('[fallback] yahoo chart failed, trying twelve-data');

    // 2. Twelve Data 備援
    if (twelveData.isAvailable()) {
      const tdResult = await withRetry('twelvedata.timeseries', () => twelveData.fetchTimeSeries(sym, range));
      if (tdResult && tdResult.length > 0) return tdResult;
    }

    console.log('[fallback] twelve-data failed, trying alphavantage');

    // 3. Alpha Vantage 備援（會耗免費額度）
    if (alphaVantage.isAvailable()) {
      const av = await withRetry('alphavantage.daily', () => alphaVantage.fetchDailySeries(sym));
      if (av && av['Time Series (Daily)']) {
        const points = parseAlphaDailyToPoints(av['Time Series (Daily)'], range);
        if (points.length > 0) return points;
      }
    }

    return mock.getEmptyChart();
  });
}

/** 從已抓過的 overview 快取內取出對應 K 線（避免重抓 Yahoo） */
async function getCachedChartPoints(symbol: string, range: ChartRange): Promise<PricePoint[] | null> {
  // 簡化實作：直接呼叫一次（這層的 cached() 會保護）
  // 注意：原本這裡固定走 Yahoo v8/chart，但台股現在優先走 TWSE —
  // 因此直接呼叫 twse.ts 對台股與否分派。
  const sym = symbol.toUpperCase();
  const isTaiwan = sym.endsWith('.TW') || sym.endsWith('.TWO');
  const isOtc = sym.endsWith('.TWO');
  if (isTaiwan) {
    const rawSymbol = sym.replace(/\.(TW|TWO)$/, '');
    const points = isOtc
      ? await twse.fetchTpexKLine(rawSymbol, range)
      : await twse.fetchTwseKLine(rawSymbol, range);
    return points.length > 0 ? points : null;
  }
  const result = await yahoo.fetchYahooChart(symbol, range);
  return result?.points ?? null;
}

/** 把 Alpha Vantage 日線 JSON 轉 PricePoint[] */
function parseAlphaDailyToPoints(
  series: Record<string, Record<string, string>>,
  range: ChartRange,
): PricePoint[] {
  const dates = Object.keys(series).sort(); // 舊到新
  const limit: Record<ChartRange, number> = { '1M': 30, '3M': 90, '1Y': 365, '5Y': 260 };
  const sliced = dates.slice(-limit[range]);
  return sliced.map((d) => {
    const v = series[d];
    return {
      date: d,
      open: Number(v['1. open'] ?? 0),
      high: Number(v['2. high'] ?? 0),
      low: Number(v['3. low'] ?? 0),
      close: Number(v['4. close'] ?? 0),
      volume: Number(v['5. volume'] ?? 0),
    };
  });
}

// ========== 5. 詳細財務報表 ==========

export async function getFinancials(symbol: string): Promise<FinancialsData> {
  const sym = symbol.toUpperCase();
  return cached(`financials:v5:${sym}`, DEFAULT_TTL, async () => {
    // 0. 台股個股 → MOPS XBRL 抓近 5 年年度累計（Alpha Vantage 對台股覆蓋極差）
    if (sym.endsWith('.TW') || sym.endsWith('.TWO')) {
      const rawSymbol = sym.replace(/\.(TW|TWO)$/, '');
      // ETF 不適用（會回「檔案不存在」）
      const mopsMulti = await withRetry('mops.multiyear', () =>
        mopsXbrl.fetchMopsMultiYearFinancials(rawSymbol, 5),
      );
      if (mopsMulti && mopsMulti.length > 0) {
        const years = mopsXbrl.mopsToFinancialYears(mopsMulti);
        if (years.length > 0) {
          return {
            symbol: sym,
            currency: 'TWD',
            years,
          };
        }
      }
      console.log('[fallback] mops multi-year failed, trying alphavantage');
    }

    // 1. Alpha Vantage（主源，適用美股與部分全球股）
    if (alphaVantage.isAvailable()) {
      const result = await withRetry('alphavantage.financials', () => alphaVantage.fetchFinancials(sym));
      if (result && result.years.length > 0) {
        // AV 對部分發行人（HPQ/NOK/TM 等）EPS / 資產負債欄位為 0 — 對美股自動去 SEC EDGAR 補
        // 觸發條件：所有年的 EPS 全 0、或 TA 全 0（關鍵欄位至少一個為 0）
        const needsSecFill = !sym.endsWith('.TW') && !sym.endsWith('.TWO') && result.years.some(
          (y) => (y.eps === 0 && y.netIncome > 0) || y.totalAssets === 0,
        );
        if (!needsSecFill) return result;
        // 補抓 SEC 5 年
        try {
          const cik = await secCik.lookupCikByTicker(sym);
          if (cik) {
            const history = await secEdgar.fetchSecFinancialHistory(cik, 5);
            if (history && history.years.length > 0) {
              const secYears = secHistoryToFinancialYears(history);
              // 將 SEC 的 EPS / TA / TE / TL / CFO / CapEx 補到 AV 年份對應年份
              for (const y of result.years) {
                const secY = secYears.find((s) => s.year === y.year);
                if (secY) {
                  if (y.eps === 0 && secY.eps) y.eps = secY.eps;
                  if (y.totalAssets === 0 && secY.totalAssets) y.totalAssets = secY.totalAssets;
                  if (y.totalEquity === 0 && secY.totalEquity) y.totalEquity = secY.totalEquity;
                  if (y.totalLiabilities === 0 && secY.totalLiabilities) y.totalLiabilities = secY.totalLiabilities;
                  if (y.operatingCashFlow === 0 && secY.operatingCashFlow) y.operatingCashFlow = secY.operatingCashFlow;
                  if (y.freeCashFlow === 0 && secY.freeCashFlow) y.freeCashFlow = secY.freeCashFlow;
                  // 重算 ROE / ROA / debtToEquity（之前因 TA/TE=0 算出 0）
              // ROE 在股東權益為負（庫藏股過多，如 HPQ）時數學上無意義 → 標 null
              // ROA / debtToEquity 在 TA=0 時無意義 → 標 null
              if (y.totalEquity > 0) y.roe = (y.netIncome / y.totalEquity) * 100;
              else if (y.totalEquity < 0) y.roe = null;  // 負股東權益（庫藏股過度回購）
              else y.roe = 0;  // 缺資料保留 0
              if (y.totalAssets > 0) y.roa = (y.netIncome / y.totalAssets) * 100;
              else y.roa = null;
              if (y.totalEquity > 0) y.debtToEquity = (y.totalLiabilities / y.totalEquity) * 100;
              else y.debtToEquity = null;
                }
              }
              console.log(`[sec-fill] ${sym}: AV 補 SEC ${result.years.filter(y => y.eps > 0 || y.totalAssets > 0).length}/${result.years.length} 年`);
            }
          }
        } catch (e) {
          console.warn('[sec-fill] failed:', e instanceof Error ? e.message : e);
        }
        return result;
      }
    }
    console.log('[fallback] alphavantage financials failed');

    // 2. SEC EDGAR（無 rate limit，US 個股官方資料；當 AV 額度耗光時 fallback）
    //    限美股（無 .TW / .TWO / .HK 等後綴）
    if (!sym.endsWith('.TW') && !sym.endsWith('.TWO')) {
      try {
        const cik = await secCik.lookupCikByTicker(sym);
        if (cik) {
          const history = await secEdgar.fetchSecFinancialHistory(cik, 5);
          console.log(`[sec-fill] ${sym}: SEC history.years=${history?.years.map(y => y.year).join(',')}`);
          if (history && history.years.length > 0) {
            const converted = secHistoryToFinancialYears(history);
            if (converted.length > 0) {
              return { symbol: sym, currency: 'USD', years: converted };
            }
          }
        }
      } catch (e) {
        console.warn('[fallback] sec.edgar financials failed:', e instanceof Error ? e.message : e);
      }
    }

    // 3. 全部失敗：回傳空財報（前端 UI 會顯示「無資料」）
    return mock.getEmptyFinancials(sym);
  });
}

// ========== 6. 新聞 ==========

export async function getNews(symbol: string): Promise<NewsItem[]> {
  const sym = symbol.toUpperCase();
  // 新聞 TTL 用較短的 15 分鐘（內容時效性高）
  return cached(`news:${sym}`, 15 * 60 * 1000, async () => {
    // 1. Finnhub（主源）
    if (finnhub.isAvailable()) {
      const result = await withRetry('finnhub.news', () => finnhub.fetchCompanyNews(sym));
      if (result && result.length > 0) return fillNewsImpact(result);
    }
    console.log('[fallback] finnhub news failed, trying same-sector fallback');

    // 2. 同產業新聞 fallback：當主 symbol 沒新聞時，從 competitors.ts 抓同類股 symbol，
    //    再用 Finnhub 抓它們的新聞。標題加上「（產業延伸）」前綴、category 改為 industry。
    const peerSymbols = getPeerSymbolsForNews(sym);
    if (peerSymbols.length > 0 && finnhub.isAvailable()) {
      const peerNews: NewsItem[] = [];
      for (const peer of peerSymbols) {
        try {
          const result = await withRetry(`finnhub.news.${peer}`, () =>
            finnhub.fetchCompanyNews(peer),
          );
          if (result && result.length > 0) {
            for (const n of result) {
              peerNews.push({
                ...n,
                title: `【產業延伸・${peer}】${n.title}`,
                category: 'industry',
              });
            }
          }
        } catch {
          // 略過失敗的 peer
        }
        // 拿到 10 則就停
        if (peerNews.length >= 10) break;
      }
      if (peerNews.length > 0) return fillNewsImpact(peerNews.slice(0, 10));
    }

    // 3. 全部失敗：空陣列（前端 UI 會顯示「暫無新聞」）
    return [];
  });
}

/**
 * 從 competitors.ts 抓該 symbol 的同產業 peers（限 4 支，避免過多 API call）
 *
 * 注意：Finnhub 對台股幾乎沒新聞，所以台股 ETF/新上市股會落到這層。
 * 對台股這層也是空 — 最終仍會回空陣列，但流程更友善。
 */
function getPeerSymbolsForNews(symbol: string): string[] {
  try {
    // 動態 import 避免循環依賴
    const { getCompetitorsForSymbol } = require('../competitors') as typeof import('../competitors');
    const competitors = getCompetitorsForSymbol(symbol);
    return competitors.slice(0, 4).map((c) => c.symbol);
  } catch {
    return [];
  }
}

function fillNewsImpact(news: NewsItem[]): NewsItem[] {
  return news.map((n) => ({
    ...n,
    impact: n.impact || deriveImpact(n.category, n.sentiment),
  }));
}

function deriveImpact(category: NewsItem['category'], sentiment: string): string {
  if (sentiment === 'positive') {
    return {
      operations: '對營運表現有正面訊號，可能提升市場信心',
      financials: '財報數據優於預期，可能帶動股價與估值上修',
      industry: '產業利多訊息，有利於公司在市場的相對位置',
      legal: '法律風險緩解或有利判決，降低公司不確定性',
      market: '市場對公司看法轉為正面，可能吸引資金流入',
    }[category] ?? '整體屬於中性訊息，建議結合更多資訊綜合判斷';
  }
  if (sentiment === 'negative') {
    return {
      operations: '營運面臨挑戰，可能影響短期業績與市場信心',
      financials: '財報數據不如預期或財務壓力上升，需關注後續展望',
      industry: '產業逆風或競爭加劇，可能壓縮成長空間',
      legal: '法律或監管風險升高，是潛在的隱憂',
      market: '市場觀望或負面情緒升溫，短期股價可能承壓',
    }[category] ?? '整體屬於中性訊息，建議結合更多資訊綜合判斷';
  }
  return '整體屬於中性訊息，建議結合更多資訊綜合判斷';
}

// ========== 7. 競爭對手指標（給 competitors route 用） ==========
//
// 抓取單一 symbol 的「市場估值 + 簡單基本面」，用來填入 Competitor 卡片。
// 來源優先序：Yahoo v8/chart（報價 + 52w + PE）→ Finnhub metric（PE/EPS/ROE）
// → Finnhub profile（市值）→ Twelve Data（兜底）
// 因為 /v8/chart 已有 PE/52w/marketCap，可少用 Finnhub 額度。

async function fetchCompetitorMetricsOne(symbol: string): Promise<Partial<Competitor>> {
  const out: Partial<Competitor> = {};
  const sym = symbol.toUpperCase();
  const isTaiwan = sym.endsWith('.TW') || sym.endsWith('.TWO');

  // 台股：走 MIS（無需 key、權威）+ TWSE BWIBBU 拿 PE/PB + MOPS XBRL 拿毛利率/淨利率/EPS/ROE + 市值
  if (isTaiwan) {
    const rawSymbol = sym.replace(/\.(TW|TWO)$/, '');

    // (a) TWSE MIS 即時報價
    const twseQuote = await withRetry('twse.mis', () => twse.fetchSingleQuote(rawSymbol));
    if (twseQuote) {
      if (twseQuote.high > 0) out.fiftyTwoWeekHigh = twseQuote.high;
      if (twseQuote.low > 0) out.fiftyTwoWeekLow = twseQuote.low;
    }

    // (b) TWSE BWIBBU 估值（限 .TW 上市，給 PE / PB / 殖利率）
    if (sym.endsWith('.TW')) {
      const val = await withRetry('twse.bwibbu', () => twse.fetchTwseValuation(rawSymbol));
      if (val && val.pe > 0) out.pe = val.pe;
      if (val && val.pb > 0) out.pb = val.pb;
      if (val && val.dividendYield > 0) out.dividendYield = val.dividendYield;
    }

    // (c) MOPS XBRL 拿財務指標（revenue / grossProfit / netIncome / eps / equity）
    //     → 推算 grossMargin / netMargin / roe / marketCap（用股本 × 收盤價）
    try {
      const mops = await mopsXbrl.fetchMopsFundamentals(rawSymbol);
      if (mops) {
        // annualize: 若 isAnnual=false（單季），×4 變年化（粗估，僅供同業比較用）
        const factor = mops.isAnnual ? 1 : 4;
        const revenue = mops.revenue !== undefined ? mops.revenue * factor : undefined;
        const grossProfit = mops.grossProfit !== undefined ? mops.grossProfit * factor : undefined;
        const netIncome = mops.netIncome !== undefined ? mops.netIncome * factor : undefined;
        const equity = mops.equity;
        if (grossProfit !== undefined && revenue && revenue > 0) {
          out.grossMargin = (grossProfit / revenue) * 100;
        }
        if (netIncome !== undefined && revenue && revenue > 0) {
          out.netMargin = (netIncome / revenue) * 100;
        }
        if (mops.eps !== undefined) {
          // 若單季 EPS，年化要 ×4；MOPS 內已記錄 isAnnual
          out.eps = mops.eps * factor;
        }
        if (netIncome !== undefined && equity && equity > 0) {
          out.roe = (netIncome / equity) * 100;
        }
        // 市值 = 股本（元，已含 ×1000 換算後的元）÷ 10（每股面額） × 股價
        // MOPS issuedCapital 單位是元；每股面額 = 10 元 → 流通股數 = issuedCapital / 10
        if (mops.issuedCapital && mops.issuedCapital > 0 && twseQuote && twseQuote.price > 0) {
          const shares = mops.issuedCapital / 10;
          out.marketCap = shares * twseQuote.price;
        }
      }
    } catch (err) {
      console.warn(`[competitors] mops ${rawSymbol} failed:`, err);
    }

    return out;
  }

  // 1. Yahoo v8/chart：一次拿 price/PE/52w/marketCap（非台股）
  const chart = await withRetry('yahoo.chart', () => yahoo.fetchYahooChart(symbol, '1Y'));
  if (chart) {
    const m = chart.meta;
    if (m.marketCap) out.marketCap = m.marketCap;
    if (m.trailingPE) out.pe = m.trailingPE;
    if (m.fiftyTwoWeekHigh) out.fiftyTwoWeekHigh = m.fiftyTwoWeekHigh;
    if (m.fiftyTwoWeekLow) out.fiftyTwoWeekLow = m.fiftyTwoWeekLow;
  }

  // 2. Finnhub metric：補 PE / EPS / 毛利率 / 淨利率 / ROE / Beta / 52w / 殖利率
  if (finnhub.isAvailable()) {
    const metric = await withRetry('finnhub.metric', () => finnhub.fetchMetric(symbol));
    if (metric) {
      const num = (v: unknown): number | undefined => {
        if (v == null) return undefined;
        const n = Number(v);
        return isFinite(n) ? n : undefined;
      };
      if (!out.pe && metric.peBasicExtraTTM != null) out.pe = num(metric.peBasicExtraTTM);
      out.eps = num(metric.epsBasicExtraTTM);
      // 毛利率 / 淨利率 — Finnhub metric.all 已有 TTM（已是百分比小數，如 0.43 = 43%）
      // competitor table 顯示用百分比（43.00%），所以不 ×100
      if (metric.grossMarginTTM != null) out.grossMargin = num(metric.grossMarginTTM);
      if (metric.netMarginTTM != null) out.netMargin = num(metric.netMarginTTM);
      // Finnhub metric.roeTTM 已經是百分比（例如 146.69），不要再 * 100
      out.roe = num(metric.roeTTM);
      if (out.fiftyTwoWeekHigh === undefined) out.fiftyTwoWeekHigh = num(metric['52WeekHigh']);
      if (out.fiftyTwoWeekLow === undefined) out.fiftyTwoWeekLow = num(metric['52WeekLow']);
    }
  }

  // 3. Finnhub profile：補市值（Finnhub 單位百萬）
  if (out.marketCap === undefined && finnhub.isAvailable()) {
    const profile = await withRetry('finnhub.profile', () => finnhub.fetchProfile(symbol));
    if (profile?.marketCapitalization) out.marketCap = profile.marketCapitalization * 1e6;
  }

  // 4. SEC EDGAR fallback：當 Finnhub 缺毛利率/淨利率（free tier 有缺）時抓 10-K 補
  //    從最新一筆 NI / revenue / GP 計算 grossMargin / netMargin
  if (out.grossMargin === undefined || out.netMargin === undefined) {
    try {
      const cik = await secCik.lookupCikByTicker(symbol);
      if (cik) {
        const history = await secEdgar.fetchSecFinancialHistory(cik, 1);
        if (history && history.years.length > 0) {
          const lastYear = history.years[history.years.length - 1];
          if (out.grossMargin === undefined && lastYear.revenue && lastYear.revenue > 0 && lastYear.grossProfit) {
            out.grossMargin = (lastYear.grossProfit / lastYear.revenue) * 100;
          }
          if (out.netMargin === undefined && lastYear.revenue && lastYear.revenue > 0 && lastYear.netIncome) {
            out.netMargin = (lastYear.netIncome / lastYear.revenue) * 100;
          }
          if (out.eps === undefined && lastYear.netIncome && lastYear.eps) {
            out.eps = lastYear.eps;
          }
        }
      }
    } catch {
      // SEC fallback 失敗靜默
    }
  }

  // 5. PE fallback：Finnhub free tier 不給 peBasicExtraTTM，自己用 price / EPS 算
  //    但 EPS 為負或 0 時 PE 數學上無意義（會算出負 PE 誤導），保持 undefined
  if (out.pe === undefined && chart?.meta?.regularMarketPrice && out.eps && out.eps > 0) {
    out.pe = chart.meta.regularMarketPrice / out.eps;
  }

  return out;
}

/** 批次抓多支 symbol 的指標，每支獨立快取 30 分鐘 */
export async function getCompetitorMetrics(symbols: string[]): Promise<Map<string, Partial<Competitor>>> {
  const result = new Map<string, Partial<Competitor>>();
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const m = await cached(`competitor:v2:${sym.toUpperCase()}`, 30 * 60 * 1000, () =>
          fetchCompetitorMetricsOne(sym),
        );
        result.set(sym, m);
      } catch (err) {
        console.warn(`[competitors] ${sym} failed:`, err);
        result.set(sym, {});
      }
    }),
  );
  return result;
}

// ========== 8. 分析師目標價 + SEC EDGAR 精確財報 ==========

/** 抓 Yahoo v10 quoteSummary 的分析師目標價與評級 */
async function fetchAnalystTargets(symbol: string): Promise<yahooQs.YahooQuoteSummary | null> {
  try {
    return await withRetry('yahoo-quote-summary', () => yahooQs.fetchAnalystTargets(symbol));
  } catch {
    return null;
  }
}

/** 抓 Yahoo v10 quoteSummary 的 EPS / PE / PB（補 Finnhub 缺漏） */
async function fetchYahooQuoteSummary(symbol: string): Promise<yahooQs.YahooQuoteSummaryData | null> {
  try {
    return await withRetry('yahoo-quote-summary-full', () => yahooQs.fetchQuoteSummaryData(symbol));
  } catch {
    return null;
  }
}

/** 抓美股的 SEC EDGAR 精確財報（限美股，台股走 mock fallback） */
async function fetchSecDataForUs(symbol: string): Promise<secEdgar.SecFundamentals | null> {
  try {
    const cik = await secCik.lookupCikByTicker(symbol);
    if (!cik) return null;
    return await secEdgar.fetchSecFundamentals(cik);
  } catch {
    return null;
  }
}

/** 抓台股的 MOPS XBRL 精確財報（限個股，ETF 自動跳過） */
async function fetchMopsDataForTw(symbol: string): Promise<mopsXbrl.MopsFundamentals | null> {
  try {
    const rawSymbol = symbol.replace(/\.(TW|TWO)$/i, '');
    return await mopsXbrl.fetchMopsFundamentals(rawSymbol);
  } catch {
    return null;
  }
}

/** 把 SEC EDGAR 多年期資料轉成 FinancialYear[]（補上計算欄位） */
function secHistoryToFinancialYears(history: secEdgar.SecFinancialHistory): FinancialYear[] {
  return history.years
    .filter((y) => y.revenue !== undefined || y.netIncome !== undefined)
    .map((y) => {
      const revenue = y.revenue ?? 0;
      const grossProfit = y.grossProfit ?? 0;
      const operatingIncome = y.operatingIncome ?? 0;
      const netIncome = y.netIncome ?? 0;
      const totalAssets = y.totalAssets ?? 0;
      const totalEquity = y.totalEquity ?? 0;
      const totalLiabilities = y.totalLiabilities ?? 0;
      const operatingCashFlow = y.operatingCashFlow ?? 0;
      const capex = y.capex ?? 0;
      const freeCashFlow = operatingCashFlow - capex;
      const safeDiv = (n: number, d: number): number =>
        !isFinite(n) || !isFinite(d) || d === 0 ? 0 : n / d;
      return {
        year: y.year,
        revenue,
        grossProfit,
        operatingIncome,
        netIncome,
        eps: y.eps ?? 0,
        totalAssets,
        totalLiabilities,
        totalEquity,
        operatingCashFlow,
        freeCashFlow,
        grossMargin: safeDiv(grossProfit, revenue) * 100,
        operatingMargin: safeDiv(operatingIncome, revenue) * 100,
        netMargin: safeDiv(netIncome, revenue) * 100,
        roe: (totalEquity > 0) ? safeDiv(netIncome, totalEquity) * 100 : (totalEquity < 0 ? null : 0),
        roa: safeDiv(netIncome, totalAssets) * 100,
        debtToEquity: safeDiv(totalLiabilities, totalEquity) * 100,
      };
    });
}

/** 整合 5 個估值模型，產出 ValuationResult */
function runFairValueComputation(
  shell: Partial<StockOverview>,
  sec: secEdgar.SecFundamentals | null,
  riskFreeRate: number,
  mops: mopsXbrl.MopsFundamentals | null = null,
  usedSymbol: string = '',
) {
  // 同業中位數：從 competitors.ts 拿（用 lazy require 避免循環）
  let sectorPeMedian: number | undefined;
  let sectorPsMedian: number | undefined;
  let sectorEvEbitdaMedian: number | undefined;
  try {
    const { getCompetitorsForSymbol, getSectorValuationMedian } = require('../competitors') as typeof import('../competitors');
    const symbol = shell.symbol ?? '';
    const peers = getCompetitorsForSymbol(symbol);
    if (peers.length > 0) {
      const median = getSectorValuationMedian(symbol, peers);
      sectorPeMedian = median.pe;
      sectorPsMedian = median.ps;
      sectorEvEbitdaMedian = median.evEbitda;
    }
  } catch {
    // competitors 拿不到就算了
  }

  // DPS / EBITDA / debt / cash / shares：優先 SEC（美股）或 MOPS（台股個股），其次從 shell 推估
  // MOPS 單季資料需年化（×4）才能與 PE/倍數法相容；累計（Q4）直接用
  const annualize = mops && mops.isAnnual === false ? 4 : 1;
  const eps = mops?.eps !== undefined ? mops.eps * annualize : (shell.eps ?? 0);
  const fcf = mops?.freeCashFlow !== undefined ? mops.freeCashFlow * annualize : undefined;
  const dps = mops?.netIncome && mops?.sharesOutstanding && mops?.eps
    ? ((mops.netIncome / mops.sharesOutstanding) * annualize * 0.6) // 預估 payout ~60%（MOPS XBRL 沒直接 DPS 欄位）
    : sec?.dps ?? (shell.dividendYield && shell.price ? (shell.dividendYield / 100) * shell.price : undefined);
  const payoutRatio = mops?.netIncome && mops.eps && mops.eps > 0 && mops.sharesOutstanding
    ? 0.6
    : (sec?.dps && eps > 0 ? sec.dps / eps : undefined);
  const ebitda = mops?.ebitda !== undefined ? mops.ebitda * annualize : sec?.ebitda;
  const totalDebt = mops?.totalDebt ?? sec?.totalLiabilities;
  const cash = mops?.cash ?? sec?.cashAndEquivalents;
  const sharesOutstanding = mops?.sharesOutstanding ?? sec?.sharesOutstanding
    ?? (shell.marketCap && shell.price ? shell.marketCap / shell.price : undefined);
  const roe = mops?.roe;

  // FCF 與 FCF CAGR：先 mock fallback（之後可從 financials route 傳入）
  // 為避免引入太多耦合，這裡若 shell 沒 fcf 資料就不跑 DCF（在 runValuation 內 skip）
  // SPS（P/S 模型用）目前沒合適的 per-share revenue 來源，之後從 financials 注入
  const sps: number | undefined = undefined;

  return runValuation({
    symbol: shell.symbol ?? '',
    currency: shell.currency ?? 'USD',
    price: shell.price ?? 0,
    eps,
    beta: shell.beta,
    roe,
    payoutRatio,
    sectorPeMedian,
    sectorPsMedian,
    sectorEvEbitdaMedian,
    sps,
    dps,
    ebitda,
    totalDebt,
    cash,
    sharesOutstanding,
    fcf,
    riskFreeRate,
  });
}