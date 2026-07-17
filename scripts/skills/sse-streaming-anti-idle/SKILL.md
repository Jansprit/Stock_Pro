---
name: sse-streaming-anti-idle
description: Use this skill whenever a client fetch or long-running request times out on mobile networks, home Wi-Fi, or any NAT environment after 30-90 seconds — even though the server successfully completes the work. The "Failed to fetch" TypeError on Android Chrome, hung `await` in headless Playwright, or "the server log shows the work finished but the client never received it" pattern. Covers SSE keep-alive chunks, chunked transfer encoding, and why "just add a longer timeout" never works.
metadata:
  type: reference
  source: Stock_Pro v0.5.4 SSE fix for 2408.TW mobile AI report
---

# Why Long HTTP Requests Die on Mobile Networks (And How SSE Fixes It)

## Symptom (any of these means this is your bug)
- Mobile Chrome shows "Failed to fetch" or "TypeError" on requests that take >60s
- Server log shows the work completed (e.g. AI inference took 57s) but client never received the result
- Headless Playwright `await fetch(...)` never resolves and never errors (just hangs)
- Works on desktop Chrome, fails on Android Chrome over the same Wi-Fi
- Setting `fetch(..., {signal: AbortController.timeout(180_000)})` doesn't help — fires after 180s with AbortError
- Increasing the timeout works for some users but not others (network-dependent)

## What's actually happening
The client's TCP connection is being **silently torn down by an intermediate device** (your home Wi-Fi 6 router, mobile carrier NAT, corporate proxy) due to **idle connection timeout**. These devices have NAT tables that map external IP:port to internal IP:port; if no traffic flows for 60-90 seconds, they evict the entry. Once evicted, the server's response has nowhere to go — server thinks it's still connected, client thinks it's still connected, but the packets vanish.

Increasing the client timeout **does nothing** — the request is dead well before the timeout fires. Increasing the server-side processing time makes it worse.

The reason desktop Chrome works: it's on the same LAN as the server (or via a router with longer idle timeouts), or the user has a desktop OS that maintains NAT entries more aggressively.

## Why long-polling doesn't fix it
Long-polling (client makes request, server holds response open until work done) has the same problem — the TCP connection goes idle while the server processes, and gets killed by the NAT.

## Why polling for status doesn't fix it
Polling `/api/jobs/<id>` every 5s creates a new TCP connection each time, but adds 5s latency to the final delivery and breaks streaming. And if your work takes 70s, you still need to wait for the result.

## The fix: Server-Sent Events with periodic keep-alive

SSE is **HTTP/1.1 chunked transfer encoding** with a fixed event format. The key insight: **each chunk is an independent HTTP response body segment**, and each chunk sent to the client requires the server to push bytes — which **resets the NAT idle timer**.

The pattern:
1. Client opens `fetch()` to a streaming endpoint
2. Server sends `event: progress\ndata: ...\n\n` (first event)
3. Server sets a `setInterval(10000)` to send `: keep-alive 10000ms\n\n` (SSE comment line, ignored by browser, but counts as bytes sent)
4. When work is done, server sends `event: done\ndata: {report: {...}}\n\n` then closes the stream
5. Client reads chunks via `reader.read()`, accumulates buffer, parses `\n\n`-delimited events

Because the server pushes bytes every 10s, the NAT/router sees continuous traffic and never evicts the connection.

## Server implementation (Node + Next.js App Router)

```typescript
export async function POST(request: NextRequest) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendEvent = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      };
      const sendComment = (text: string) => {
        try {
          controller.enqueue(encoder.encode(`: ${text}\n\n`));
        } catch { /* ignored */ }
      };

      try {
        // 1. Validate request
        // 2. Set up keep-alive: pushes bytes every 10s
        const keepAlive = setInterval(() => {
          sendComment(`keep-alive ${Date.now() - t0}ms`);
        }, 10_000);

        // 3. Send initial progress
        sendEvent({ event: 'progress', message: 'starting', elapsedMs: 0 });

        // 4. Do the actual work (may take 30-120s)
        const result = await doExpensiveWork();

        // 5. Stop keep-alive, send final result
        clearInterval(keepAlive);
        sendEvent({ event: 'done', report: result, elapsedMs: Date.now() - t0 });
      } catch (err) {
        sendEvent({ event: 'error', message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // If behind nginx: tells it NOT to buffer responses
      'X-Accel-Buffering': 'no',
    },
  });
}
```

