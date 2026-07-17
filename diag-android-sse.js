// Android SSE 驗證：確認 10s 內有 keep-alive chunk、110s 內收到 done event
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

  // 直接對 /api/ai-report 發 SSE 請求，觀察 chunk 間隔
  const events = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/ai-report')) {
      events.push({ t: Date.now(), type: 'response-start', status: res.status() });
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'log' && msg.text().includes('SSE')) {
      events.push({ t: Date.now(), type: 'console', msg: msg.text().slice(0, 100) });
    }
  });

  console.log('=== 開啟首頁 ===');
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('=== 在 page context 內 fetch /api/ai-report 觀察 SSE 串流 ===');
  const result = await page.evaluate(async () => {
    const log = [];
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 180_000);

    try {
      const res = await fetch('/api/ai-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overview: { symbol: '2330.TW', name: '台積電', exchange: 'TAI', price: 580, currency: 'TWD' },
          financials: { years: [] },
          news: [],
          competitors: [],
        }),
        signal: ctrl.signal,
      });
      log.push({ t: Date.now() - t0, type: 'response', status: res.status, contentType: res.headers.get('content-type') });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastChunkAt = t0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          log.push({ t: Date.now() - t0, type: 'stream-done' });
          break;
        }
        const now = Date.now();
        const gapMs = now - lastChunkAt;
        const text = decoder.decode(value, { stream: true });
        buffer += text;
        // 計算 chunk 內有多少個 \n\n（SSE event delimiter）
        const eventCount = (text.match(/\n\n/g) || []).length;
        const hasKeepAlive = text.includes(':keep-alive') || text.includes(': keep-alive');
        log.push({ t: now - t0, type: 'chunk', bytes: value.byteLength, events: eventCount, gapMs, keepAlive: hasKeepAlive, preview: text.slice(0, 80) });
        lastChunkAt = now;

        // 解析完整事件
        let idx;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (raw.startsWith(':')) continue;
          const dataLine = raw.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine.slice(6));
            log.push({ t: Date.now() - t0, type: 'event', event: evt.event, hasReport: !!evt.report, msg: evt.message, elapsedMs: evt.elapsedMs });
          } catch (e) {
            log.push({ t: Date.now() - t0, type: 'parse-error', data: dataLine.slice(6, 100) });
          }
        }
      }
    } catch (err) {
      log.push({ t: Date.now() - t0, type: 'error', name: err.name, msg: err.message });
    } finally {
      clearTimeout(timeoutId);
    }
    return log;
  });

  console.log('SSE events:');
  result.forEach(e => console.log('  ' + JSON.stringify(e)));

  // 摘要
  const chunks = result.filter(e => e.type === 'chunk');
  const events2 = result.filter(e => e.type === 'event');
  const errors = result.filter(e => e.type === 'error');
  const finalDone = events2.find(e => e.event === 'done');
  console.log('\n=== 摘要 ===');
  console.log('chunks 數:', chunks.length);
  console.log('chunk 間隔（ms）:', chunks.map(c => c.gapMs).join(','));
  console.log('keep-alive chunks:', chunks.filter(c => c.keepAlive).length);
  console.log('events:', events2.map(e => e.event).join(','));
  console.log('errors:', errors.length);
  if (finalDone) console.log('✓ done event at', finalDone.t, 'ms, hasReport:', finalDone.hasReport);

  await browser.close();
})();
