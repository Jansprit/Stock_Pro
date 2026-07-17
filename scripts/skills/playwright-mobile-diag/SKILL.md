---
name: playwright-mobile-diag
description: Use this skill when debugging issues that only happen on real mobile devices (Android Chrome, iOS Safari) but work on desktop. Covers: Playwright mobile context setup, what headless Chromium does and doesn't simulate, common mobile-only behaviors (idle TCP cut, viewport DPR), and how to write a diagnostic script that exposes the difference. Particularly useful for: SSE streaming, large request bodies, network behavior over NAT, touch events, viewport-dependent rendering.
metadata:
  type: reference
  source: Stock_Pro v0.5.4 Android diagnostic suite
---

# Diagnosing Mobile-Only Bugs with Playwright

## What headless Chromium simulates
- **Viewport size and DPR** — set via `viewport`, `deviceScaleFactor`
- **Touch events** — `hasTouch: true` enables touch API
- **User agent string** — `userAgent` is honored by servers
- **`isMobile: true` media queries** — CSS `@media (max-width: ...)` evaluates correctly
- **Client Hints headers** — `sec-ch-ua-mobile: ?1` etc.

## What headless Chromium does NOT simulate
- **Real OS-level TCP connection management** — this is the big one. Headless Chrome doesn't have the same NAT/idle timeouts as real Android.
- **Memory pressure** — Android Chrome throttles when memory is low; headless has infinite memory.
- **Background tab throttling** — real Android slows timers when tab is backgrounded.
- **Network type** — doesn't distinguish Wi-Fi vs 4G vs 3G latency profiles.
- **Battery / doze mode** — real Android can pause JS execution; headless never does.

## The mobile device emulation recipe

```javascript
const { chromium } = require('playwright');

// Realistic mobile context (works for any phone shape; customize per device)
const note25ultra = {
  viewport: { width: 412, height: 915 },   // logical pixels
  deviceScaleFactor: 3,                      // hardware DPR
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/150.0.7871.114 Mobile Safari/537.36',
  locale: 'zh-TW',
  // Optional: simulate a slower CPU
  // permissions: ['geolocation'],
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext(note25ultra);
const page = await ctx.newPage();
```

