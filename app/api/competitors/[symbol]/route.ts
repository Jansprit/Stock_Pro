import { NextResponse } from 'next/server';
import { getCompetitorsForSymbol, getIndustryPeers, hasCompetitorTable, sicToIndustry } from '@/lib/competitors';
import { getCompetitorMetrics, getStockOverview } from '@/lib/sources';
import { fetchGoodinfoPeersForSymbol, isAvailable as goodinfoAvailable } from '@/lib/sources/goodinfo';
import * as secCik from '@/lib/sources/sec-cik';
import * as secEdgar from '@/lib/sources/sec-edgar';
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
      // 對 ETF 直接早返回 — ETF 沒有「同產業個股」概念，與其跑完整 fallback chain（22s+）
      // 不如告訴使用者「ETF 無同業比較」
      const isEtf = symbol.startsWith('00') && (symbol.endsWith('.TW') || symbol.endsWith('.TWO'));
      if (isEtf) {
        return NextResponse.json<CompetitorData>({
          competitors: [],
          aiSummary: '此為 ETF（指數型基金），沒有「同產業個股」概念，故無競爭對手比較欄目。請查閱成分股或追蹤指數以了解其投資組合。',
        });
      }
      // 只需拿 industry 欄位做 industry fallback。對台股用 TWSE MIS（≤1s），其他用 Yahoo v8/chart meta
      let industry: string | undefined;
      const isTw = symbol.endsWith('.TW') || symbol.endsWith('.TWO');
      if (isTw) {
        // 從 cached overview 抓 industry（已建好的快取；無 cache 時只跑輕量 TWSE MIS）
        industry = await getStockOverview(symbol).then((o) => o.industry || o.sector).catch(() => undefined);
      } else {
        industry = await getStockOverview(symbol).then((o) => o.industry || o.sector).catch(() => undefined);
      }

      // Fallback A-1：若 Yahoo v10 industry 太粗（如 'Technology'）找不到對應的 peer group，
      //     用 SEC submissions 的 SIC code（更精準的 4 位數字分類）→ 對應 SIC_TO_INDUSTRY map
      if (!industry || !getIndustryPeers(industry).length) {
        const isUs = !symbol.endsWith('.TW') && !symbol.endsWith('.TWO');
        if (isUs) {
          try {
            const cik = await secCik.lookupCikByTicker(symbol);
            if (cik) {
              const info = await secEdgar.fetchSecCompanyInfo(cik);
              if (info?.sic) {
                const sicIndustry = sicToIndustry(info.sic);
                if (sicIndustry) {
                  industry = sicIndustry;
                  console.log(`[competitors] SIC fallback for ${symbol}: sic=${info.sic} (${info.sicDescription}) → ${industry}`);
                }
              }
            }
          } catch (sicErr) {
            console.warn(`[competitors] SIC lookup failed for ${symbol}:`, sicErr);
          }
        }
      }

      const industryPeers = getIndustryPeers(industry);
      // 過濾掉自己（避免 HPQ 出現在自己的 peer 清單）
      const filteredPeers = industryPeers.filter(
        (p) => p.symbol.toUpperCase() !== symbol.toUpperCase(),
      );
      if (filteredPeers.length > 0) {
        console.log(`[competitors] industry fallback for ${symbol}: industry=${industry}, ${filteredPeers.length} peers (filtered ${industryPeers.length - filteredPeers.length} self)`);
        try {
          const symbols = filteredPeers.map((p) => p.symbol);
          const metrics = await getCompetitorMetrics(symbols);
          competitors = filteredPeers.map((p) => ({
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
          competitors = filteredPeers.map((p) => ({
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

  // 補充：Goodinfo 同業清單（台股限定）。對 ETF（industry=ETF 或 symbol 開頭 00）跳過，
  // 因為 ETF 沒有「同產業個股」概念，與其花 10+ 秒等 Playwright cold start 最後回傳空，
  // 不如直接讓 fallback chain 用 Yahoo industry 對應的 INDUSTRY_PEERS（如 0050/00878 ETF 比照）
  // 同時讓 getCompetitorMetrics 跳過（避免又去抓每檔 peer 的 metrics）
  let twseIndustry: string | null = null;
  const isEtf = symbol.startsWith('00') && (symbol.endsWith('.TW') || symbol.endsWith('.TWO'));
  // 對 ETF 跳過 Goodinfo，但走 INDUSTRY_PEERS 的 ETF fallback（已內建在 competitors route 前段）
  try {
    const isTw = /\.(TW|TWO)$/i.test(symbol);
    const avail = goodinfoAvailable();
    if (isTw && avail && !isEtf) {
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
