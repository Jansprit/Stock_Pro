/**
 * Yahoo Finance v10 quoteSummary 適配器
 *
 * 用途：抓取分析師目標價（targetMean/High/Low）、評級（recommendationKey）、
 * 分析師人數（numberOfAnalystOpinions）。這是 SEC EDGAR 之外的「市場分析師」端。
 *
 * 為何不走 yahoo-finance2 套件：本機 IP 對 v10/quoteSummary 需 cookie + crumb 兩步握手
 * 才能取得資料，yahoo-finance2 對此處理不佳，因此手刻。
 *
 * 24h 快取：分析師共識通常每日/每季才更新。
 */

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://finance.yahoo.com',
  Referer: 'https://finance.yahoo.com/',
};
const QUERY_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

const TTL = 24 * 60 * 60 * 1000;

// ========== 型別 ==========

export interface YahooQuoteSummary {
  targetMeanPrice?: number;
  targetLowPrice?: number;
  targetHighPrice?: number;
  /** 評級文字，例如 'buy' / 'hold' / 'sell' */
  recommendationKey?: 'strongBuy' | 'buy' | 'hold' | 'sell' | 'strongSell';
  recommendationMean?: number; // 1=strongBuy, 5=strongSell
  numberOfAnalystOpinions?: number;
  currentPrice?: number;
}

interface YahooQuoteSummaryResponse {
  quoteSummary?: {
    result?: Array<{
      financialData?: Record<string, { raw?: number; fmt?: string } | undefined>;
      recommendationTrend?: { trend?: Array<{ period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }> };
      defaultKeyStatistics?: Record<string, { raw?: number } | undefined>;
    }>;
    error?: unknown;
  };
}

/** Yahoo v10 quoteSummary 可一次拿齊的指標清單（給 fetchQuoteSummaryData 用） */
export interface YahooQuoteSummaryData {
  // Analyst targets (financialData)
  targetMeanPrice?: number;
  targetLowPrice?: number;
  targetHighPrice?: number;
  recommendationKey?: 'strongBuy' | 'buy' | 'hold' | 'sell' | 'strongSell';
  recommendationMean?: number;
  numberOfAnalystOpinions?: number;
  currentPrice?: number;
  // Ratios (financialData)
  trailingPE?: number;
  forwardPE?: number;
  epsTrailingTwelveMonths?: number;
  epsForward?: number;
  priceToBook?: number;
  // 公司基本（assetProfile）
  sector?: string;
  industry?: string;
  // 持股
  sharesOutstanding?: number;
}

// ========== crumb 取得 ==========
//
// 注意：Yahoo Finance v10 需要「同意 cookie」(guce.yahoo.com 或 fc.yahoo.com)
// + crumb 兩步握手。Next.js dev server 的 fetch() 預設不保留 cookie，
// 因此這裡用 cookie jar 模式手動儲存 set-cookie，並傳給後續請求。

let cachedCrumb: { crumb: string; cookie: string; fetchedAt: number } | null = null;
const CRUMB_TTL = 30 * 60 * 1000;

async function fetchCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (cachedCrumb && Date.now() - cachedCrumb.fetchedAt < CRUMB_TTL) {
    return { crumb: cachedCrumb.crumb, cookie: cachedCrumb.cookie };
  }

  // 兩條路徑都試：guce.yahoo.com (新版) 與 fc.yahoo.com (舊版)
  const bootstrapUrls = [
    'https://guce.yahoo.com/?guccounter=1',
    'https://fc.yahoo.com/',
  ];

  for (const bootstrapUrl of bootstrapUrls) {
    let cookieJar = '';
    try {
      // 第一步：抓同意頁，收集 set-cookie
      const r1 = await fetch(bootstrapUrl, { headers: BROWSER_HEADERS, redirect: 'manual' });
      const sc1 = r1.headers.get('set-cookie');
      if (sc1) cookieJar = sc1.split(';')[0];
      // 也可能回 redirect，跟隨到 https://finance.yahoo.com/ 再抓
      if (r1.status >= 300 && r1.status < 400) {
        const loc = r1.headers.get('location');
        if (loc) {
          const r2 = await fetch(loc, { headers: { ...BROWSER_HEADERS, Cookie: cookieJar }, redirect: 'manual' });
          const sc2 = r2.headers.get('set-cookie');
          if (sc2) cookieJar = (cookieJar ? cookieJar + '; ' : '') + sc2.split(';')[0];
        }
      }
    } catch {
      continue;
    }

    // 第二步：用累積的 cookie 抓 crumb
    for (const host of QUERY_HOSTS) {
      try {
        const res = await fetch(`https://${host}/v1/test/getcrumb`, {
          headers: { ...BROWSER_HEADERS, Cookie: cookieJar },
        });
        if (!res.ok) continue;
        const crumb = (await res.text()).trim();
        if (crumb && !crumb.includes('{') && !crumb.includes('<') && crumb.length > 3) {
          cachedCrumb = { crumb, cookie: cookieJar, fetchedAt: Date.now() };
          return { crumb, cookie: cookieJar };
        }
      } catch {
        // try next host
      }
    }
  }
  return null;
}

