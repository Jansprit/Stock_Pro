/**
 * Goodinfo (台灣股市資訊網) 擷取器
 *
 * 用途：
 *   - 取得台股個股基本資料補充（董事長、員工數、上市日期、發行股數…）
 *   - 取得同業名單（依 TWSE 產業分類，半導體業、化學工業…）
 *   - 取得個股頁內嵌新聞（Goodinfo 個股頁右側「新聞及公告」區塊）
 *
 * 免登入、不需要 cookie。網頁是 ASP 舊技術，需：
 *   1. setExtraHTTPHeaders('Accept-Language: zh-TW')
 *   2. 等待頁面渲染後用 regex 解析（不用 cheerio 以保持 dependency 簡潔）
 *
 * 注意：Goodinfo 對大量爬取會擋 IP（Cloudflare），個股頁有 ~3-5 req/min 限制。
 * 快取策略：24h（公司基本資料）/ 12h（同業名單）/ 6h（個股新聞）
 *
 * 重要限制：
 *   - 部分內容需要登入網站會員（Goodinfo 內部明確標示「會員」連結），未登入看到的會員 sheet 內容會是空白。
 *   - 我們只用「公開區塊」：股票基本資料、產業同業、內嵌新聞。
 */

import { cached } from '../cache';
import { fetchWithPlaywright as _fetchHtml } from './_playwright-scraper';

/* ============== 型別 ============== */

export interface GoodinfoCompanyInfo {
  /** 公開發行日期 */
  ipoDate?: string;
  /** 董事長 */
  chairman?: string;
  /** 總經理 */
  president?: string;
  /** 發言人 */
  spokesperson?: string;
  /** 總公司地址 */
  address?: string;
  /** 主要產品 */
  mainProducts?: string;
  /** 員工人數 */
  employeeCount?: number;
  /** 實收資本額（元） */
  capitalPaidIn?: number;
  /** 上市 / 上櫃日期 */
  listingDate?: string;
  /** 統一編號 */
  taxId?: string;
  /** TWSE 產業分類 */
  twseIndustry?: string;
  /** 資料來源 URL */
  sourceUrl: string;
}

export interface GoodinfoPeer {
  /** 4-6 位純數字代號（無後綴） */
  rawSymbol: string;
  /** 含 .TW/.TWO 的完整代號 */
  symbol: string;
  /** 中文公司名稱 */
  name: string;
  /** 同業排名（Goodinfo 表內的位置） */
  rank?: number;
}

export interface GoodinfoNewsItem {
  title: string;
  link: string;
  source: string;      // 「鉅亨網」「ETtoday」「公告」...
  publishedAt?: string; // 解析到的時間字串（原始格式）
}

interface GoodinfoPeerCache {
  twseIndustry: string;
  peers: GoodinfoPeer[];
  fetchedAt: string;
}

/* ============== 工具：把 2351.TW → 2351 → 完整 URL ============== */

function toRawSymbol(symbol: string): string {
  return symbol.replace(/\.(TW|TWO)$/i, '');
}

function isTaiwanStock(symbol: string): boolean {
  return /\.(TW|TWO)$/i.test(symbol);
}

/* ============== 公司基本資料 ============== */

/**
 * 從 Goodinfo 個股頁拿公開基本資料（董事長、IPO 日期、總公司地址等）
 *
 * 個股頁 URL: https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID=2351
 *
 * 內容區塊在頁面的左側/右側 table，標頭為「股票代號」「公司名稱」「董事長」...
 * 我們用 regex 解析 table row，不需要完整 HTML parser。
 */
export async function fetchGoodinfoCompany(
  symbol: string,
): Promise<GoodinfoCompanyInfo | null> {
  if (!isTaiwanStock(symbol)) return null;
  const raw = toRawSymbol(symbol);
  const url = `https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID=${raw}`;

  return cached(`goodinfo:company:${raw}`, 24 * 60 * 60 * 1000, async () => {
    const html = await _fetchHtml(url, {
      headers: {
        'Accept-Language': 'zh-TW,zh;q=0.9',
        Referer: 'https://goodinfo.tw/',
      },
    });
    return parseCompanyPage(html, url, raw);
  });
}

