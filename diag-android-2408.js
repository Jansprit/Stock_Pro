// 跑 2408.TW Android 端對端 + 監控 SSE
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.114 Mobile Safari/537.36',
    locale: 'zh-TW',
  });
  const page = await ctx.newPage();

  const events = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/ai-report')) {
      events.push({ t: Date.now(), type: 'ai-report-resp', status: res.status() });
    }
  });
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('ai-report') || t.includes('SSE') || t.includes('twse') || t.includes('competitor')) {
      events.push({ t: Date.now(), type: 'console', text: t.slice(0, 200) });
    }
  });
  page.on('pageerror', err => events.push({ t: Date.now(), type: 'pageerror', msg: err.message }));

  console.log('=== Android 2408.TW 查詢 ===');
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('input').first().fill('2408.TW');
  await page.locator('input').first().press('Enter');
  const t0 = Date.now();

  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(5000);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const state = await page.evaluate(() => {
      const body = document.body.innerText;
      const aiSection = (body.match(/AI 分析[^\n]{0,40}/) || [null])[0];
      const aiError = (body.match(/(AI 分析失敗|AI 分析暫時無法取得|手機網路|連線中斷|超過 \d+ 秒|Failed to fetch)/) || [null])[0];
      const aiDone = !!body.match(/綜合評分/) && !aiError;
      const newsSection = !!body.match(/最新新聞|新聞摘要/);
      const newsCount = (body.match(/[\d]+ 則新聞/) || [null])[0];
      return { aiSection, aiError, aiDone, newsSection, newsCount, bodyLen: body.length };
    });
    console.log(`t=${elapsed}s:`, JSON.stringify(state));
    if (state.aiDone) { console.log('  ✓ AI 報告完整 render'); break; }
  }

  console.log('\n=== events ===');
  events.forEach(e => console.log('  ' + JSON.stringify(e)));
  await browser.close();
})();
