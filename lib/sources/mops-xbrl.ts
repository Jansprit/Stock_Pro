/**
 * MOPS 公開資訊觀測站 XBRL 抓取器（限台股個股）
 *
 * 端點：https://mopsov.twse.com.tw/server-java/t164sb01
 *   ?step=1
 *   &CO_ID={4-6 位數字代號，無後綴}
 *   &SYEAR={西元年}
 *   &SSEASON={1|2|3|4} — 1=單季，4=全年累計
 *   &REPORT_ID={C=合併}
 *
 * 回傳 HTML 內嵌 IFRS XBRL（ixt:numdotdecimal 格式），可直接 parse <ix:nonFraction> 標籤。
 *
 * 限制：
 *   - 個股限定（上市 + 上櫃），ETF 不適用（會回 "檔案不存在"）
 *   - SSEASON=2 在 8/15 前尚未公告，會失敗
 *   - SSEASON=4 是「全年累計」，單季 Q4 需自己減 Q3 累計
 *
 * 快取 24h：財報季報更新頻率。
 */

import { cached } from '../cache';
import type { FinancialYear } from '../types';

const URL = 'https://mopsov.twse.com.tw/server-java/t164sb01';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TTL = 24 * 60 * 60 * 1000;

export interface MopsFundamentals {
  /** 4-6 位純數字代號（無 .TW/.TWO） */
  rawSymbol: string;
  /** 抓取季度，例如 '2026Q1' 或 '2025Q4' */
  period: string;
  /** 是否為全年累計（SSEASON=4 為 true；1-3 為 false 單季） */
  isAnnual: boolean;
  /** 母公司淨利（TWD，注意 scale="3" 已是千元，這裡轉成元） */
  netIncome?: number;
  /** 營收（元） */
  revenue?: number;
  /** 每股盈餘（元，直接值） */
  eps?: number;
  /** 營業活動現金流（元） */
  cfo?: number;
  /** 資本支出（元，購買 PPE 之現金流出） */
  capex?: number;
  /** 自由現金流（= CFO - CapEx，元） */
  freeCashFlow?: number;

  /** 總資產（元） */
  totalAssets?: number;
  /** 總負債（元） */
  totalLiabilities?: number;
  /** 母公司權益（元） */
  equity?: number;
  /** 現金與約當現金（元） */
  cash?: number;
  /** 短期借款（元） */
  shorttermBorrowings?: number;
  /** 長期借款（元） */
  longtermBorrowings?: number;
  /** 總借款 = short + long */
  totalDebt?: number;

  /** 營業利益（元） */
  operatingIncome?: number;
  /** 毛利（元） */
  grossProfit?: number;
  /** 折舊與攤銷（元） */
  depreciationAmortization?: number;
  /** 推算 EBITDA = operatingIncome + D&A */
  ebitda?: number;

  /** 股本（元，需再 ÷ 每股面額 10 = 流通股數） */
  issuedCapital?: number;
  /** 流通股數（已計算） */
  sharesOutstanding?: number;

  /** ROE（netIncome / equity） */
  roe?: number;
}

/**
 * 抓取個股最新可用季度財報
 *
 * @param rawSymbol 純數字代號（4-6 位），如 '2330'
 * @param year 西元年（預設當年）
 * @param season 1-4（預設 4 = 全年累計；若失敗自動 fallback）
 */
export async function fetchMopsFundamentals(
  rawSymbol: string,
  year?: number,
  season?: number,
): Promise<MopsFundamentals | null> {
  return cached(`mops:fundamentals:${rawSymbol}:${year ?? 'current'}:${season ?? 'current'}`, TTL, async () => {
    const sym = rawSymbol.replace(/\.(TW|TWO)$/i, '');
    // 用現在日期決定預設查詢：Q4 > Q3 > Q2 > Q1
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    // 公告時間表：Q1 約 5/15、Q2 約 8/15、Q3 約 11/15、Q4 約 3/31
    const seasonAvailable = (m: number, s: number): boolean => {
      if (s === 1) return m >= 6;
      if (s === 2) return m >= 9;
      if (s === 3) return m >= 12;
      return true; // Q4 always available from 4 月起
    };
    const trials: Array<[number, number]> = [];
    if (year !== undefined && season !== undefined) {
      trials.push([year, season]);
    } else {
      // 從最新往舊試
      const candidates: Array<[number, number]> = [
        // 優先 Q4（全年累計）→ 數字可直接用於估值模型（避免單季年化誤差）
        [curYear, 4],
        // 否則才用 Q3 / Q2 / Q1 單季（會在 annualize 邏輯處理）
        [curYear, 3],
        [curYear, 2],
        [curYear, 1],
        [curYear - 1, 4],
      ];
      for (const [y, s] of candidates) {
        // 對現在的時間判斷是否已公告
        if (y === curYear && !seasonAvailable(curMonth, s)) continue;
        // 若使用者指定了 year/season 上限，只取 <= 指定值
        if (year !== undefined && y > year) continue;
        if (season !== undefined && y === year && s > season) continue;
        trials.push([y, s]);
      }
    }

    for (const [y, s] of trials) {
      const result = await tryFetchPeriod(sym, y, s);
      if (result) return result;
    }
    return null;
  });
}