## Client implementation

```typescript
const AI_TIMEOUT_MS = 180_000;
const aiAbort = new AbortController();
setTimeout(() => aiAbort.abort(), AI_TIMEOUT_MS);

const aiRes = await fetch('/api/expensive-work', {
  method: 'POST',
  body: JSON.stringify({...}),
  signal: aiAbort.signal,
});

if (!aiRes.body) {
  // error: no body
}

const reader = aiRes.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let gotFinal = false;

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  // SSE events delimited by \n\n
  let idx;
  while ((idx = buffer.indexOf('\n\n')) >= 0) {
    const raw = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);

    if (raw.startsWith(':')) continue;  // SSE comment (keep-alive)
    const dataLine = raw.split('\n').find(l => l.startsWith('data: '));
    if (!dataLine) continue;

    const evt = JSON.parse(dataLine.slice(6));
    if (evt.event === 'progress') {
      // update UI
    } else if (evt.event === 'done' && evt.report) {
      gotFinal = true;
      // final result!
    } else if (evt.event === 'error') {
      gotFinal = true;
      // show error
    }
  }
}

if (!gotFinal) {
  // Stream ended without done/error → connection cut
  // This is the "old bug" — should be much rarer with keep-alive
}
```

## Critical gotchas

### 1. `X-Accel-Buffering: no` is mandatory behind nginx
Without it, nginx buffers all SSE events until the upstream closes, defeating the whole point. If you're behind Cloudflare or another reverse proxy, check its SSE docs.

### 2. Don't use `EventSource` for POST
`EventSource` is GET-only and has no body. For SSE + POST body, you must use `fetch` + `ReadableStream` as above.

### 3. SSE timeout strategy
- Keep-alive interval: 10s is the sweet spot (less = wasted bandwidth, more = risk of NAT eviction)
- Client timeout: 180s+ (3x the slowest expected AI inference, to cover retry attempts)

### 4. The `reader.read()` loop never returns `done=true` if the connection is cut
If NAT evicts the connection mid-stream, `reader.read()` will hang forever (not error). You need:
- A client-side timeout (AbortController) as the ultimate backstop
- The `if (!gotFinal)` check after the loop to detect "stream ended without conclusion"

### 5. Server-side controller errors are silent
If you `controller.enqueue()` after the client has disconnected, it throws. Always wrap in try/catch (as shown) — otherwise the server crashes on every mobile disconnect.

### 6. AbortController on the client
If the user navigates away or refreshes, you should `aiAbort.abort()` to close the connection. The server's keep-alive interval will then trigger an enqueue-on-closed-controller error — but if you wrapped in try/catch (see #5), it's a no-op.

## When NOT to use SSE
- Work takes < 5s — just use a normal POST
- You're behind Cloudflare Workers or other edge runtimes with strict streaming limits
- Client is server-to-server (no NAT in the middle) — long-poll or simple HTTP is fine

## How to verify it's working
Run a Playwright test that simulates a phone on a network with NAT. Watch the server log: you should see keep-alive comment lines every 10s, then a final event when the work completes. If you see the work complete but the client never receives the result, the keep-alive interval is too long for your network.

A diagnostic script for testing on real mobile conditions:
```javascript
// 1. Open a page on real Android Chrome (not headless)
// 2. Trigger the long-running request
// 3. Watch server log: keep-alive every 10s
// 4. Watch page state: 'progress' event within 100ms, 'done' event within expected time
// 5. Verify final state matches server result
```
