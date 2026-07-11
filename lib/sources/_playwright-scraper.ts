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
    return await page.content();
  } finally {
    await ctx.close();
  }
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
