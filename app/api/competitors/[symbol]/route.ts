import { NextResponse } from 'next/server';
import { getCompetitorsForSymbol, getIndustryPeers, hasCompetitorTable } from '@/lib/competitors';
import { getCompetitorMetrics, getStockOverview } from '@/lib/sources';
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

  // Fallback A：用 industry 名稱查通用美股同業清單（解 NOK 這種「不在 COMPETITORS
  //     但知道產業」的 case）。需先抓 overview 拿 industry 欄位。
  if (competitors.length === 0) {
    try {
      const overview = await getStockOverview(symbol);
      const industry = overview.industry || overview.sector;
      const industryPeers = getIndustryPeers(industry);
      if (industryPeers.length > 0) {
        console.log(`[competitors] industry fallback for ${symbol}: industry=${industry}, ${industryPeers.length} peers`);
        try {
          const symbols = industryPeers.map((p) => p.symbol);
          const metrics = await getCompetitorMetrics(symbols);
          competitors = industryPeers.map((p) => ({
            symbol: p.symbol,
            name: p.name,
            marketPosition: p.marketPosition,
            coreStrength: p.coreStrength,
            coreRisk: p.coreRisk,
            source: 'industry-fallback',
            ...metrics.get(p.symbol),
          }));
        } catch (err) {
          console.warn('[competitors] industry fallback metrics error:', err);
          competitors = industryPeers.map((p) => ({
            symbol: p.symbol,
            name: p.name,
            marketPosition: p.marketPosition,
            coreStrength: p.coreStrength,
            coreRisk: p.coreRisk,
            source: 'industry-fallback',
            pe: p.pe,
            ps: p.ps,
            evEbitda: p.evEbitda,
          }));
        }
      }
    } catch (err) {
      console.warn('[competitors] industry fallback overview failed:', err);
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

      // 從 Goodinfo 補同業（5 家上限）
      const goodinfoPeers = result.peers
        .filter((p) => !competitors.find((c) => c.symbol === p.symbol))
        .slice(0, 5);

      if (goodinfoPeers.length > 0) {
        // 嘗試補 indicators：從 Goodinfo 拿到的 PE 直接用；其他欄位試 Yahoo
        let metrics: Map<string, Partial<Competitor>> = new Map();
        try {
          metrics = await getCompetitorMetrics(goodinfoPeers.map((p) => p.symbol));
        } catch {
          // 忽略，繼續只用 Goodinfo 指標
        }
        for (const p of goodinfoPeers) {
          // 注意：優先用 Goodinfo 的即時 PE / PB / price（Yahoo 對中小股常回空或錯值）
          const m = metrics.get(p.symbol) ?? ({} as Partial<Competitor>);
          const peer: Competitor = {
            symbol: p.symbol,
            name: p.name,
            marketPosition: `同屬「${twseIndustry ?? '未分類'}」產業（Goodinfo 來源）`,
            coreStrength: '',
            coreRisk: '',
            source: 'goodinfo',
            // Goodinfo PE / PB / price 為主要來源（empty 才 fallback Yahoo）
            pe: p.pe ?? m.pe,
            pb: p.pb ?? m.pb,
            price: p.price ?? m.price,
            // 其他欄位（Yahoo 比較有值）才用 Yahoo fallback
            ...(m.marketCap !== undefined && { marketCap: m.marketCap }),
            ...(m.grossMargin !== undefined && { grossMargin: m.grossMargin }),
            ...(m.netMargin !== undefined && { netMargin: m.netMargin }),
            ...(m.eps !== undefined && { eps: m.eps }),
            ...(m.roe !== undefined && { roe: m.roe }),
            ...(m.dividendYield !== undefined && { dividendYield: m.dividendYield }),
          };
          competitors.push(peer);
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