function parseCompanyPage(html: string, url: string, raw: string): GoodinfoCompanyInfo | null {
  const out: GoodinfoCompanyInfo = { sourceUrl: url };

  // Goodinfo 基本資料區塊在「個股概況」右側 table 內，
  // 結構：<tr><th class="bg_h2">欄位名</th><td>值</td></tr>
  // 我們抓這個 table 內所有 key-value pair
  const grabTable = (label: string): string | undefined => {
    // 模式 1：<th>...label...</th>...<td ...>value</td>
    // <th> 可能含 <nobr> 等內嵌 tag，用 [\s\S]*? 容許
    const re = new RegExp(
      `<th[^>]*>[\\s\\S]*?${label}[\\s\\S]*?</th>[\\s\\S]*?<td[^>]*>([^<]+?)</td>`,
      'i',
    );
    const m = html.match(re);
    return m ? m[1].trim() : undefined;
  };

  // Fallback：舊版「label: value」緊鄰格式
  const grabInline = (label: string): string | undefined => {
    const re = new RegExp(`${label}\\s*[：:]\\s*([^<>\\n\\r]+?)(?:\\s*<|\\n|$)`, 'i');
    const m = html.match(re);
    return m ? stripTags(m[1]).trim() : undefined;
  };

  const grab = (label: string) => grabTable(label) ?? grabInline(label);

  out.chairman = grab('董事長');
  out.president = grab('總經理');
  out.spokesperson = grab('發言人');
  out.address = grab('總公司地址') ?? grab('公司地址');
  out.mainProducts = grab('主要產品') ?? grab('經營業務');
  out.taxId = grab('統一編號');

  const ipoDate = grab('上市日期') ?? grab('上櫃日期');
  if (ipoDate) out.ipoDate = ipoDate;
  out.listingDate = out.ipoDate;

  const employeeText = grab('員工人數') ?? grab('員工總人數');
  if (employeeText) {
    const n = parseInt(employeeText.replace(/[^\d]/g, ''), 10);
    if (!isNaN(n)) out.employeeCount = n;
  }

  const capitalText = grab('實收資本額') ?? grab('資本額');
  if (capitalText) {
    const million = parseFloat(capitalText.replace(/[^\d.]/g, ''));
    if (!isNaN(million)) {
      if (capitalText.includes('億')) out.capitalPaidIn = Math.round(million * 1e8);
      else if (capitalText.includes('萬')) out.capitalPaidIn = Math.round(million * 1e4);
      else out.capitalPaidIn = Math.round(million);
    }
  }

  // 產業別：用 table-aware regex 抓「產業別」label 後第一個 td 中的值（無論是 text 還是 <a> 內文）
  // 注意：<th> 可能含 <nobr> 等內嵌 tag，用 [\s\S]*? 容許
  const industryRe = /<th[^>]*>[\s\S]*?產業別[\s\S]*?<\/th>[\s\S]*?<td[^>]*>(?:<a[^>]*>)?([^<]+?)(?:<\/a>)?\s*<\/td>/i;
  const industryMatch = html.match(industryRe);
  if (industryMatch) {
    out.twseIndustry = stripTags(industryMatch[1]).trim();
  }

  if (!out.chairman && !out.ipoDate && !out.twseIndustry && !out.taxId) return null;
  void raw;
  return out;
}

/* ============== 同業名單 ============== */

/**
 * 從 Goodinfo 同類股列表拿同業（半導體業、其他電子業...）
 *
 * URL: https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=全部&INDUSTRY_CAT=半導體業
 *
 * 回傳 200+ 筆 4-碼代號 + 中文名。我們從 HTML table 解析出 (stock, name) 對。
 */
