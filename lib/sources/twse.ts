/**
 * TWSE / TPEx / MIS 公開端點適配器
 *
 * 三個來源，全部免費、無需 API key：
 *   1. MIS (mis.twse.com.tw)：即時報價（5 秒延遲，盤中與盤後）
 *      - 上市：`ex_ch=tse_<id>.tw`
 *      - 上櫃：`ex_ch=otc_<id>.tw`
 *      - 一次支援多股：`ex_ch=tse_2330.tw|otc_6488.tw`
 *   2. TWSE 月K線（www.twse.com.tw/exchangeReport/STOCK_DAY）
 *   3. TPEx 月K線（www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock）
 *   4. TWSE 估值月報（BWIBBU）— 只覆蓋上市
 *
 * 速率節流：TWSE 建議「5 秒 3 req」，本檔的 lastCallAt 設 1.5 秒間隔，
 * 既不會被擋，也能充分發揮免費額度。
 *
 * 不做的事：
 *   - 上櫃估值（TPEx 沒有公開 JSON 端點 → fallback 到 mock seed）
 *   - 詳細財報三表（TWSE 月報太複雜且欄位多變 → 暫以 mock 補）
 */

import type { PricePoint, ChartRange, StockOverview } from '../types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MIS_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';
const MIS_INDEX_URL = 'https://mis.twse.com.tw/stock/index.jsp';
const TWSE_KLINE_URL = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';
const TPEX_KLINE_URL = 'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock';
const TWSE_VALUATION_URL = 'https://www.twse.com.tw/exchangeReport/BWIBBU';

// ========== 節流 ==========
let lastCallAt = 0;
const MIN_INTERVAL_MS = 1500;

