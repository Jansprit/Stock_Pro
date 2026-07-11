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
  let twseIndustry: string | null = null;
  try {
    const isTw = /\.(TW|TWO)$/i.test(symbol);
    const avail = goodinfoAvailable();
    if (isTw && avail) {
      const result = await fetchGoodinfoPeersForSymbol(symbol, 10);
      twseIndustry = result.twseIndustry;
      console.log(`[competitors] goodinfo: ${symbol} -> ${result.peers.length} peers, industry=${twseIndustry ?? 'none'}`);

      // 從 Goodinfo 補 5 家同業（無論有沒有 seed — 填補未完整的）
      const goodinfoPeers = result.peers
        .filter((p) => !competitors.find((c) => c.symbol === p.symbol))
        .slice(0, 5);

      if (goodinfoPeers.length > 0) {
        // 嘗試補指標：從 Yahoo / Finnhub 抓 price target 與 valuation
        try {
          const metrics = await getCompetitorMetrics(goodinfoPeers.map((p) => p.symbol));
          for (const p of goodinfoPeers) {
            competitors.push({
              symbol: p.symbol,
              name: p.name,
              marketPosition: `同屬「${twseIndustry ?? '未分類'}」產業（Goodinfo 來源）`,
              coreStrength: '',
              coreRisk: '',
              source: 'goodinfo',
              ...metrics.get(p.symbol),
            });
          }
        } catch {
          // fallback：只給基本 symbol + name
          for (const p of goodinfoPeers) {
            competitors.push({
              symbol: p.symbol,
              name: p.name,
              marketPosition: `同屬「${twseIndustry ?? '未分類'}」產業（Goodinfo 來源）`,
              coreStrength: '',
              coreRisk: '',
              source: 'goodinfo',
            });
          }
        }
      }
    }
  } catch (err) {
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

  return NextResponse.json<CompetitorData>({
    competitors,
    aiSummary: '',
  });
}
