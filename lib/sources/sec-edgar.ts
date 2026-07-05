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

/** 判斷是否啟用 SEC EDGAR（始終免費，但需要 User-Agent 政策合規） */
export function isAvailable(): boolean {
  return true;
}