import { NextResponse } from 'next/server';
import { getCompetitorsForSymbol, hasCompetitorTable } from '@/lib/competitors';
import { getCompetitorMetrics } from '@/lib/sources';
import { fetchGoodinfoPeersForSymbol, isAvailable as goodinfoAvailable } from '@/lib/sources/goodinfo';
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

  // 預設 seed（hardcoded 主流清單）：先拿這個
  const seeds = getCompetitorsForSymbol(symbol);
  let competitors: Competitor[] = [];

  if (seeds.length > 0 && hasCompetitorTable(symbol)) {
    try {
      const symbols = seeds.map((s) => s.symbol);
      const metrics = await getCompetitorMetrics(symbols);
      competitors = seeds.map((s) => ({ ...s, ...metrics.get(s.symbol) }));
    } catch (err) {
      console.error('[competitors] metrics error:', err);
      competitors = seeds.map((s) => ({ ...s }));
    }
  }

  // 補充：Goodinfo 同業清單（台股限定），抓 TWSE 產業分類下的所有同業
  // 注意：不要覆寫 seed 既有項目，僅在 seeds 為空時填入（或補滿）
  let twseIndustry: string | null = null;
  try {
    const isTw = /\.(TW|TWO)$/i.test(symbol);
    const avail = goodinfoAvailable();
    if (isTw && avail) {
      const result = await fetchGoodinfoPeersForSymbol(symbol, 10);
      twseIndustry = result.twseIndustry;
      console.log(`[competitors] goodinfo: ${symbol} -> ${result.peers.length} peers, industry=${twseIndustry ?? 'none'}`);
      if (competitors.length === 0 && result.peers.length > 0) {
        // 完全沒 seed：把 Goodinfo 同業填入（限 5 家），標記 source = goodinfo
        competitors = result.peers.slice(0, 5).map((p) => ({
          symbol: p.symbol,
          name: p.name,
          marketPosition: `Goodinfo 同類股（${twseIndustry ?? '未分類'}）`,
          coreStrength: '',
          coreRisk: '',
          source: 'goodinfo' as const,
        }));
      } else if (result.peers.length > 0 && competitors.length > 0) {
        // 有 seed：把 twseIndustry 附加資訊附在 aiSummary
        void twseIndustry;
      }
    }
  } catch (err) {
    // Goodinfo 失敗不影響主流程
    console.warn('[competitors] goodinfo fallback skipped:', err);
  }

  if (competitors.length === 0) {
    const summary = twseIndustry
      ? `此股票在 Goodinfo 屬於「${twseIndustry}」產業類別，但本系統尚未為此產業建立同業基本資料表。
         AI 分析中將以通用方式討論產業競爭狀況。`
      : '此股票的競爭對手清單不在預設資料表中，AI 分析中將以通用方式討論產業競爭狀況。';
    return NextResponse.json<CompetitorData>({
      competitors: [],
      aiSummary: summary,
    });
  }

  // aiSummary 由 AI 報告（POST /api/ai-report）補上
  return NextResponse.json<CompetitorData>({
    competitors,
    aiSummary: '',
  });
}
