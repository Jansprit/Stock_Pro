import { NextRequest, NextResponse } from 'next/server';
import { getStockOverview, getFinancials, getHistoricalPrices } from '@/lib/sources';
import { generateAIReport } from '@/lib/claude';
import { getCompetitorsForSymbol } from '@/lib/competitors';
import { getCompetitorMetrics } from '@/lib/sources';
import type { DashboardData, AIReport } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 提供 /print/[symbol] 頁面需要的 DashboardData JSON
 * 不需要 query 篩選區塊，因為 data shape 固定；前端 client component 自己根據 sections prop 決定渲染哪些
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } },
) {
  const symbol = decodeURIComponent(params.symbol).trim();
  if (!symbol) {
    return NextResponse.json({ error: true, message: '股票代碼不可為空' }, { status: 400 });
  }

  try {
    const overview = await getStockOverview(symbol);
    const [financials, chart] = await Promise.all([
      getFinancials(symbol),
      getHistoricalPrices(symbol, '1Y'),
    ]);

    // 新聞與競爭對手暫時以空資料處理（避免拖慢 PDF 生成）
    const data: DashboardData = {
      overview,
      financials,
      chart,
      news: [],
      competitors: { competitors: [], aiSummary: '' },
      aiReport: null,
      fetchedAt: new Date().toISOString(),
    };

    // 若使用者選了 aiAnalysis 或 researchReport 才生成 AI 報告
    const sections = request.nextUrl.searchParams.get('sections') ?? '';
    if (sections.includes('aiAnalysis') || sections.includes('researchReport')) {
      try {
        data.aiReport = await generateAiReport(data);
      } catch {
        // AI 失敗不阻塞 PDF
        data.aiReport = null;
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: true, message: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 },
    );
  }
}

async function generateAiReport(data: DashboardData): Promise<AIReport> {
  const { overview, financials, news, competitors } = data;
  const overviewLite = {
    symbol: overview.symbol, name: overview.name, exchange: overview.exchange,
    sector: overview.sector, industry: overview.industry, description: overview.description,
    marketCap: overview.marketCap, price: overview.price, eps: overview.eps,
    pe: overview.trailingPE, currency: overview.currency,
  };
  const financialsLite = {
    years: financials.years.map((y) => ({
      year: y.year, revenue: y.revenue, grossProfit: y.grossProfit, netIncome: y.netIncome,
      eps: y.eps, freeCashFlow: y.freeCashFlow, totalLiabilities: y.totalLiabilities,
      totalEquity: y.totalEquity, grossMargin: y.grossMargin, netMargin: y.netMargin,
      roe: y.roe, debtToEquity: y.debtToEquity,
    })),
  };
  const newsLite = news.slice(0, 10).map((n) => ({
    title: n.title, summary: n.summary, sentiment: n.sentiment, category: n.category,
  }));
  const compLite = competitors.competitors.slice(0, 10).map((c) => ({
    name: c.name, marketPosition: c.marketPosition, coreStrength: c.coreStrength, coreRisk: c.coreRisk,
  }));
  return await generateAIReport({
    overview: overviewLite,
    financials: financialsLite,
    news: newsLite,
    competitors: compLite,
  });
}