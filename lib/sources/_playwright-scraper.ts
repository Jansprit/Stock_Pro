/**
 * Playwright Scraper Singleton
 *
 * 用途：對 Goodinfo.tw 等「JS challenge」網站取得真正渲染後的 HTML。
 *
 * 為什麼需要：
 *   Goodinfo 對純 Node fetch 會回「JS challenge」（CLIENT_KEY cookie 計算）。
 *   用 Playwright 跑真的 chromium 才能拿到資料。
 *
 * 工作流程：
 *   1. 啟動時 lazy launch chromium（headless）
 *   2. 每個 fetch 用同一個瀏覽器 context（keep cookie、persistent）
 *   3. page.goto(url) → waitForLoadState('networkidle') → page.content() 回傳 HTML
 *   4. 內建 30s 超時
 *
 * 自管限制：
 *   - 需要 server 端有 chromium（已安裝於 PLAYWRIGHT_BROWSERS_PATH）
 *   - 不適合 Vercel serverless（無持久 Chromium）
 *   - 適合 self-host（自架、Docker、Railway 等）
 */

import { chromium, type Browser } from 'playwright';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browserPromise;
}

/**
 * 用 Playwright Chromium 訪問 url，回傳完整 page HTML
 *
 * @param url 完整 URL
 * @param options.waitUntil 預設 'networkidle'
 * @param options.timeout 預設 30000
 */
export async function fetchWithPlaywright(
  url: string,
  options: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    timeout?: number;
    headers?: Record<string, string>;
    ignoreSslErrors?: boolean;
  } = {},
): Promise<string> {
  const { waitUntil = 'domcontentloaded', timeout = 30_000, headers = {}, ignoreSslErrors = true } = options;
  // 重試 2 次：Playwright 偶爾在 page.content() 時丟「page is navigating」錯
  // （多 call 並發時，browser singleton 內部 navigation race condition）
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const browser = await getBrowser();
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'zh-TW',
      ignoreHTTPSErrors: ignoreSslErrors,
      extraHTTPHeaders: {
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        ...headers,
      },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    try {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil, timeout });
      // 等 GOODINFO JS 算完 CLIENT_KEY
      if (url.includes('goodinfo.tw')) {
        await page.waitForTimeout(2000);
        // 若 list 頁，等 AJAX 載入 peers
        if (url.includes('StockList')) {
          try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch { /* ignore */ }
          await page.waitForTimeout(2000);
        }
      }
      const content = await page.content();
      return content;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    } finally {
      await ctx.close();
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchWithPlaywright failed after 3 attempts');
}

/** 優雅關閉瀏覽器（測試 / shutdown 時用） */
export async function shutdownBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      // ignore
    }
    browserPromise = null;
  }
}

/**
 * 用 Playwright 訪問 peers URL 抓每 row 的 cells
 *
 * 注意：規則比較嚴，每 row 必須符合：
 *   - 至少有 17 個 td (固定欄位)
 *   - 第一 td 含 StockDetail.asp link
 */
export async function fetchAndParsePeerRows(
  url: string,
  options: { timeout?: number } = {},
): Promise<Array<{
  rawSymbol: string;
  name: string;
  pe?: number;
  pb?: number;
  price?: number;
  cells: string[];
}>> {
  const { timeout = 60_000 } = options;
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'zh-TW',
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch { /* ignore */ }
    await page.waitForTimeout(2000);

    return await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      // 找含「代號」「名稱」表頭的 table
      const tables = Array.from(document.querySelectorAll('table'));
      for (const t of tables) {
        const headers = Array.from(t.querySelectorAll('th')).map(h => h.textContent.trim());
        if (!(headers.includes('代號') && headers.includes('名稱'))) continue;
        // 找含 StockDetail link 的 tr
        const links = t.querySelectorAll('a[href*="STOCK_ID="]');
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          const m = href.match(/STOCK_ID=(\d{4,6})/);
          if (!m) continue;
          // Dedup by rawSymbol（同一頁面 sidebar/header/main table 都會有同一個 anchor）
          if (seen.has(m[1])) continue;
          const tr = link.closest('tr');
          if (!tr) continue;
          const tds = tr.querySelectorAll('td');
          if (tds.length < 10) continue; // 跳過 sidebar row
          seen.add(m[1]);
          const cells: string[] = [];
          tds.forEach(td => cells.push(td.textContent.trim().replace(/\s+/g, ' ')));
          // 抓 PER / PBR 從 RPT_CAT=PER/PBR 的 anchor
          let pe, pb, price;
          for (const td of tds) {
            // 找 RPT_CAT=PER 的 anchor
            const perAnchor = Array.from(td.querySelectorAll('a')).find(a => /RPT_CAT=PER/i.test(a.getAttribute('href') || ''));
            if (perAnchor) {
              const text = (perAnchor.textContent || '').replace(/[,+\s]/g, '');
              const n = parseFloat(text);
              if (!isNaN(n) && n > 0) pe = n;
            }
            const pbAnchor = Array.from(td.querySelectorAll('a')).find(a => /RPT_CAT=PBR/i.test(a.getAttribute('href') || ''));
            if (pbAnchor) {
              const text = (pbAnchor.textContent || '').replace(/[,+\s]/g, '');
              const n = parseFloat(text);
              if (!isNaN(n) && n > 0) pb = n;
            }
            // 即時價格：找 ShowK_Chart 的 anchor（cells[5] 的鏈結）
            const priceAnchor = Array.from(td.querySelectorAll('a')).find(a => /ShowK_Chart\.asp\?STOCK_ID=/.test(a.getAttribute('href') || '') && /CHT_CAT=DATE/.test(a.getAttribute('href') || ''));
            if (priceAnchor) {
              const text = (priceAnchor.textContent || '').replace(/[,+\s]/g, '');
              const n = parseFloat(text);
              if (!isNaN(n) && n > 0) price = n;
            }
          }
          out.push({
            rawSymbol: m[1],
            name: cells[1] || '',  // cells[1] = 名稱
            pe, pb, price,
            cells,
          });
        }
        if (out.length > 0) {
          // 印出前 3 筆供 debug
          console.log(`[parsePeers] ${out.length} rows from DOM, sample:`, out.slice(0, 3).map(o => `${o.rawSymbol}:pe=${o.pe},pb=${o.pb},price=${o.price}`).join(' | '));
        }
        return out;
      }
      return [];
    });
  } finally {
    await ctx.close();
  }
}