For **real Note 25 Ultra** (a device Playwright doesn't have a preset for), use a known-good profile like Pixel 7 (`devices['Pixel 7']`) or build your own as above.

## The diagnostic script pattern

When debugging "works on desktop, fails on Android Chrome":

```javascript
// 1. Hook ALL the events that could surface the bug
const events = [];
page.on('response', async (res) => {
  if (res.url().includes('/api/')) {
    events.push({ t: Date.now(), type: 'response', status: res.status(), url: res.url() });
  }
});
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    events.push({ t: Date.now(), type: 'console', text: msg.text().slice(0, 200) });
  }
});
page.on('pageerror', err => {
  events.push({ t: Date.now(), type: 'pageerror', msg: err.message });
});
page.on('requestfailed', req => {
  events.push({ t: Date.now(), type: 'requestfailed',
    url: req.url(), error: req.failure().errorText });
});

// 2. Set a polling loop that snapshots the page state
const t0 = Date.now();
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(5000);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const state = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      bodyLen: body.length,
      // specific text patterns that indicate progress
      hasAIReport: body.includes('綜合評分'),
      hasAIError: body.includes('AI 分析失敗'),
      hasChart: document.querySelectorAll('.recharts-wrapper').length,
      hasCompetitorTable: document.querySelectorAll('table').length,
    };
  });
  console.log(`t=${elapsed}s:`, JSON.stringify(state));
  if (state.hasAIReport) { console.log('  ✓ success'); break; }
}

console.log('\n=== events ===');
events.forEach(e => console.log('  ' + JSON.stringify(e)));
```

**Critical: log BOTH client state AND server-side log** to triangulate. If client says "still loading" but server log shows the work completed, you have a network/transport bug. If client says "error" and server log shows a clear error message, you have a logic bug.

## What "headless mobile" catches vs misses

| Bug type | Headless mobile catches? | Why |
|---|---|---|
| `sec-ch-ua-mobile: ?1` missing in API call | ✅ Yes | UA string honored |
| CSS layout broken at 412px width | ✅ Yes | Real viewport |
| Touch event not handled | ✅ Yes | hasTouch: true |
| 60-90s fetch hangs on home Wi-Fi | ❌ **No** | Headless has no NAT |
| "Failed to fetch" TypeError on Android | ⚠️ **Maybe** | Reproducible only with throttled network or long delay |
| Memory pressure throttling | ❌ No | Headless has infinite RAM |
| `prefers-reduced-motion` affecting animation | ✅ Yes | Default true in mobile context |

## To simulate a slow/unreliable mobile network

Use Playwright's CDP throttling:

```javascript
const client = await ctx.newCDPSession(page);
await client.send('Network.enable');
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,        // ms — simulate 3G/4G latency
  downloadThroughput: 1.6 * 1024 * 1024 / 8,  // 1.6 Mbps
  uploadThroughput: 750 * 1024 / 8,
});
```

This makes headless Chrome's network conditions closer to real mobile, but **still doesn't trigger NAT idle timeouts** — those are at the OS/router level, not the browser.

## The "external URL" trick (the most useful real-world diagnostic)

When the bug is on a real phone on a real network, **the most reliable diagnostic is the server-side log**:
1. Add structured logging on the server: timestamp, user-agent, sec-ch-ua-mobile, body size, work duration, success/failure
2. Have the user reproduce the bug on their phone
3. Look at the server log to see what the server saw

Without server-side logging, you're guessing. The Playwright test only tells you what headless did, which is often different from what the phone did.

## Verifying mobile-only rendering changes

If you change CSS or layout that you think only affects mobile:

```javascript
// In your test, after page.goto:
await page.screenshot({ path: 'mobile-test.png', fullPage: true });

// Also useful: dump computed styles for a specific element
const styles = await page.evaluate(() => {
  const el = document.querySelector('.competitor-table');
  const cs = window.getComputedStyle(el);
  return {
    display: cs.display,
    width: cs.width,
    fontSize: cs.fontSize,
    mediaMobile: window.matchMedia('(max-width: 768px)').matches,
  };
});
```

## Common mobile-only test bugs

### `page.evaluate()` `fetch` URL is relative
`fetch('/api/foo')` works in a page context (real URL) but fails in `page.evaluate(fetch, ...)` if the page is on `about:blank`. Always `page.goto('http://localhost:3000/')` first.

### `res.status()` vs `res.status`
In `page.evaluate(() => fetch(...))` callbacks, `res.status` is a number, NOT a function. Calling `res.status()` throws "res.status is not a function".

### `isMobile: true` enables touch but doesn't simulate gestures
You need to explicitly use `page.tap()` instead of `page.click()` for realistic touch behavior, and use `page.touchscreen.tap()` for screen coordinates.

### Locators with `isMobile: true` may behave differently
Some Playwright auto-wait heuristics change with mobile context. If a locator works on desktop but not mobile, try `page.locator('input').first().fill()` explicitly instead of `page.fill('input', ...)`.

## Verifying Android-specific server fixes

After deploying a server-side fix (e.g. SSE streaming), use this minimal validation:

```javascript
// 1. Goto your page
// 2. Open the SSE endpoint directly in page context
// 3. Read raw chunks with timestamps
const result = await page.evaluate(async () => {
  const log = [];
  const t0 = Date.now();
  const res = await fetch('/api/ai-report', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...}),
  });
  log.push({ t: Date.now() - t0, type: 'response', status: res.status });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const now = Date.now();
    const text = decoder.decode(value, { stream: true });
    log.push({ t: now - t0, type: 'chunk', bytes: value.byteLength, gapMs: ..., keepAlive: text.includes('keep-alive') });
  }
  return log;
});
```

If `keepAlive: true` chunks appear every ~10s and a `done` event arrives within the expected work time, your SSE fix works for headless mobile. For real phone, the same server-side log + tail in the same time period is the only way to verify.

## When headless mobile lies to you

If your fix works in headless mobile but the user still reports the bug on their real phone, suspect:
1. **Network conditions** — real phone has NAT, headless doesn't
2. **OS-level throttling** — Android may pause JS after 30s of "inactivity" in some scenarios
3. **Different browser** — Samsung Internet, Firefox, or older Chrome version
4. **DNS resolution** — real phone may hit different DNS servers
5. **Server-side timing** — the work may genuinely take longer on real data vs test data

For (1), the only fix is to test on a real phone over real Wi-Fi.