// ========== 公開函式 ==========

/** 抓 Yahoo v10 quoteSummary 的分析師目標價（thin wrapper，保留向後相容） */
export async function fetchAnalystTargets(symbol: string): Promise<YahooQuoteSummary | null> {
  const data = await fetchQuoteSummaryData(symbol);
  if (!data) return null;
  return {
    targetMeanPrice: data.targetMeanPrice,
    targetLowPrice: data.targetLowPrice,
    targetHighPrice: data.targetHighPrice,
    recommendationKey: data.recommendationKey,
    recommendationMean: data.recommendationMean,
    numberOfAnalystOpinions: data.numberOfAnalystOpinions,
    currentPrice: data.currentPrice,
  };
}

/**
 * 抓 Yahoo v10 quoteSummary 的分析師目標價、評級、EPS、PE、PB、sharesOutstanding 等
 *
 * 一次拿 financialData + defaultKeyStatistics 兩個 module。
 * 比 fetchAnalystTargets 範圍更廣（多抓 EPS / forwardPE / priceToBook），
 * 但仍共用同一個 crumb 機制與 cache。
 */
export async function fetchQuoteSummaryData(symbol: string): Promise<YahooQuoteSummaryData | null> {
  const { cached } = await import('../cache');
  const key = `yahoo-qs-full:${symbol.toUpperCase()}`;
  return cached(key, TTL, async () => {
    const cr = await fetchCrumb();
    if (!cr) {
      console.warn(`[yahoo-qs] ${symbol}: no crumb`);
      return null;
    }
    const { crumb, cookie } = cr;
    const sym = encodeURIComponent(symbol);
    const modules = 'financialData,defaultKeyStatistics,assetProfile';
    for (const host of QUERY_HOSTS) {
      const url = `https://${host}/v10/finance/quoteSummary/${sym}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
      try {
        const res = await fetch(url, { headers: { ...BROWSER_HEADERS, Cookie: cookie } });
        if (!res.ok) continue;
        const json = (await res.json()) as YahooQuoteSummaryResponse & {
          quoteSummary?: { result?: Array<{ assetProfile?: Record<string, { raw?: number; fmt?: string } | undefined> }> };
        };
        const fd = json?.quoteSummary?.result?.[0]?.financialData ?? {};
        const ks = json?.quoteSummary?.result?.[0]?.defaultKeyStatistics ?? {};
        const ap = json?.quoteSummary?.result?.[0]?.assetProfile ?? {};
        return {
          // Analyst
          targetMeanPrice: pickNum(fd.targetMeanPrice),
          targetLowPrice: pickNum(fd.targetLowPrice),
          targetHighPrice: pickNum(fd.targetHighPrice),
          recommendationKey: normalizeRating(fd.recommendationKey?.fmt ?? fd.recommendationKey as unknown as string),
          recommendationMean: pickNum(fd.recommendationMean),
          numberOfAnalystOpinions: pickNum(fd.numberOfAnalystOpinions),
          currentPrice: pickNum(fd.currentPrice),
          // Ratios — financialData 提供 trailing/forward PE 與 EPS
          trailingPE: pickNum(fd.trailingPE) ?? pickNum(ks.trailingPE),
          forwardPE: pickNum(fd.forwardPE) ?? pickNum(ks.forwardPE),
          // Yahoo v10 實際欄位名（已驗證）：
          //   - financialData 沒有 epsTrailingTwelveMonths（只有 targetMeanPrice 等分析師欄位）
          //   - defaultKeyStatistics.trailingEps / forwardEps 才是 EPS 正確來源
          epsTrailingTwelveMonths: pickNum(ks.trailingEps),
          epsForward: pickNum(ks.forwardEps),
          priceToBook: pickNum(fd.priceToBook) ?? pickNum(ks.priceToBook),
          // Sector / industry (assetProfile)
          sector: ap.sector?.fmt ?? (ap.sector as unknown as string),
          industry: ap.industry?.fmt ?? (ap.industry as unknown as string),
          // Shares
          sharesOutstanding: pickNum(ks.sharesOutstanding),
        };
      } catch {
        // try next host
      }
    }
    return null;
  });
}

function pickNum(v: { raw?: number } | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.raw);
  return isFinite(n) && n > 0 ? n : undefined;
}

function normalizeRating(s: string | undefined): 'strongBuy' | 'buy' | 'hold' | 'sell' | 'strongSell' | undefined {
  if (!s) return undefined;
  const k = s.toLowerCase();
  if (k.includes('strongbuy') || k.includes('strong buy')) return 'strongBuy';
  if (k === 'buy') return 'buy';
  if (k === 'hold') return 'hold';
  if (k === 'sell' && !k.includes('strong')) return 'sell';
  if (k.includes('strongsell') || k.includes('strong sell')) return 'strongSell';
  return undefined;
}