export async function fetchGoodinfoPeersByIndustry(
  industryName: string,
  market: '上市' | '上櫃' | '全部' = '全部',
): Promise<GoodinfoPeerCache> {
  return cached(
    `goodinfo:peers:${industryName}:${market}`,
    12 * 60 * 60 * 1000,
    async () => {
      const params = new URLSearchParams({
        MARKET_CAT: market,
        INDUSTRY_CAT: industryName,
      });
      const url = `https://goodinfo.tw/tw/StockList.asp?${params.toString()}`;

      const html = await _fetchHtml(url, {
        headers: {
          'Accept-Language': 'zh-TW,zh;q=0.9',
          Referer: 'https://goodinfo.tw/',
        },
      });
      const peers = parsePeersTable(html, industryName);
      return { twseIndustry: industryName, peers, fetchedAt: new Date().toISOString() };
    },
  );
}

/**
 * 透過 Goodinfo 個股頁拿到該股的 TWSE 產業分類 → 取得同業名單
 *
 * 流程：
 * 1. fetchGoodinfoCompany(symbol) 拿到 twseIndustry
 * 2. 若有 twseIndustry，呼叫 fetchGoodinfoPeersByIndustry(twseIndustry) 拿完整同業
 *
 * 若 Goodinfo 沒給產業，回傳空 peers[]。
 */
export async function fetchGoodinfoPeersForSymbol(
  symbol: string,
  limit = 8,
): Promise<{ twseIndustry: string | null; peers: GoodinfoPeer[] }> {
  const company = await fetchGoodinfoCompany(symbol);
  if (!company?.twseIndustry) {
    return { twseIndustry: null, peers: [] };
  }
  const cache = await fetchGoodinfoPeersByIndustry(company.twseIndustry);
  // 過濾掉自己
  const rawSelf = toRawSymbol(symbol);
  const peers = cache.peers.filter((p) => p.rawSymbol !== rawSelf);
  void limit;
  return { twseIndustry: company.twseIndustry, peers };
}

/**
 * 解析 Goodinfo 同類股 table。
 * HTML table row 結構（典型）:
 *   <tr><td>1</td><td><a href="StockDetail.asp?STOCK_ID=2330">2330</a></td><td>台積電</td></tr>
 *
 * 我們用寬鬆 regex 抓「4-6 位數字代號」+ 「中文公司名」。
 */
export function parsePeersTable(html: string, _industry: string): GoodinfoPeer[] {
  const out: GoodinfoPeer[] = [];
  const seen = new Set<string>();

  // Goodinfo 同業列表頁結構（半導體業實測）：
  //   - HTML 986KB，其中前 ~109KB 是 header + sidebar
  //   - 之後才是真正的同業 table（雖然 id 沒固定）
  //   - 整頁有 414 個 StockDetail.asp 連結，但前段都是 sidebar 引用
  // 解法：用 sidebar 結束位置切掉前段
  const sidebarEnd = html.indexOf('個股概況</a>');
  const mainHtml = sidebarEnd > 0 ? html.substring(sidebarEnd) : html;

  // 嘗試 1：StockDetail.asp?STOCK_ID=XXXX + 之後 anchor 文字
  const re1 = /StockDetail\.asp\?STOCK_ID=(\d{4,6})(?:[^>]*>)([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(mainHtml)) !== null) {
    const code = m[1];
    const nameMatch = m[2].match(/[一-鿿㐀-䶿]{2,8}/);
    if (!nameMatch) continue;
    const name = nameMatch[0].trim();
    if (name.length < 2 || name.length > 10) continue;
    // 排除 sidebar 與 section header 字眼
    if (/(個股概況|基本概況|技術分析|籌碼分析|股東資訊|財報|財務報表|每月營收|產品營收|其他)/.test(name)) {
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ rawSymbol: code, symbol: `${code}.TW`, name, rank: out.length + 1 });
  }

  // 嘗試 2：fallback — tr 行內 4 碼數字 + 中文科
  if (out.length === 0) {
    const trRe = /<tr[^>]*>\s*<td[^>]*>\s*(\d{1,3})\s*<\/td>\s*<td[^>]*>\s*(\d{4,6})\s*<\/td>\s*<td[^>]*>([^<]{2,8})<\/td>/g;
    while ((m = trRe.exec(html)) !== null) {
      const code = m[2];
      const name = m[3].trim();
      if (seen.has(code)) continue;
      seen.add(code);
      out.push({ rawSymbol: code, symbol: `${code}.TW`, name, rank: out.length + 1 });
    }
  }

  return out;
}