async function tryFetchPeriod(rawSymbol: string, year: number, season: number): Promise<MopsFundamentals | null> {
  const params = new URLSearchParams({
    step: '1',
    CO_ID: rawSymbol,
    SYEAR: String(year),
    SSEASON: String(season),
    REPORT_ID: 'C',
  });
  const url = `${URL}?${params.toString()}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
    if (!res.ok) return null;
    const html = await res.text();
    // 「檔案不存在」錯誤訊息（big5 編碼的「檔」開頭）
    if (html.includes('�ɮפ��s�b') || html.includes('檔案不存在') || html.length < 1000) return null;
    return parseMopsXbrl(html, rawSymbol, `${year}Q${season}`, season);
  } catch {
    return null;
  }
}

// ========== XBRL 解析 ==========

interface XbrlValue {
  /** 期間上下文：流動 "From20260101To20260331" 或 期末 "AsOf20260331" */
  context: string;
  /** XBRL scale 標籤表示的倍數（"3" 表示原數值 × 1000） */
  scale: number;
  /** XBRL decimals */
  decimals: number;
  /** 數值字串（含千分位逗號） */
  raw: string;
  /** 原始 scale 標籤，例如 "3" 或 "0" */
  scaleRaw: string;
}

/**
 * 從 XBRL HTML 中提取所有 ifrs-full:XXX 標籤的值
 *
 * 用 regex 匹配 <ix:nonFraction name="ifrs-full:XXX" ...>VALUE</ix:nonFraction>
 * 與 <ifrs-full:XXX ...>VALUE</ifrs-full:XXX> 兩種寫法（inline XBRL）。
 */
function extractXbrlValues(html: string): Map<string, XbrlValue[]> {
  const out = new Map<string, XbrlValue[]>();
  // 屬性順序：name → contextRef → (format) → scale → decimals → (unitRef)
  // 注意：scale 是必要屬性（MOPS XBRL 都會帶）；直接列舉而不依賴 [^>]*? lazy match
  const pattern = /<ix:nonFraction[^>]*?name="ifrs-full:([A-Za-z]+)"[^>]*?contextRef="([^"]+)"[^>]*?scale="(-?\d+)"[^>]*?>([\d,.\-]+)<\/ix:nonFraction>/g;

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const tag = `ifrs-full:${m[1]}`;
    const context = m[2];
    const scaleRaw = m[3];
    const raw = m[4];
    const scale = parseInt(scaleRaw, 10);
    const val: XbrlValue = { context, scale: isFinite(scale) ? scale : 0, decimals: 0, raw, scaleRaw };
    if (!out.has(tag)) out.set(tag, []);
    out.get(tag)!.push(val);
  }
  return out;
}

/** 從 contextRef 中判斷是「流動期間」還是「期末快照」 */
function isFlowContext(ctx: string): boolean {
  return ctx.startsWith('From');
}

function parseNum(v: XbrlValue): number {
  const cleaned = v.raw.replace(/,/g, '').trim();
  const n = Number(cleaned);
  if (!isFinite(n)) return 0;
  // scale="3" 表示原數值 × 1000（千元 → 元）；scale="-3" 表示 × 0.001
  return n * Math.pow(10, v.scale);
}

/** 從一組 XBRL values 中挑選對應季度的「最近一期」 */
function pickRecentFlow(values: XbrlValue[] | undefined): XbrlValue | undefined {
  if (!values) return undefined;
  const flows = values.filter((v) => isFlowContext(v.context));
  if (flows.length === 0) return undefined;
  // 依 context 的 end date 排序取最新
  flows.sort((a, b) => a.context.localeCompare(b.context));
  return flows[flows.length - 1];
}

function pickRecentSnapshot(values: XbrlValue[] | undefined): XbrlValue | undefined {
  if (!values) return undefined;
  const snaps = values.filter((v) => !isFlowContext(v.context));
  if (snaps.length === 0) return undefined;
  snaps.sort((a, b) => a.context.localeCompare(b.context));
  return snaps[snaps.length - 1];
}

function parseMopsXbrl(html: string, rawSymbol: string, period: string, season: number): MopsFundamentals | null {
  const all = extractXbrlValues(html);

  const get = pickRecentFlow(all.get('ifrs-full:Revenue'));
  const revenue = get ? parseNum(get) : undefined;

  const netIncomeV = pickRecentFlow(all.get('ifrs-full:ProfitLossAttributableToOwnersOfParent'));
  const netIncome = netIncomeV ? parseNum(netIncomeV) : undefined;

  const epsV = pickRecentFlow(all.get('ifrs-full:BasicEarningsLossPerShare'));
  // EPS scale 通常為 0（直接是元），但若 scale != 0 仍套用
  const eps = epsV ? parseNum(epsV) : undefined;

  const cfoV = pickRecentFlow(all.get('ifrs-full:CashFlowsFromUsedInOperatingActivities'));
  const cfo = cfoV ? parseNum(cfoV) : undefined;

  // CapEx 的 tag 不固定，先試多個
  const capexV = pickRecentFlow(all.get('ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'))
    ?? pickRecentFlow(all.get('ifrs-full:PaymentsToAcquirePropertyPlantAndEquipment'));
  const capex = capexV ? parseNum(capexV) : undefined;

  // 資產負債快照
  const assetsV = pickRecentSnapshot(all.get('ifrs-full:Assets'));
  const totalAssets = assetsV ? parseNum(assetsV) : undefined;

  const liabV = pickRecentSnapshot(all.get('ifrs-full:Liabilities'));
  const totalLiabilities = liabV ? parseNum(liabV) : undefined;

  const equityV = pickRecentSnapshot(all.get('ifrs-full:EquityAttributableToOwnersOfParent'));
  const equity = equityV ? parseNum(equityV) : undefined;

  const cashV = pickRecentSnapshot(all.get('ifrs-full:CashAndCashEquivalents'));
  const cash = cashV ? parseNum(cashV) : undefined;

  const stBorrowV = pickRecentSnapshot(all.get('ifrs-full:ShorttermBorrowings'));
  const ltBorrowV = pickRecentSnapshot(all.get('ifrs-full:LongtermBorrowings'));
  const shorttermBorrowings = stBorrowV ? parseNum(stBorrowV) : 0;
  const longtermBorrowings = ltBorrowV ? parseNum(ltBorrowV) : 0;
  const totalDebt = (shorttermBorrowings || 0) + (longtermBorrowings || 0) || undefined;

  // 營業利益
  const opIncomeV = pickRecentFlow(all.get('ifrs-full:ProfitLossFromOperatingActivities'))
    ?? pickRecentFlow(all.get('ifrs-full:OperatingProfitLoss'));
  const operatingIncome = opIncomeV ? parseNum(opIncomeV) : undefined;

  // 毛利（MOPS XBRL 有 GrossProfit 標籤，優先抓真實值；缺時 fallback revenue * 0.4）
  const grossProfitV = pickRecentFlow(all.get('ifrs-full:GrossProfit'));
  const grossProfit = grossProfitV ? parseNum(grossProfitV) : undefined;

  // 折舊與攤銷（XBRL 內不一定有，可能要從現金流量表的 Adjustments 推）
  const depAmortV = pickRecentFlow(all.get('ifrs-full:DepreciationAmortisation'))
    ?? pickRecentFlow(all.get('ifrs-full:DepreciationAndAmortisation'))
    ?? pickRecentFlow(all.get('ifrs-full:AdjustmentsForDepreciationExpense'))
    ?? pickRecentFlow(all.get('ifrs-full:AdjustmentsForAmortisationExpense'));
  const depreciationAmortization = depAmortV ? parseNum(depAmortV) : undefined;

  // 股本 → 流通股
  const issuedV = pickRecentSnapshot(all.get('ifrs-full:IssuedCapital'));
  const issuedCapital = issuedV ? parseNum(issuedV) : undefined;
  // 台股每股面額 10 元；issuedCapital 是「元」所以 ÷ 10 = 股數
  const sharesOutstanding = issuedCapital !== undefined ? issuedCapital / 10 : undefined;

  // 推算欄位
  const fcf = cfo !== undefined && capex !== undefined ? cfo - capex : undefined;
  const ebitda = operatingIncome !== undefined && depreciationAmortization !== undefined
    ? operatingIncome + depreciationAmortization
    : undefined;
  const roe = netIncome !== undefined && equity !== undefined && equity > 0 ? netIncome / equity : undefined;

  // 若完全沒抓到任何資料，就視為失敗
  if (revenue === undefined && netIncome === undefined && eps === undefined && totalAssets === undefined) {
    return null;
  }

  return {
    rawSymbol,
    period,
    isAnnual: season === 4,
    netIncome,
    revenue,
    eps,
    cfo,
    capex,
    freeCashFlow: fcf,
    totalAssets,
    totalLiabilities,
    equity,
    cash,
    shorttermBorrowings: shorttermBorrowings || undefined,
    longtermBorrowings: longtermBorrowings || undefined,
    totalDebt,
    operatingIncome,
    grossProfit,
    depreciationAmortization,
    ebitda,
    issuedCapital,
    sharesOutstanding,
    roe,
  };
}

/**
 * 抓取近 N 年年度累計財報（SSEASON=4）以組出 trend chart
 *
 * 從當年往前抓直到拿到 N 個年度，或超過最早可查年度（通常 2018）就停。
 *
 * @param rawSymbol 純數字代號，如 '2330'
 * @param years 欲抓取的年度數（預設 5）
 */
export async function fetchMopsMultiYearFinancials(
  rawSymbol: string,
  years = 5,
): Promise<MopsFundamentals[]> {
  const results: MopsFundamentals[] = [];
  const now = new Date();
  const curYear = now.getFullYear();
  // Q4 通常隔年 3 月底後才公告，因此今年 Q4 可能尚未出
  // 策略：若今年 Q4 還沒公告，從去年 Q4 開始往回抓
  const monthNow = now.getMonth() + 1;
  const thisYearQ4Available = monthNow >= 4;
  const startYear = thisYearQ4Available ? curYear : curYear - 1;

  for (let y = startYear; y >= startYear - 10 && results.length < years; y--) {
    const result = await fetchMopsFundamentals(rawSymbol, y, 4);
    if (result) results.push(result);
  }
  return results;
}

/**
 * 把 MopsFundamentals 陣列轉成 FinancialYear[]，給前端圖表用
 */
export function mopsToFinancialYears(data: MopsFundamentals[]): FinancialYear[] {
  return data
    .filter((d) => d.revenue !== undefined || d.netIncome !== undefined || d.eps !== undefined)
    .map((d) => {
      const revenue = d.revenue ?? 0;
      const grossProfit = d.grossProfit ?? (d.revenue ? d.revenue * 0.4 : 0); // 優先 MOPS 真實 GrossProfit，缺時 fallback revenue * 0.4
      const operatingIncome = d.operatingIncome ?? 0;
      const netIncome = d.netIncome ?? 0;
      const eps = d.eps ?? 0;
      const totalAssets = d.totalAssets ?? 0;
      const totalLiabilities = d.totalLiabilities ?? 0;
      const totalEquity = d.equity ?? 0;
      const operatingCashFlow = d.cfo ?? 0;
      const capex = d.capex ?? 0;
      const freeCashFlow = d.freeCashFlow ?? 0;

      return {
        year: Number(d.period.slice(0, 4)),
        revenue,
        grossProfit,
        operatingIncome,
        netIncome,
        eps,
        totalAssets,
        totalLiabilities,
        totalEquity,
        operatingCashFlow,
        freeCashFlow,
        grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        operatingMargin: revenue > 0 ? (operatingIncome / revenue) * 100 : 0,
        netMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
        roe: totalEquity > 0 ? (netIncome / totalEquity) * 100 : 0,
        roa: totalAssets > 0 ? (netIncome / totalAssets) * 100 : 0,
        debtToEquity: totalEquity > 0 ? (totalLiabilities / totalEquity) * 100 : 0,
      };
    });
}

/** 判斷是否啟用 MOPS（始終免費） */
export function isAvailable(): boolean {
  return true;
}