import { NextResponse } from 'next/server';
import { getCompetitorsForSymbol, hasCompetitorTable } from '@/lib/competitors';
import { getCompetitorMetrics } from '@/lib/sources';
import type { ApiError, Competitor, CompetitorData } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { symbol: string } },
) {
  const symbol = decodeURIComponent(params.symbol).trim();

  if (!symbol) {
    return NextResponse.json<ApiError>({
      error: true,
      message: '股票代碼不可為空',
    }, { status: 400 });
  }

  const seeds = getCompetitorsForSymbol(symbol);

  if (seeds.length === 0 || !hasCompetitorTable(symbol)) {
    return NextResponse.json<CompetitorData>({
      competitors: [],
      aiSummary: '此股票的競爭對手清單不在預設資料表中，AI 分析中將以通用方式討論產業競爭狀況。',
    });
  }

  try {
    const symbols = seeds.map((s) => s.symbol);
    const metrics = await getCompetitorMetrics(symbols);

    const competitors: Competitor[] = seeds.map((s) => ({
      ...s,
      ...metrics.get(s.symbol),
    }));

    // aiSummary 由 AI 報告（POST /api/ai-report）補上
    return NextResponse.json<CompetitorData>({
      competitors,
      aiSummary: '',
    });
  } catch (err) {
    console.error('[competitors] error:', err);
    return NextResponse.json<CompetitorData>({
      competitors: seeds.map((s) => ({ ...s })),
      aiSummary: '競爭對手部分指標暫時無法取得，建議搭配其他資訊綜合判斷。',
    });
  }
}