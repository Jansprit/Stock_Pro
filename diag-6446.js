// 跑 6446.TW 第一次查詢，記錄 competitor 區塊更新時序
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
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('competitor') || t.includes('twse') || t.includes('ai-report') || t.includes('SSE')) {
      events.push({ t: Date.now(), type: 'console', text: t.slice(0, 200) });
    }
  });
  page.on('response', res => {
    if (res.url().includes('/api/')) {
      events.push({ t: Date.now(), type: 'api', status: res.status(), url: res.url().replace('http://localhost:3000', '') });
    }
  });

  console.log('=== 連到首頁 + 查 6446.TW（冷啟動）===');
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('input').first().fill('6446.TW');
  await page.locator('input').first().press('Enter');
  const t0 = Date.now();

  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(5000);
    const state = await page.evaluate(() => {
      const body = document.body.innerText;
      const competitorSection = body.match(/競爭對手[^\n]{0,50}/);
      const competitorTable = document.querySelectorAll('table tbody tr').length;
      const peerNames = Array.from(document.querySelectorAll('table tbody tr td')).slice(0, 10).map(td => td.innerText.trim()).filter(t => t.length > 0);
      return {
        competitorSection: competitorSection ? competitorSection[0] : null,
        competitorTable,
        peerSample: peerNames.slice(0, 5),
        bodyLen: body.length,
      };
    });
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(`t=${elapsed}s: table=${state.competitorTable} peers=${JSON.stringify(state.peerSample)}`);
  }

  console.log('\n=== events ===');
  events.forEach(e => console.log('  ' + JSON.stringify(e)));

  await browser.close();
})();