async function throttle(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

// ========== 共用 fetch helper ==========

async function fetchJson(url: string, opts: { referer?: string; cookie?: string } = {}): Promise<unknown> {
  await throttle();
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json,text/plain,*/*',
  };
  if (opts.referer) headers.Referer = opts.referer;
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`[twse] HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

/** 取得 MIS session cookie（realtime.get 流程的第一步） */
let cachedCookie: string | null = null;
let cookieAt = 0;
async function getMisCookie(): Promise<string> {
  // cookie 30 分鐘內重用
  if (cachedCookie && Date.now() - cookieAt < 30 * 60 * 1000) return cachedCookie;
  await throttle();
  const res = await fetch(MIS_INDEX_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'manual',
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  // 只取 key=value 的第一段
  const m = setCookie.match(/([^=;]+)=([^;]+)/);
  cachedCookie = m ? `${m[1]}=${m[2]}` : '';
  cookieAt = Date.now();
  return cachedCookie;
}

// ========== 1. 即時報價 ==========

export interface MisQuote {
  symbol: string; // '2330' or '6488'
  name: string;
  fullname: string;
  exchange: 'tse' | 'otc';
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  time: string; // 'HH:MM:SS'
  bidPrices: number[]; // 5 檔
  askPrices: number[];
}

/**
 * 把 MIS 的單股原始 map 轉成乾淨的 MisQuote
 *
 * MIS 欄位對照（從 twstock 推導 + 實測）：
 *   c = 股票代碼
 *   n = 股票簡稱
 *   nf = 公司全名
 *   z = 成交價（最新）
 *   o = 開盤
 *   h = 最高
 *   l = 最低
 *   y = 昨收
 *   v = 累計成交量（張）
 *   t = 成交時間
 *   a/b = 五檔買/賣價（"價1_價2_..."）
 *   ex = 'tse' | 'otc'
 */
function parseMisQuote(raw: Record<string, string>): MisQuote | null {
  const price = Number(raw.z);
  if (!price || price === 0 || raw.z === '-') return null;
  const symbol = raw.c ?? '';
  if (!symbol) return null;

  const parseLevels = (s: string | undefined): number[] =>
    (s ?? '').split('_').filter(Boolean).map(Number).filter((n) => n > 0).slice(0, 5);

  return {
    symbol,
    name: raw.n ?? '',
    fullname: raw.nf ?? '',
    exchange: raw.ex === 'otc' ? 'otc' : 'tse',
    price,
    open: Number(raw.o ?? 0),
    high: Number(raw.h ?? 0),
    low: Number(raw.l ?? 0),
    prevClose: Number(raw.y ?? 0),
    volume: Number(raw.v ?? 0),
    time: raw.t ?? '',
    bidPrices: parseLevels(raw.b),
    askPrices: parseLevels(raw.a),
  };
}

/**
 * 透過 MIS 同時抓 1 支或多支股票的即時報價
 *
 * @param rawSymbols 已正規化的純數字代號（如 ['2330', '6488']）
 *                   函式內會自動加上 tse_/otc_ 前綴並 | 分隔
 */
export async function fetchMisQuotes(rawSymbols: string[]): Promise<MisQuote[]> {
  if (rawSymbols.length === 0) return [];

  // 同時抓上市與上櫃時，先試上市（每個都 fallback 一次代號）
  const channels = rawSymbols.map((s) => `tse_${s}.tw|otc_${s}.tw`).join('|');
  const cookie = await getMisCookie();
  const url = `${MIS_URL}?ex_ch=${encodeURIComponent(channels)}&_=${Date.now()}&json=1&delay=0`;

  let json: unknown;
  try {
    json = await fetchJson(url, { referer: MIS_INDEX_URL, cookie });
  } catch (e) {
    console.error('[twse] MIS quote fetch failed:', e instanceof Error ? e.message : e);
    return [];
  }

  const arr = (json as { msgArray?: Array<Record<string, string>> })?.msgArray;
  if (!Array.isArray(arr)) return [];

  // MIS 對上市/上櫃都會回傳，但對不存在的 ex_ch 會回傳 stat:'NoMatch'
  // 我們只看 ex 欄位是否匹配 request
  const byExchange = new Map<string, Record<string, string>>();
  for (const item of arr) {
    const ex = item.ex;
    const c = item.c;
    if (!ex || !c) continue;
    byExchange.set(`${ex}_${c}`, item);
  }

  const results: MisQuote[] = [];
  for (const sym of rawSymbols) {
    // 先看上市
    const tse = byExchange.get(`tse_${sym}`);
    if (tse) {
      const q = parseMisQuote(tse);
      if (q) { results.push(q); continue; }
    }
    const otc = byExchange.get(`otc_${sym}`);
    if (otc) {
      const q = parseMisQuote(otc);
      if (q) results.push(q);
    }
  }
  return results;
}

/** 抓單一股票的即時報價（給 routing 入口用） */
export async function fetchSingleQuote(rawSymbol: string): Promise<MisQuote | null> {
  const arr = await fetchMisQuotes([rawSymbol]);
  return arr[0] ?? null;
}

// ========== 2. K 線 ==========

const RANGE_TO_MONTHS: Record<ChartRange, number> = {
  '1M': 1,
  '3M': 3,
  '1Y': 12,
  '5Y': 60,
};

/** 把 MIS quote 內的 vol 從「張」轉成「股」（K 線單位也是股，MIS v 是張） */
function sharesFromLots(lots: number): number {
  return lots * 1000;
}

/** MIS 報價轉 StockOverview（部分欄位，剩餘交給 routing 合併） */
export function misQuoteToOverview(q: MisQuote, rawSymbol: string): StockOverview {
  const sym = `${rawSymbol}.${q.exchange === 'otc' ? 'TWO' : 'TW'}`;
  return {
    symbol: sym,
    name: q.name,
    exchange: q.exchange === 'otc' ? 'Taipei Exchange' : 'Taiwan',
    currency: 'TWD',
    price: q.price,
    change: q.price - q.prevClose,
    changePercent: q.prevClose > 0 ? ((q.price - q.prevClose) / q.prevClose) * 100 : 0,
    previousClose: q.prevClose,
    open: q.open,
    dayHigh: q.high,
    dayLow: q.low,
    volume: sharesFromLots(q.volume),
    // 其他欄位由 routing 從 TWSE BWIBBU / Finnhub / mock 補
    avgVolume: undefined,
    marketCap: undefined,
    trailingPE: undefined,
    forwardPE: undefined,
    eps: undefined,
    beta: undefined,
    dividendYield: undefined,
    fiftyTwoWeekHigh: undefined,
    fiftyTwoWeekLow: undefined,
    sector: '',
    industry: '',
    description: '',
    website: '',
    country: 'TW',
    employees: undefined,
    founded: '',
    headquarters: '',
    ceo: '',
  };
}

/**
 * 抓 TWSE 月 K 線，並組合成指定範圍的 PricePoint[]
 *
 * 上市：GET /exchangeReport/STOCK_DAY?date=YYYYMMDD&stockNo=XXXX&response=json
 * TWSE 一次只回一個月，需要從最早月份一路抓回「包含今天」的月份。
 *
 * 智慧跳過：
 *   - 連續 2 個月 stat !== 'OK' 表示該 symbol 在此期間未上市/無資料，提前結束
 *   - ETF 與新上市股票常見這種情境（例如 00405A 2026-05-25 才上市）
 *
 * @param rawSymbol 純數字代號（4-6 位），如 '2330'
 * @param range 範圍
 */
export async function fetchTwseKLine(rawSymbol: string, range: ChartRange): Promise<PricePoint[]> {
  const months = RANGE_TO_MONTHS[range];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setMonth(today.getMonth() - months);

  const out: PricePoint[] = [];

  // 並行抓每個月（原本 sequential 對 1Y 需 12 次 HTTP ≈ 18s → 並行後 < 3s）
  // 注意：早期上市未滿 N 個月用 cursor 限制，所以這裡要列出所有月份再 filter
  const monthList: string[] = [];
  const cursorForList = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (cursorForList <= today) {
    const dateStr = `${cursorForList.getFullYear()}${String(cursorForList.getMonth() + 1).padStart(2, '0')}01`;
    monthList.push(dateStr);
    cursorForList.setMonth(cursorForList.getMonth() + 1);
  }

  // 並行抓每個月，但用 Promise.allSettled 避免單月失敗拖整體
  const monthResults = await Promise.allSettled(
    monthList.map(async (dateStr) => {
      const url = `${TWSE_KLINE_URL}?response=json&date=${dateStr}&stockNo=${encodeURIComponent(rawSymbol)}`;
      try {
        const json = (await fetchJson(url)) as { stat?: string; data?: string[][] };
        if (json?.stat === 'OK' && Array.isArray(json.data)) return json.data;
        return null;
      } catch {
        return null;
      }
    }),
  );

  // 收集所有 rows（按時間順序）
  let consecutiveMiss = 0;
  const MAX_CONSECUTIVE_MISS = 2;
  for (let i = 0; i < monthResults.length; i++) {
    const r = monthResults[i]!;
    if (r.status === 'fulfilled' && r.value && r.value.length > 0) {
      consecutiveMiss = 0;
      for (const row of r.value) {
        const dateROC = row[0];
        const isoDate = rocDateToIso(dateROC);
        if (!isoDate) continue;
        if (!/^\d{3}\/\d{2}\/\d{2}$/.test(dateROC)) continue;
        out.push({
          date: isoDate,
          open: parseNum(row[3]),
          high: parseNum(row[4]),
          low: parseNum(row[5]),
          close: parseNum(row[6]),
          volume: parseNum(row[1]),
        });
      }
    } else {
      consecutiveMiss++;
      if (consecutiveMiss >= MAX_CONSECUTIVE_MISS) break;
    }
  }

  // 去重 + 排序 + 依範圍切片
  const unique = Array.from(new Map(out.map((p) => [p.date, p])).values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const limit: Record<ChartRange, number> = { '1M': 30, '3M': 90, '1Y': 365, '5Y': 260 * 5 };
  return unique.slice(-limit[range]);
}

/** 抓 TPEx 月 K 線（與 TWSE 介面類似但 date 格式不同） */
export async function fetchTpexKLine(rawSymbol: string, range: ChartRange): Promise<PricePoint[]> {
  const months = RANGE_TO_MONTHS[range];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setMonth(today.getMonth() - months);

  const out: PricePoint[] = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  let consecutiveMiss = 0;
  const MAX_CONSECUTIVE_MISS = 2;

  while (cursor <= today) {
    const dateStr = `${cursor.getFullYear()}/${String(cursor.getMonth() + 1).padStart(2, '0')}/01`;
    const url = `${TPEX_KLINE_URL}?date=${dateStr}&code=${encodeURIComponent(rawSymbol)}&response=json`;
    try {
      const json = (await fetchJson(url)) as { tables?: Array<{ data?: string[][] }> };
      const data = json?.tables?.[0]?.data;
      if (Array.isArray(data) && data.length > 0) {
        consecutiveMiss = 0;
        for (const row of data) {
          const dateROC = row[0];
          const isoDate = rocDateToIso(dateROC);
          if (!isoDate) continue;
          if (!/^\d{3}\/\d{2}\/\d{2}$/.test(dateROC)) continue;
          // TPEx 欄位：日期, 成交張數, 成交仟元, 開, 高, 低, 收, 漲跌, 筆數
          out.push({
            date: isoDate,
            open: parseNum(row[3]),
            high: parseNum(row[4]),
            low: parseNum(row[5]),
            close: parseNum(row[6]),
            // TPEx 給的是「張」不是「股」，乘 1000 對齊
            volume: parseNum(row[1]) * 1000,
          });
        }
      } else {
        consecutiveMiss++;
        if (consecutiveMiss >= MAX_CONSECUTIVE_MISS) break;
      }
    } catch (e) {
      console.warn(`[tpex] K-line ${dateStr} for ${rawSymbol} failed:`, e instanceof Error ? e.message : e);
      break;
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const unique = Array.from(new Map(out.map((p) => [p.date, p])).values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const limit: Record<ChartRange, number> = { '1M': 30, '3M': 90, '1Y': 365, '5Y': 260 * 5 };
  return unique.slice(-limit[range]);
}

// ========== 3. 估值月報（TWSE BWIBBU，限上市） ==========

export interface TwseValuation {
  pe: number; // 本益比
  pb: number; // 股價淨值比
  dividendYield: number; // 殖利率 (%)
  dividendYear: number; // 股利所屬年度（西元）
  fiscalPeriod: string; // 財報年/季，如 '115/1'
}

/**
 * 抓 TWSE 上市股的最新估值（PE / PB / 殖利率）
 *
 * GET /exchangeReport/BWIBBU?response=json&date=YYYYMMDD&stockNo=XXXX
 *
 * 回傳最近一個交易日的值（通常月報每天都有新 row）。
 */
export async function fetchTwseValuation(rawSymbol: string): Promise<TwseValuation | null> {
  // 從最近 7 天倒回找（避開假日）
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const url = `${TWSE_VALUATION_URL}?response=json&date=${dateStr}&stockNo=${encodeURIComponent(rawSymbol)}`;
    try {
      const json = (await fetchJson(url)) as {
        stat?: string;
        data?: string[][];
      };
      if (json?.stat === 'OK' && Array.isArray(json.data) && json.data.length > 0) {
        // 取最新一筆
        const last = json.data[json.data.length - 1];
        // fields: ["日期", "殖利率(%)", "股利年度", "本益比", "股價淨值比", "財報年/季"]
        const pe = parseNum(last[3]);
        const pb = parseNum(last[4]);
        const dy = parseNum(last[1]);
        const dyYearROC = parseInt(last[2] ?? '0', 10); // 民國年（如 114）
        const fiscal = last[5] ?? '';
        return {
          pe: pe || 0,
          pb: pb || 0,
          dividendYield: dy || 0,
          dividendYear: dyYearROC > 0 ? dyYearROC + 1911 : 0,
          fiscalPeriod: fiscal,
        };
      }
    } catch (e) {
      // 該日沒有就繼續往前找
      continue;
    }
  }
  return null;
}

// ========== 工具 ==========

/** 把民國日期 '115/07/01' 轉成 ISO '2026-07-01' */
function rocDateToIso(roc: string): string | null {
  const m = roc.match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]) + 1911;
  const month = m[2];
  const day = m[3];
  return `${year}-${month}-${day}`;
}

/** 解析含千分位的數字字串 */
function parseNum(s: string | undefined): number {
  if (s == null) return 0;
  const cleaned = s.replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

/** 判斷 symbol 是否為台股純數字代號（4-6 位數字） */
export function isTaiwanSymbol(symbol: string): boolean {
  return /^\d{4,6}$/.test(symbol);
}