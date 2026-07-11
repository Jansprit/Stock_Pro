/**
 * v4 — 用 mock route 直接 fulfill，tooltip 驗證
 */
const { chromium } = require('playwright');

(async () => {
  // 先抓所有 API 資料（用 Node fetch 從外部打 server）
  const sym = 'AAPL';
  const [overview, financials, chart, news, competitors] = await Promise.all([
    fetch(`http://localhost:3087/api/stock/${sym}`).then(r => r.json()),
    fetch(`http://localhost:3087/api/financials/${sym}?maxYear=5`).then(r => r.json()),
    fetch(`http://localhost:3087/api/chart/${sym}?range=1Y`).then(r => r.json()),
    fetch(`http://localhost:3087/api/news/${sym}`).then(r => r.json()),
    fetch(`http://localhost:3087/api/competitors/${sym}`).then(r => r.json()),
  ]);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 }, colorScheme: 'dark' });
  await ctx.addInitScript(() => {
    localStorage.setItem('stock-pro:theme', 'dark');
  });
  const page = await ctx.newPage();

  // Mock 所有 API（避免 400 + AI 60s）
  await page.route('**/api/**', async (route) => {
    const u = route.request().url();
    if (u.includes('/api/stock/AAPL')) await route.fulfill({ json: overview });
    else if (u.includes('/api/financials/AAPL')) await route.fulfill({ json: financials });
    else if (u.includes('/api/chart/AAPL')) await route.fulfill({ json: chart });
    else if (u.includes('/api/news/AAPL')) await route.fulfill({ json: news });
    else if (u.includes('/api/competitors/AAPL')) await route.fulfill({ json: competitors });
    else if (u.includes('/api/ai-report')) {
      // Skip AI report
      await route.fulfill({ json: { report: null } });
    } else {
      await route.continue();
    }
  });

  await page.goto('http://localhost:3087/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 點 AAPL 快捷鍵
  await page.locator('button:has-text("AAPL")').first().click({ timeout: 5000 });
  console.log('clicked AAPL');

  // 等 bars 出現
  let bars = 0;
  for (let s = 0; s < 20; s++) {
    await page.waitForTimeout(1000);
    bars = await page.locator('.recharts-bar-rectangle').count();
    if (bars > 0) {
      console.log(`bars appeared at T=${s}s: ${bars}`);
      break;
    }
  }
  if (bars === 0) {
    console.log('FAIL: no bars');
    await page.screenshot({ path: 'C:/Users/user/Desktop/verify-fail.png' });
    process.exit(1);
  }

  await page.waitForTimeout(2000);

  // 滾動
  await page.evaluate(() => {
    const h3 = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('財務趨勢圖'));
    if (h3) h3.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(800);

  // hover bar
  const barEl = await page.locator('.recharts-bar-rectangle').first().boundingBox();
  if (barEl) {
    await page.mouse.move(barEl.x + barEl.width / 2, barEl.y + barEl.height / 2, { steps: 8 });
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: 'C:/Users/user/Desktop/verify-tooltip-hover.png' });
  console.log('tooltip screenshot saved');

  // 抓 tooltip 顏色
  const tooltipState = await page.evaluate(() => {
    const wrap = document.querySelector('.recharts-tooltip-wrapper');
    if (!wrap) return { found: false };
    const content = wrap.querySelector('.recharts-default-tooltip');
    if (!content) return { found: true, content: false, html: wrap.outerHTML.substring(0, 600) };
    const label = content.querySelector('.recharts-tooltip-label');
    const item = content.querySelector('.recharts-tooltip-item');
    const out = { found: true, content: true };
    if (label) {
      out.label = {
        text: label.textContent,
        color: window.getComputedStyle(label).color,
        fill: window.getComputedStyle(label).fill,
        visibility: window.getComputedStyle(label).visibility,
      };
    }
    if (item) {
      out.item = {
        text: item.textContent,
        color: window.getComputedStyle(item).color,
        fill: window.getComputedStyle(item).fill,
      };
    }
    return out;
  });
  console.log('tooltip:', JSON.stringify(tooltipState, null, 2));

  function isBlack(val) {
    if (!val) return false;
    const m = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return false;
    return parseInt(m[1]) < 50 && parseInt(m[2]) < 50 && parseInt(m[3]) < 50;
  }
  function isLight(val) {
    if (!val) return false;
    const m = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return false;
    return parseInt(m[1]) > 180 && parseInt(m[2]) > 180 && parseInt(m[3]) > 180;
  }

  const all = [tooltipState.label, tooltipState.item].filter(Boolean);
  const anyBlack = all.some(v => isBlack(v.color) || isBlack(v.fill));
  const anyLight = all.some(v => isLight(v.color) || isLight(v.fill));

  if (anyBlack) {
    console.log('FAIL: tooltip BLACK');
    process.exit(2);
  } else if (anyLight) {
    console.log('PASS: tooltip text light (dark theme OK)');
    process.exit(0);
  } else {
    console.log('UNCERTAIN');
    process.exit(3);
  }
})().catch(e => { console.error(e); process.exit(99); });
