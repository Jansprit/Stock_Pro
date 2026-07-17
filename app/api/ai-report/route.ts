import { NextRequest } from 'next/server';
import { generateAIReport, isClaudeAvailable } from '@/lib/claude';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AIReportRequestBody {
  overview: {
    symbol: string;
    name: string;
    exchange: string;
    sector?: string;
    industry?: string;
    description?: string;
    marketCap?: number;
    price: number;
    eps?: number;
    pe?: number;
    currency: string;
  };
  financials: {
    years: Array<{
      year: number;
      revenue: number;
      grossProfit: number;
      netIncome: number;
      eps: number;
      freeCashFlow: number;
      totalLiabilities: number;
      totalEquity: number;
      grossMargin: number;
      netMargin: number;
      roe: number;
      debtToEquity: number;
    }>;
  };
  news: Array<{
    title: string;
    summary: string;
    sentiment: string;
    category: string;
  }>;
  competitors: Array<{
    name: string;
    marketPosition?: string;
    coreStrength?: string;
    coreRisk?: string;
  }>;
}

/**
 * v0.5.4 SSE streaming 修法：
 * 把原本一次性的 AI 報告 POST 改成 Server-Sent Events 串流。
 *
 * 為什麼用 SSE：
 *   之前實測 server 端 AI 報告耗時 56-104s。家用 Wi-Fi 6 router 通常在 60-90s
 *   沒看到 TCP activity 就會 idle timeout 切斷連線（保留連線表項）。
 *   即使 server 完成 response 也回不到 client，client fetch 永遠 hung。
 *
 *   SSE 解決：每 10s 推一個 keep-alive comment (`:keep-alive\n\n`)。
 *   - SSE 是 HTTP/1.1 chunked transfer，每個 chunk 都是獨立的 HTTP response body 段
 *   - 每 10s 推 chunk 讓 TCP 連線表項 active，router 不會切
 *   - 等真正 AI 報告完成後推一個 `data: {...json...}\n\n` 事件，然後 `close`
 *
 * SSE 事件格式：
 *   - `:keep-alive\n\n` — 註解行（瀏覽器忽略，但會觸發 TCP send）
 *   - `data: {"event":"progress","message":"..."}\n\n` — 進度事件
 *   - `data: {"event":"done","report":{...}}\n\n` — 完成事件
 *   - `data: {"event":"error","message":"..."}\n\n` — 錯誤事件
 *
 * Client 端用 fetch + ReadableStream 讀 chunk，根據 event 類型處理。
 */
export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const ua = request.headers.get('user-agent') ?? '(none)';
  const isMobileUA = /Mobile|Android|iPhone|iPad/i.test(ua);

  // SSE 必須支援 streaming response。用 ReadableStream 包裝 generator。
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // 輔助：推 SSE 事件
      const sendEvent = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller 已關閉（client 斷線）— 忽略
        }
      };

      const sendComment = (text: string) => {
        try {
          controller.enqueue(encoder.encode(`: ${text}\n\n`));
        } catch {
          // 忽略
        }
      };

      try {
        if (!isClaudeAvailable()) {
          sendEvent({
            event: 'error',
            code: 'CLAUDE_UNAVAILABLE',
            message: 'AI 分析功能尚未啟用（請在 .env.local 設定 ANTHROPIC_API_KEY）',
          });
          controller.close();
          return;
        }

        const body = (await request.json()) as AIReportRequestBody;

        if (!body.overview?.symbol) {
          sendEvent({ event: 'error', message: '請求資料不完整：缺少股票基本資料（symbol）' });
          controller.close();
          return;
        }

        const competitorsInput = Array.isArray(body.competitors)
          ? body.competitors
          : (body.competitors as unknown as { competitors?: unknown[] })?.competitors ?? [];

        console.log(`[ai-report-debug] SSE req: symbol=${body.overview.symbol}, financials.years=${body.financials?.years?.length ?? 0}, news=${body.news?.length ?? 0}, competitors=${competitorsInput.length}, isMobileUA=${isMobileUA}`);

        // 啟動 keep-alive 定時器：每 10s 推 :keep-alive，避免 router idle timeout
        const keepAliveInterval = setInterval(() => {
          sendComment(`keep-alive ${Date.now() - t0}ms`);
        }, 10_000);

        // 推第一個 progress 事件，client 可顯示「開始分析」
        sendEvent({ event: 'progress', message: '開始生成 AI 報告', elapsedMs: 0 });

        try {
          const report = await generateAIReport({
            ...body,
            competitors: competitorsInput as AIReportRequestBody['competitors'],
          });

          // 清除 keep-alive
          clearInterval(keepAliveInterval);

          const totalMs = Date.now() - t0;
          console.log(`[ai-report-debug] SSE ok: ${body.overview.symbol}, ${totalMs}ms, isMobileUA=${isMobileUA}`);

          // 推最終結果
          sendEvent({ event: 'done', report, elapsedMs: totalMs });
        } catch (genErr) {
          clearInterval(keepAliveInterval);
          const message = genErr instanceof Error ? genErr.message : 'AI 報告生成失敗';
          console.error(`[ai-report-debug] SSE FAIL: ${Date.now() - t0}ms, isMobileUA=${isMobileUA}, msg="${message}"`);
          sendEvent({ event: 'error', message, elapsedMs: Date.now() - t0 });
        }

        controller.close();
      } catch (err) {
        // body parse 錯誤或其他前置錯誤
        const message = err instanceof Error ? err.message : 'AI 報告請求處理失敗';
        sendEvent({ event: 'error', message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Nginx 反代需要這行才會 streaming
      'X-Accel-Buffering': 'no',
    },
  });
}
