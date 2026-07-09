const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();

  // LIGHT 模式 + 預設系統 (模擬 paper)
  const ctxLight = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  });
  const pL = await ctxLight.newPage();
  await pL.goto('http://localhost:3087/', { waitUntil: 'networkidle' });
  await pL.waitForTimeout(1000);
  await pL.screenshot({ path: 'C:/Users/user/Desktop/t-light-home.png' });
  console.log('home light saved');

  // 查 2330
  const input = await pL.locator('input[aria-label="股票搜尋"]');
  await input.fill('2330');
  await input.press('Enter');
  await pL.waitForTimeout(15000); // 等所有 API + AI 完成
  await pL.screenshot({ path: 'C:/Users/user/Desktop/t-light-2330.png' });
  await pL.screenshot({ path: 'C:/Users/user/Desktop/t-light-2330-full.png', fullPage: true });
  console.log('2330 light saved');

  // 點燈泡切到 dark
  const toggle = await pL.locator('button[aria-label*="切換"]').first();
  await toggle.click();
  await pL.waitForTimeout(500);
  await pL.screenshot({ path: 'C:/Users/user/Desktop/t-dark-2330.png' });
  await pL.screenshot({ path: 'C:/Users/user/Desktop/t-dark-2330-full.png', fullPage: true });
  console.log('2330 dark saved');

  await ctxLight.close();

  // 系統 dark 模式 + 無 localStorage（模擬首次訪問的暗色系統用戶）
  const ctxDark = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  const pD = await ctxDark.newPage();
  await pD.goto('http://localhost:3087/', { waitUntil: 'networkidle' });
  await pD.waitForTimeout(1000);
  await pD.screenshot({ path: 'C:/Users/user/Desktop/t-dark-home.png' });
  console.log('home dark saved');
  await ctxDark.close();

  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
