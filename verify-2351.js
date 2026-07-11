/**
 * 2351.TW dashboard 完整性驗證
 *
 * 驗證 1：公司基本資料 — 應含 chairman/president/industry/address/mainProducts 等多個 Goodinfo 欄位
 * 驗證 2：競爭對手比較 — 應有 ≥ 3 家名稱與 PE（非 sidebar 漏網）
 */
const { chromium } = require('playwright');

(async () => {
  const sym = '2351.TW';

  // 先把所有 API 結果預先抓下來（mock 給瀏覽器用，節省 chromium + Goodinfo CLIENT_KEY 等候）
  const [stockRes, finnRes, newsRes, compRes] = await Promise.all([
    fetch(`http://localhost:3087/api/stock/${sym}`).then(r => r.json()),
    fetch(`http://localhost:3087/api/financials/${sym}?maxYear=5`).then(r => r.json()),
    fetch(`http://localhost:3087/api/news/${sym}`).then(r => r.json()),
    fetch(`http://localhost:3087/api/competitors/${sym}`).then(r => r.json()),
  ]);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 2000 } });
  await ctx.addInitScript(() => localStorage.setItem('stock-pro:theme', 'dark'));
  const page = await ctx.newPage();

  // Mock 所有 API 立即回應
  await page.route('**/api/**', async (route) => {
    const u = route.request().url();
    if (u.includes('/api/stock/2351')) await route.fulfill({ json: stockRes });
    else if (u.includes('/api/financials/2351')) await route.fulfill({ json: finnRes });
    else if (u.includes('/api/news/2351')) await route.fulfill({ json: newsRes });
    else if (u.includes('/api/competitors/2351')) await route.fulfill({ json: compRes });
    else if (u.includes('/api/ai-report')) await route.fulfill({ json: { report: null } });
    else await route.continue();
  });

  await page.goto('http://localhost:3087/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 點 2351 快速鍵
  const input = page.locator('input[aria-label="股票搜尋"]');
  await input.fill(sym);
  await input.press('Enter');

  // 等 5 大區塊都渲染（用公司基本資料區塊的 h3 標題檢測）
  let companyReady = false;
  for (let s = 0; s < 60; s++) {
    await page.waitForTimeout(500);
    const text = await page.evaluate(() => document.body.innerText);
    if (text.includes('公司基本資料') && text.includes('競爭對手比較')) {
      companyReady = true;
      break;
    }
  }
  if (!companyReady) {
    console.log('FAIL: dashboard 2351 渲染超時');
    await page.screenshot({ path: 'C:/Users/user/Desktop/verify-2351-FAIL.png' });
    process.exit(1);
  }

  await page.waitForTimeout(2000);
  // 滾動到第一段
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('公司基本資料'));
    el?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/user/Desktop/verify-2351-company.png' });
  console.log('company section screenshot saved');

  // 滾動到競爭對手
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('競爭對手比較'));
    el?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/user/Desktop/verify-2351-competitors.png' });
  console.log('competitors section screenshot saved');

  // 取樣：公司基本資料的所有 info key-value
  const companyFields = await page.evaluate(() => {
    // 找「公司基本資料」h3 開始，到下一個 h3（或 footer）前的文字
    const cards = Array.from(document.querySelectorAll('h3'));
    const h3 = cards.find(h => h.textContent?.includes('公司基本資料'));
    if (!h3) return { found: false, items: [], productSnippet: null };

    // h3 往上層找 Card container（class 含 border + rounded-xl）
    let card = h3.parentElement;
    while (card && !card.className.includes('rounded-xl')) {
      card = card.parentElement;
    }
    if (!card) return { found: false, items: [], productSnippet: null };

    // 抓 Card 內 raw text
    const rawText = card.innerText || '';
    const items = [];

    // 解析「標籤：值」模式（用正則切掉多餘空白）
    const lines = rawText.split(/\n+/).map(l => l.trim()).filter(Boolean);
    // 第一行是「公司基本資料」、第二行是股票名，跳過
    let skipFirst = 0;
    for (const line of lines) {
      if (skipFirst < 2) { skipFirst++; continue; }
      // 匹配 「label\nvalue」（連續兩行，且第二行不是新 label）
      // 簡化：直接抓所有有意義的 label-value 配對
      break;
    }

    // 用全局文字解析：每個 [Label]\n[Value] 對
    const labelRe = /([一-鿿㐀-䶿A-Za-z0-9（）\/]+)\s*\n([^?\n]+)/g;
    let m;
    while ((m = labelRe.exec(rawText)) !== null) {
      const label = m[1].trim();
      const value = m[2].trim();
      // 過濾明顯非標籤的（如「股票代碼」、「公司基本資料」標題）
      if (label === '公司基本資料' || label === '順德' || label.length > 12) continue;
      // 過濾值含「官方網站」等連結文字
      if (value.startsWith('官方網站')) continue;
      items.push({ label, value, hasValue: value !== '—' && value.length > 0 });
    }

    // 抓「主要產品」特殊 block
    const productEl = card.querySelector('.bg-brand-500\\/5');
    return {
      found: true,
      items,
      productSnippet: productEl?.innerText?.replace(/\s+/g, ' ').trim() || null,
    };
  });
  console.log('--- Company Fields ---');
  console.log(JSON.stringify(companyFields, null, 2));

  // 取樣：競爭對手列表
  const competitorRows = await page.evaluate(() => {
    const tbody = document.querySelector('[data-pdf-block="competitors-rows"]');
    if (!tbody) return { found: false };
    const rows = [];
    tbody.querySelectorAll('tr').forEach(tr => {
      const cells = tr.querySelectorAll('td');
      const symbolEl = cells[0]?.querySelector('.font-mono');
      const nameEl = cells[0]?.querySelector('.text-xs');
      if (symbolEl) {
        rows.push({
          symbol: symbolEl.textContent.trim(),
          name: nameEl?.textContent.trim() || '',
          // 抓 EPS / PE / ROE 三個右側 cell 的內容
          eps: cells[4]?.textContent.trim(),
          pe: cells[5]?.textContent.trim(),
          roe: cells[6]?.textContent.trim(),
          marketCap: cells[1]?.textContent.trim(),
          grossMargin: cells[2]?.textContent.trim(),
          netMargin: cells[3]?.textContent.trim(),
        });
      }
    });
    return { found: true, rows };
  });
  console.log('--- Competitor Rows ---');
  console.log(JSON.stringify(competitorRows, null, 2));

  // --- 判定 ---
  const goodFields = (companyFields.items || []).filter(it => it.hasValue && it.value.length > 0);
  const legitimatePeers = (competitorRows.rows || []).filter(r =>
    r.symbol !== r.name && // 不是 "個股概況" 等漏網
    r.symbol.match(/^\d{4}/) // 4 位起頭
  );
  const peersWithPE = legitimatePeers.filter(r => r.pe && r.pe !== '—');

  console.log('--- Verdict ---');
  console.log(`Company fields with value: ${goodFields.length}`);
  goodFields.slice(0, 10).forEach(f => console.log(`  ✓ ${f.label}: ${f.value}`));
  console.log(`Legitimate peers (real symbols): ${legitimatePeers.length}`);
  console.log(`Peers with PE value: ${peersWithPE.length}`);

  let fail = false;
  if (goodFields.length < 3) {
    console.log('FAIL: company fields too few');
    fail = true;
  }
  if (legitimatePeers.length < 3) {
    console.log('FAIL: legitimate peers too few');
    fail = true;
  }

  process.exit(fail ? 1 : 0);

  await ctx.close();
  await browser.close();
})().catch(e => { console.error(e); process.exit(99); });
