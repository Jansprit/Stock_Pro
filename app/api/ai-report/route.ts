import { NextRequest, NextResponse } from 'next/server';
import { generateAIReport, isClaudeAvailable } from '@/lib/claude';
import type { ApiError } from '@/lib/types';

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
    marketPosition: string;
    coreStrength: string;
    coreRisk: string;
  }>;
}

export async function POST(request: NextRequest) {
  if (!isClaudeAvailable()) {
    return NextResponse.json<ApiError>({
      error: true,
      code: 'CLAUDE_UNAVAILABLE',
      message: 'AI 分析功能尚未啟用（請在 .env.local 設定 ANTHROPIC_API_KEY）',
    }, { status: 503 });
  }

  try {
    const body = (await request.json()) as AIReportRequestBody;

    // 鬆綁硬檢查：ETF、新上市股、極冷門股可能沒有完整財報/新聞/競爭對手資料。
    // 只要求最少要有 symbol（已由 overview 提供）才處理，其餘欄位允許空陣列，
    // AI 模型會依現有資料生成報告，並在 conclusion / scoreReasons 中明確標示「需更多資訊」。
    if (!body.overview?.symbol) {
      return NextResponse.json<ApiError>({
        error: true,
        message: '請求資料不完整：缺少股票基本資料（symbol）',
      }, { status: 400 });
    }

    // competitors 結構兼容：可接受 Array<...> 或 { competitors: Array<...>, aiSummary }
    // （前端 competitors API 回傳 { competitors: [], aiSummary: '' }）
    const competitorsInput = Array.isArray(body.competitors)
      ? body.competitors
      : (body.competitors as unknown as { competitors?: unknown[] })?.competitors ?? [];

    const report = await generateAIReport({ ...body, competitors: competitorsInput as AIReportRequestBody['competitors'] });
    return NextResponse.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI 報告生成失敗';
    console.error('[ai-report] error:', err);
    return NextResponse.json<ApiError>({
      error: true,
      message,
    }, { status: 500 });
  }
}