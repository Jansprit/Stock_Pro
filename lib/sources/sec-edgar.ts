/**
 * SEC EDGAR 公開 XBRL 資料源
 *
 * 用途：抓美股的歷史 DPS（每股現金股利）、EBITDA、總負債、現金等財報數字，
 * 用於估值模型（DDM、EV/EBITDA）的精確輸入。
 *
 * 免費、無 API key。SEC 政策要求 User-Agent 帶聯絡 email（fair access policy）。
 * 端點：https://data.sec.gov/api/xbrl/companyfacts/CIK{CIK10}.json
 *
 * 注意：台股不在 SEC EDGAR 覆蓋範圍，台股估值會走 mock fallback。
 */

import { cached } from '../cache';

const BASE_URL = 'https://data.sec.gov';
const UA = `Stock-Pro Research ${process.env.SEC_USER_AGENT ?? 'research@example.com'}`;

// DPS / EBITDA / debt 變動少，90 天快取即可
const TTL = 90 * 24 * 60 * 60 * 1000;

const HEADERS = { 'User-Agent': UA, Accept: 'application/json' };

// ========== 型別（部分 XBRL）==========

interface SecCompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    'us-gaap'?: Record<string, SecFactConcept>;
    'dei'?: Record<string, SecFactConcept>;
  };
}

interface SecFactConcept {
  label: string;
  description: string;
  units: Record<string, Array<{
    end: string;
    val: number;
    accn: string;
    fy: number;
    fp: string;
    form: string;
    filed: string;
    frame?: string;
  }>>;
}

export interface SecFundamentals {
  cik: number;
  entityName: string;
  /** 最新年度每股現金股利（USD） */
  dps?: number;
  /** DPS 5 年 CAGR（% 小數，例如 0.05 = 5%） */
  dpsCagr5y?: number;
  /** 最新年度營業利益（USD） */
  operatingIncome?: number;
  /** 最新年度折舊與攤銷（USD） */
  depreciationAndAmortization?: number;
  /** 推算 EBITDA = operatingIncome + D&A */
  ebitda?: number;
  /** 最新一期的總負債（USD） */
  totalLiabilities?: number;
  /** 最新一期的現金與約當現金（USD） */
  cashAndEquivalents?: number;
  /** 最新一期的營業現金流（USD） */
  operatingCashFlow?: number;
  /** 最新一期的資本支出（USD） */
  capex?: number;
  /** 計算的自由現金流（CFO - CapEx） */
  freeCashFlow?: number;
  /** 流通股數（從 entityCommonStockSharesOutstanding 抓） */
  sharesOutstanding?: number;
}

/** 多年期歷史財報（給 financial trends 圖用） */
export interface SecFinancialHistory {
  cik: number;
  entityName: string;
  /** 每年的關鍵指標（西元年） */
  years: Array<{
    year: number;            // 西元年（如 2024）
    fiscalEnd: string;       // 財報截止日（YYYY-MM-DD）
    revenue?: number;        // 營收
    grossProfit?: number;    // 毛利
    operatingIncome?: number;
    netIncome?: number;
    eps?: number;            // 每股盈餘
    totalAssets?: number;
    totalEquity?: number;
    totalLiabilities?: number;
    operatingCashFlow?: number;
    capex?: number;
  }>;
}

// ========== 內部：解析最新一期 ==========

function latestVal(
  concept: SecFactConcept | undefined,
  unit = 'USD',
): { val: number; end: string } | null {
  if (!concept) return null;
  const series = concept.units[unit];
  if (!series || series.length === 0) return null;
  // 取 end 最晚的一筆（10-K 全年或最新 10-Q）
  const sorted = [...series].sort((a, b) => a.end.localeCompare(b.end));
  const last = sorted[sorted.length - 1];
  return { val: last.val, end: last.end };
}

function cagr(startVal: number, endVal: number, years: number): number | undefined {
  if (startVal <= 0 || endVal <= 0 || years <= 0) return undefined;
  return Math.pow(endVal / startVal, 1 / years) - 1;
}

/** 從 us-gaap 或 dei 任一區段找概念（EntityCommonStockSharesOutstanding 在 dei） */
function pickAnyConcept(facts: SecCompanyFacts, ...names: string[]): SecFactConcept | undefined {
  const usGaap = facts.facts['us-gaap'] ?? {};
  const dei = facts.facts['dei'] ?? {};
  for (const n of names) {
    if (usGaap[n]) return usGaap[n];
    if (dei[n]) return dei[n];
  }
  return undefined;
}

