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
import { fetchWithPlaywright as _fetchHtml, fetchAndParsePeerRows as _fetchAndParsePeerRows } from './_playwright-scraper';

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
  /** 從 Goodinfo peers table 抓出的即時指標 */
  price?: number;
  pe?: number;
  pb?: number;
}

/**
 * 從 Goodinfo peers HTML 抓取 table header（用來對齊 cell index → column name）
 *
 * HTML 結構：<thead>...<th>代號</th><th>名稱</th>...<th>PER</th><th>PBR</th></thead>
 * 但 Goodinfo 用 colspan 結構複雜，這裡簡化：找第一個含「代號」th 起算到 「10年走勢圖」止所有 th。
 */
export function extractPeersHeader(html: string): string[] {
  // 找 main table（從 sidebar end 後開始）
  const sidebarEnd = html.indexOf('個股概況</a>');
  const mainHtml = sidebarEnd > 0 ? html.substring(sidebarEnd) : html;
  // 找 thead → 內含 PER/PBR 那一段
  const theadRe = /<thead[\s\S]*?<\/thead>/gi;
  const headers: string[] = [];
  let tm;
  const seen = new Set<string>();
  while ((tm = theadRe.exec(mainHtml)) !== null) {
    const inner = tm[0];
    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let thm;
    while ((thm = thRe.exec(inner)) !== null) {
      const h = stripTags(thm[1]).trim();
      if (h && !seen.has(h)) {
        seen.add(h);
        headers.push(h);
      }
    }
    // 取到第一個完整 thead（含 PER、PBR）就停
    if (headers.includes('PER') || headers.includes('pe')) break;
  }
  return headers;
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
  // Goodinfo 個股頁只有「地址」(非「總公司地址」)
  out.address = grab('地址');
  // 「主要業務」是 Goodinfo 標準 label（不是「主要產品」）
  // 注意 td 內可能含 <p>、<span> 等子元素，要容許
  const grabCellHtml = (label: string): string | undefined => {
    const re = new RegExp(
      `<th[^>]*>[\\s\\S]*?${label}[\\s\\S]*?</th>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)</td>`,
      'i',
    );
    const m = html.match(re);
    return m ? stripTags(m[1]).trim() : undefined;
  };
  out.mainProducts = grabCellHtml('主要業務') ?? grabCellHtml('主要產品') ?? grabCellHtml('經營業務');
  // 上市日期 → Goodinfo 用「掛牌日」
  // Goodinfo 的值常夾帶 &nbsp;[30.2年] 雜訊，清理掉
  const rawIpo = grab('掛牌日') ?? grab('上市日期') ?? grab('上櫃日期');
  if (rawIpo) {
    const cleaned = rawIpo
      .replace(/&nbsp;/gi, '')
      .replace(/\s*\[[\d.]+[年月日]+\]\s*$/, '')  // 結尾的「[30.2年]」
      .replace(/\s+/g, ' ')
      .trim();
    out.ipoDate = cleaned;
    out.listingDate = cleaned;
  }

  // 員工人數：Goodinfo 沒直接給，但有「員工平均年薪」(非主管職員工) 可能被誤抓成 11 萬
  // 我們跳過這欄位（抓不到也不影響）
  out.employeeCount = undefined;

  const capitalText = grab('實收資本額') ?? grab('資本額');
  if (capitalText) {
    const million = parseFloat(capitalText.replace(/[^\d.]/g, ''));
    if (!isNaN(million)) {
      if (capitalText.includes('億')) out.capitalPaidIn = Math.round(million * 1e8);
      else if (capitalText.includes('萬')) out.capitalPaidIn = Math.round(million * 1e4);
      else out.capitalPaidIn = Math.round(million);
    }
  }

  // 統一編號（少見但有就看能不能抓到）
  out.taxId = grab('統一編號');

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
    `goodinfo:peers:v3:${industryName}:${market}`,  // ← bump v3: force fresh Playwright DOM extraction after server restart
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
      // 用 Playwright 重新開瀏覽器抓 peer row（更可靠 — 含 PE/PB/price）
      const peerRows = await _fetchAndParsePeerRows(url);
      const peers: GoodinfoPeer[] = [];
      let rank = 1;
      for (const row of peerRows) {
        if (/(個股概況|基本概況|技術分析|籌碼分析|股東資訊|財報|財務報表|每月營收|產品營收|其他)/.test(row.name)) continue;
        if (row.name.length < 2 || row.name.length > 10) continue;
        peers.push({
          rawSymbol: row.rawSymbol,
          symbol: `${row.rawSymbol}.TW`,
          name: row.name,
          rank: rank++,
          price: row.price,
          pe: row.pe,
          pb: row.pb,
        });
      }
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
export function parsePeersTable(html: string, _industry: string, headers: string[] = []): GoodinfoPeer[] {
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
  // 同時順著 row 走，把每個 cell 抓下來：col0=排名, col1=代碼, col2=名稱,
  // 之後第 PER/PBR 在哪一列要依 header 動態決定 → 先抓所有 cell 列表
  const re1 = /StockDetail\.asp\?STOCK_ID=(\d{4,6})(?:[^>]*>)([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(mainHtml)) !== null) {
    const code = m[1];
    const nameMatch = m[2].match(/[一-鿿㐀-䶿]{2,8}/);
    if (!nameMatch) continue;
    const name = nameMatch[0].trim();
    if (name.length < 2 || name.length > 10) continue;
    if (/(個股概況|基本概況|技術分析|籌碼分析|股東資訊|財報|財務報表|每月營收|產品營收|其他)/.test(name)) {
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);

    // 從 stock code 的位置往後找最近的一個 </tr>，抓這 row 內所有 <td>
    // row 從 anchor 後第一個 <tr> 起算（避免抓到前一個 row 殘留或 sidebar）
    const codeIdx = m.index;
    const rowStart = mainHtml.indexOf('<tr', codeIdx);
    const rowEnd = mainHtml.indexOf('</tr>', codeIdx);
    const peersRow: { pe?: number; pb?: number; price?: number } = {};
    if (rowEnd > rowStart && rowStart >= 0) {
      const rowHtml = mainHtml.substring(rowStart, rowEnd);
      // 直接從 row HTML 抓 PER / PBR 連結的值（這些 anchor 用 RPT_CAT 區分）
      // 例：<a class="link_black" href="...&RPT_CAT=PER&...">32.5</a>
      const peMatch = rowHtml.match(/RPT_CAT=PER[^>]*>([0-9.]+)</i)
        ?? rowHtml.match(/RPT_CAT=PER[^>]*>([\s\S]*?)<\/a>/);
      const pbMatch = rowHtml.match(/RPT_CAT=PBR[^>]*>([0-9.]+)</i)
        ?? rowHtml.match(/RPT_CAT=PBR[^>]*>([\s\S]*?)<\/a>/);
      // 取即時股價（成交 column 的 anchor 內容，e.g. "2415"）
      // 此行第一個 nonzero 正股價通常在 cells[5]（成交）
      // 改從 cell text 抓
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const cells: string[] = [];
      let cm;
      while ((cm = cellRe.exec(rowHtml)) !== null) {
        cells.push(stripTags(cm[1]).trim());
      }
      // cells[5] = 成交價格（ex: 2415 或 70.1）
      const priceText = cells[5] ?? '';
      const peFromAnchor = peMatch ? parseFloat((peMatch[1] ?? '').replace(/[,+]/g, '')) : NaN;
      const pbFromAnchor = pbMatch ? parseFloat((pbMatch[1] ?? '').replace(/[,+]/g, '')) : NaN;
      const priceFromCell = parseFloat(priceText.replace(/[,+]/g, ''));
      if (Number.isFinite(peFromAnchor)) peersRow.pe = peFromAnchor;
      if (Number.isFinite(pbFromAnchor)) peersRow.pb = pbFromAnchor;
      if (Number.isFinite(priceFromCell) && priceFromCell > 0) peersRow.price = priceFromCell;
    }

    out.push({
      rawSymbol: code,
      symbol: `${code}.TW`,
      name,
      rank: out.length + 1,
      ...peersRow,
    });
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
    // 對 link 做 HTML entity 解碼（&amp; → & 等），避免瀏覽器把 `&amp;` 當字面字元，
    // 造成 query string 解析錯誤（例如 SUBJECT= 變成 SUBJECT&amp;…）
    const link = decodeHtmlEntities(m[1]);
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
        link: decodeHtmlEntities(`https://goodinfo.tw${m[1]}`),
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

/**
 * 解碼 HTML entities（用於 URL，stripTags 內含 strip 空白，不適合 URL）。
 * 重點處理：&amp; → &，這是 Goodinfo 公告連結最常見的編碼錯誤。
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/* ============== 健康檢查 ============== */

export function isAvailable(): boolean {
  return true; // Goodinfo 不需要 API key
}