/* ============== 個股新聞（內嵌區塊） ============== */

/**
 * 從 Goodinfo 個股頁的「新聞及公告」右側欄拿即時新聞。
 *
 * HTML 結構（典型）：
 *   <div id="stock_news">
 *     <ul>
 *       <li>
 *         <a href="...">標題</a>
 *         <span class="src">鉅亨網</span>
 *         <span>2025/07/05 12:34</span>
 *       </li>
 *     </ul>
 *   </div>
 */
export async function fetchGoodinfoNews(
  symbol: string,
  limit = 10,
): Promise<GoodinfoNewsItem[]> {
  if (!isTaiwanStock(symbol)) return [];
  const raw = toRawSymbol(symbol);
  const url = `https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID=${raw}`;

  return cached(`goodinfo:news:${raw}`, 6 * 60 * 60 * 1000, async () => {
    const html = await _fetchHtml(url, {
      headers: {
        'Accept-Language': 'zh-TW,zh;q=0.9',
        Referer: 'https://goodinfo.tw/',
      },
    });
    return parseNewsBlock(html, limit);
  });
}

function parseNewsBlock(html: string, limit: number): GoodinfoNewsItem[] {
  const out: GoodinfoNewsItem[] = [];
  // Goodinfo 個股頁「新聞及公告」右側欄：抓所有 anchor + 後面文字
  // 通常長這樣：<a href="..." title="...">標題</a> 　鉅亨網<br>06/26 16:59
  const re =
    /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{6,80})<\/a>\s*(?:[(（]([^）)]+)[）)]\s*)?([^<]{0,30}?(?:\d{2,4}\/\d{1,2}\/\d{1,2}(?:\s\d{1,2}:\d{1,2})?))?/g;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(html)) !== null && count < limit) {
    const link = m[1];
    const title = stripTags(m[2]).trim();
    const source = (m[3] ?? '').trim();
    const published = (m[4] ?? '').trim();
    if (
      title.length < 8 ||
      title.length > 80 ||
      (source && !KNOWN_NEWS_SOURCES.test(source))
    ) {
      continue;
    }
    out.push({
      title,
      link: link.startsWith('http') ? link : `https://goodinfo.tw/tw/${link.replace(/^\.\//, '')}`,
      source: source || 'Goodinfo',
      publishedAt: published,
    });
    count++;
  }

  // fallback：如果上面 regex 沒抓到（DOM 結構有變），退而求其次抓所有長 anchor 文字
  if (out.length === 0) {
    const fallbackRe = /<a[^>]+href=["'](\/tw\/[^"']+)["'][^>]*>([^<]{8,80})<\/a>/g;
    while ((m = fallbackRe.exec(html)) !== null && out.length < limit) {
      out.push({
        title: stripTags(m[2]).trim(),
        link: `https://goodinfo.tw${m[1]}`,
        source: 'Goodinfo',
      });
    }
  }

  return out;
}

const KNOWN_NEWS_SOURCES = /鉅亨網|ETtoday|經濟日報|工商時報|MoneyDJ|中央社|Reuters|路透|時報資訊|Anue|CMoney|玩股|公開資訊|公告/;

/* ============== 通用：去掉 HTML tag ============== */

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/* ============== 健康檢查 ============== */

export function isAvailable(): boolean {
  return true; // Goodinfo 不需要 API key
}