// ========== 公開函式 ==========

export async function fetchSecFundamentals(cik: number): Promise<SecFundamentals | null> {
  return cached(`sec:facts:${cik}`, TTL, async () => {
    const cikPadded = String(cik).padStart(10, '0');
    const url = `${BASE_URL}/api/xbrl/companyfacts/CIK${cikPadded}.json`;
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        // SEC JSON 5MB 超過 Next.js fetch cache 2MB 限制；繞過內建 cache
        cache: 'no-store',
      });
      if (!res.ok) {
        console.warn(`[sec] companyfacts CIK${cikPadded}: HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as SecCompanyFacts;
      return parseSecFacts(data);
    } catch (e) {
      console.warn(`[sec] companyfacts CIK${cikPadded} failed:`, e instanceof Error ? e.message : e);
      return null;
    }
  });
}

function parseSecFacts(data: SecCompanyFacts): SecFundamentals {
  const out: SecFundamentals = { cik: data.cik, entityName: data.entityName };

  // DPS — 優先 cash paid（實際流出），fallback declared
  const dpsConcept = pickAnyConcept(data, 'CommonStockDividendsPerShareCashPaid', 'CommonStockDividendsPerShareDeclared');
  if (dpsConcept) {
    const latest = latestVal(dpsConcept, 'USD/shares');
    if (latest) {
      out.dps = latest.val;
      // 計算 5Y CAGR（找 5 年前的 end）
      const series = [...dpsConcept.units['USD/shares']].sort((a, b) => a.end.localeCompare(b.end));
      const targetYear = new Date(latest.end).getFullYear() - 5;
      const pastRecord = series.find((s) => new Date(s.end).getFullYear() === targetYear);
      if (pastRecord && pastRecord.val > 0) {
        out.dpsCagr5y = cagr(pastRecord.val, latest.val, 5);
      }
    }
  }

  // 損益表：營業利益 + 折舊攤銷 → EBITDA
  const opIncome = latestVal(pickAnyConcept(data, 'OperatingIncomeLoss'));
  if (opIncome) out.operatingIncome = opIncome.val;

  const depAmort = latestVal(pickAnyConcept(
    data,
    'DepreciationAndAmortization',
    'DepreciationDepletionAndAmortization',
    'Depreciation',
  ));
  if (depAmort) out.depreciationAndAmortization = depAmort.val;

  if (out.operatingIncome !== undefined && out.depreciationAndAmortization !== undefined) {
    out.ebitda = out.operatingIncome + out.depreciationAndAmortization;
  }

  // 資產負債：總負債 + 現金
  const totalLiab = latestVal(pickAnyConcept(
    data,
    'Liabilities',
    'LongTermDebtNoncurrent',
    'LongTermDebt',
  ));
  if (totalLiab) out.totalLiabilities = totalLiab.val;

  const cash = latestVal(pickAnyConcept(
    data,
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    'Cash',
  ));
  if (cash) out.cashAndEquivalents = cash.val;

  // 現金流：營業現金流 - 資本支出
  const cfo = latestVal(pickAnyConcept(data, 'NetCashProvidedByUsedInOperatingActivities'));
  if (cfo) out.operatingCashFlow = cfo.val;

  const capex = latestVal(pickAnyConcept(
    data,
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets',
  ));
  if (capex) out.capex = capex.val;

  if (out.operatingCashFlow !== undefined && out.capex !== undefined) {
    out.freeCashFlow = out.operatingCashFlow - out.capex;
  }

  // 流通股數（從 dei / us-gaap 都找；通常在 dei.EntityCommonStockSharesOutstanding）
  const shares = latestVal(pickAnyConcept(data, 'EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding'), 'shares');
  if (shares) out.sharesOutstanding = shares.val;

  return out;
}

// ========== 多年期歷史（給財務趨勢圖用） ==========

/** 從 SEC companyfacts 抽出「每個西曆年」的彙總（10-K 全年值，非單季）
 *
 * Frame 規則（很混亂，不同公司 SEC 申報習慣不同）：
 * - duration 概念（revenue / netIncome / operatingCashFlow）：frame 應該是 `CYxxxx`，
 *   但很多公司不帶 frame 也能算（end-date 已是年末）
 * - instant 概念（assets / equity）：frame 是 `CYxxxxQ#I`，且每筆都帶，沒 frame=undefined 的情況
 *
 * 寬鬆化（v4 → v5）：只認 `form === '10-K'` + `fp === 'FY'` + end 是年末，
 * frame 用來驗證「不是單季誤標」就好，不要當必要條件。
 */
function pickAnnualHistory(
  concept: SecFactConcept | undefined,
  unit = 'USD',
): Array<{ year: number; val: number; end: string }> {
  if (!concept || !concept.units[unit]) return [];
  const series = concept.units[unit];

  // 判斷這個概念是 instant（資產負債）還是 duration（損益/現金流）
  // 方法：看 label / name 含 Assets / Liabilities / Equity → instant，其他 duration
  const isInstant =
    concept.label?.match(/assets|liabilities|equity/i) ||
    false;

  const annual = series.filter((s) => {
    if (s.fp !== 'FY') return false;
    if (s.form !== '10-K' && s.form !== '10-K/A') return false;
    // duration 概念：frame 可以是 CYxxxx 或 undefined
    // instant 概念：frame 必須是 CYxxxxQ[1-4]I（資產負債表本來就是 instant）
    if (typeof s.frame === 'string') {
      if (isInstant) {
        if (!/^CY\d{4}Q[1-4]I$/.test(s.frame)) return false;
      } else {
        if (!/^CY\d{4}$/.test(s.frame)) return false;
      }
    }
    return true;
  });

  // 同份 10-K 一次報告 3 個會計年度（如 HPQ accn=...-25-000071 含 2023+2024+2025），
  // 所以必須用 (accn, end) 複合 key 不能只用 accn
  const byAccnEnd = new Map<string, { val: number; end: string; accn: string; filed: string }>();
  for (const s of annual) {
    const key = `${s.accn}|${s.end}`;
    const existing = byAccnEnd.get(key);
    if (!existing || s.filed > existing.filed) {
      byAccnEnd.set(key, { val: s.val, end: s.end, accn: s.accn, filed: s.filed });
    }
  }

  // 再 by year 取「最新 filed」的版本（重述優先）
  const byYear = new Map<number, { val: number; end: string; filed: string }>();
  for (const v of byAccnEnd.values()) {
    const year = new Date(v.end).getFullYear();
    const existing = byYear.get(year);
    if (!existing || v.filed > existing.filed) {
      byYear.set(year, { val: v.val, end: v.end, filed: v.filed });
    }
  }
  return Array.from(byYear.entries())
    .map(([year, v]) => ({ year, val: v.val, end: v.end }))
    .sort((a, b) => a.year - b.year);
}

/** 多概念合併抓歷史：AAPL 的 Revenues 只有舊年份，新年份在
 *  RevenueFromContractWithCustomerExcludingAssessedTax — 必須合併所有候選 concept */
function pickMergedAnnualHistory(
  facts: SecCompanyFacts,
  conceptNames: string[],
  unit = 'USD',
): Array<{ year: number; val: number; end: string }> {
  const merged = new Map<number, { val: number; end: string }>();
  for (const name of conceptNames) {
    const concept = pickAnyConcept(facts, name);
    for (const e of pickAnnualHistory(concept, unit)) {
      const existing = merged.get(e.year);
      if (!existing || e.end > existing.end) {
        merged.set(e.year, { val: e.val, end: e.end });
      }
    }
  }
  return Array.from(merged.entries())
    .map(([year, v]) => ({ year, val: v.val, end: v.end }))
    .sort((a, b) => a.year - b.year);
}

/**
 * 抓 SEC companyfacts，整理成 5 年年度歷史財報
 *
 * 注意：免費、無 rate limit，但官方 User-Agent 政策要求 email 格式
 *
 * @param cik SEC 中央索引鍵
 * @param years 取幾年（預設 5）
 */
export async function fetchSecFinancialHistory(
  cik: number,
  years = 5,
): Promise<SecFinancialHistory | null> {
  return cached(`sec:history:v8:${cik}:${years}`, TTL, async () => {
    const cikPadded = String(cik).padStart(10, '0');
    const url = `${BASE_URL}/api/xbrl/companyfacts/CIK${cikPadded}.json`;
    try {
      const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
      if (!res.ok) {
        console.warn(`[sec] companyfacts CIK${cikPadded}: HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as SecCompanyFacts;
      const revHistory = pickMergedAnnualHistory(data, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet'], 'USD');
      const gpHistory = pickMergedAnnualHistory(data, ['GrossProfit'], 'USD');
      const opHistory = pickMergedAnnualHistory(data, ['OperatingIncomeLoss'], 'USD');
      const niHistory = pickMergedAnnualHistory(data, ['NetIncomeLoss', 'ProfitLoss'], 'USD');
      const epsHistory = pickAnnualHistory(pickAnyConcept(data, 'EarningsPerShareDiluted', 'EarningsPerShareBasic'), 'USD/shares');
      const taHistory = pickMergedAnnualHistory(data, ['Assets'], 'USD');
      const teHistory = pickMergedAnnualHistory(data, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], 'USD');
      const tlHistory = pickMergedAnnualHistory(data, ['Liabilities'], 'USD');
      const cfoHistory = pickMergedAnnualHistory(data, ['NetCashProvidedByUsedInOperatingActivities'], 'USD');
      const capexHistory = pickMergedAnnualHistory(data, ['PaymentsToAcquirePropertyPlantAndEquipment'], 'USD');

      // 取所有 year 的 union
      const yearSet = new Set<number>();
      for (const h of [revHistory, gpHistory, opHistory, niHistory, epsHistory, taHistory, teHistory, tlHistory, cfoHistory, capexHistory]) {
        for (const e of h) yearSet.add(e.year);
      }
      const allYears = Array.from(yearSet).sort((a, b) => b - a).slice(0, years);

      const findVal = (h: Array<{ year: number; val: number; end: string }>, y: number) => h.find((e) => e.year === y)?.val;
      const findEnd = (h: Array<{ year: number; val: number; end: string }>, y: number) => h.find((e) => e.year === y)?.end ?? `${y}-12-31`;

      const out: SecFinancialHistory = {
        cik: data.cik,
        entityName: data.entityName,
        years: allYears
          .sort((a, b) => a - b)
          .map((y) => ({
            year: y,
            fiscalEnd: findEnd(revHistory, y) || findEnd(niHistory, y),
            revenue: findVal(revHistory, y),
            grossProfit: findVal(gpHistory, y),
            operatingIncome: findVal(opHistory, y),
            netIncome: findVal(niHistory, y),
            eps: findVal(epsHistory, y),
            totalAssets: findVal(taHistory, y),
            totalEquity: findVal(teHistory, y),
            totalLiabilities: findVal(tlHistory, y),
            operatingCashFlow: findVal(cfoHistory, y),
            capex: findVal(capexHistory, y),
          })),
      };
      return out;
    } catch (e) {
      console.warn(`[sec] companyfacts CIK${cik} history failed:`, e instanceof Error ? e.message : e);
      return null;
    }
  });
}

// ========== SIC code 查詢（用於產業分類 fallback） ==========

export interface SecCompanyInfo {
  cik: number;
  entityName: string;
  /** 4 位數字 SIC code（如 '3571' = Electronic Computers） */
  sic?: string;
  /** SEC 提供的 SIC 文字描述 */
  sicDescription?: string;
  /** 交易所代號（如 'NASDAQ'） */
  exchanges?: string[];
  /** 申報 fiscal year 結束日（MMDD 格式，如 '0926' = 9/26） */
  fiscalYearEnd?: string;
}

/**
 * 抓 SEC submissions endpoint，拿到公司基本資料（含 SIC code）
 *
 * 端點：https://data.sec.gov/submissions/CIK{CIK10}.json
 * 大小：~50KB（比 companyfacts 小很多）
 *
 * @param cik SEC 中央索引鍵
 */
export async function fetchSecCompanyInfo(cik: number): Promise<SecCompanyInfo | null> {
  return cached(`sec:submissions:${cik}`, TTL, async () => {
    const cikPadded = String(cik).padStart(10, '0');
    const url = `${BASE_URL}/submissions/CIK${cikPadded}.json`;
    try {
      const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
      if (!res.ok) {
        console.warn(`[sec] submissions CIK${cikPadded}: HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        cik: number;
        name: string;
        sic?: string;
        sicDescription?: string;
        exchanges?: string[];
        fiscalYearEnd?: string;
      };
      return {
        cik: data.cik,
        entityName: data.name,
        sic: data.sic,
        sicDescription: data.sicDescription,
        exchanges: data.exchanges,
        fiscalYearEnd: data.fiscalYearEnd,
      };
    } catch (e) {
      console.warn(`[sec] submissions CIK${cik} failed:`, e instanceof Error ? e.message : e);
      return null;
    }
  });
}

/** 判斷是否啟用 SEC EDGAR（始終免費，但需要 User-Agent 政策合規） */
export function isAvailable(): boolean {
  return true;
}