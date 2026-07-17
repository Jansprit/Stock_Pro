// 驗證 1Y 線圖 bug 修法
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  console.log('=== 連到 localhost:3000 ===');
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('=== 輸入 2330.TW 並送出 ===');
  await page.locator('input').first().fill('2330.TW');
  await page.locator('input').first().press('Enter');

  // 1Y 是預設值，不點任何按鈕
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    const state = await page.evaluate(() => {
      const body = document.body.innerText;
      const chartCard = !!body.match(/股價走勢/);
      const activeRange = (body.match(/(\d+[MY])\s*1M|3M|1Y|5M/));
      const rechartsCount = document.querySelectorAll('.recharts-wrapper').length;
      // 找 PriceChart 區塊的 chart 數
      const priceChart = !!document.querySelector('.recharts-area');
      const hasDataPoints = document.querySelectorAll('.recharts-dot, .recharts-line-curve').length;
      return { chartCard, rechartsCount, priceChart, hasDataPoints };
    });
    console.log(`t=${(i+1)*5}s:`, JSON.stringify(state));
    if (state.priceChart) {
      console.log('  ✓ PriceChart 線圖已 render');
      break;
    }
  }

  await page.screenshot({ path: 'D:/Claude Code Work Space/Stock_Pro/diag-1y-fixed.png', fullPage: true });
  console.log('截圖: diag-1y-fixed.png');
  await browser.close();
})();
