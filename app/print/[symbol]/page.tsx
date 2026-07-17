import { getStockOverview, getFinancials, getHistoricalPrices } from '@/lib/sources';
import { generateAIReport } from '@/lib/claude';
import { getCompetitorsForSymbol } from '@/lib/competitors';
import { getCompetitorMetrics } from '@/lib/sources';
import type { DashboardData, AIReport } from '@/lib/types';
import {
  ALL_SECTION_KEYS,
  PrintSectionKey,
  PRINT_SECTION_LABELS,
} from '@/lib/print-sections';
import { PrintableSections } from '@/components/dashboard/PrintableSections';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SECTION_SET = new Set<string>(ALL_SECTION_KEYS);

function parseSections(sectionsParam: string | null): Set<PrintSectionKey> {
  if (!sectionsParam) {
    return new Set(ALL_SECTION_KEYS.filter((k) => k !== 'news'));
  }
  const requested = sectionsParam.split(',').map((s) => s.trim()).filter((s) => SECTION_SET.has(s));
  return new Set(requested as PrintSectionKey[]);
}

interface PageProps {
  params: { symbol: string };
  searchParams: { sections?: string };
}

export default async function PrintPage({ params, searchParams }: PageProps) {
  const symbol = decodeURIComponent(params.symbol).trim();
  const sections = parseSections(searchParams.sections ?? null);
  const sectionList = ALL_SECTION_KEYS.filter((k) => sections.has(k));

  let dashboardData: DashboardData | null = null;
  let fetchError: string | null = null;
  try {
    dashboardData = await fetchAllData(symbol);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : '未知錯誤';
  }

  if (fetchError || !dashboardData) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold text-slate-100">無法載入 {symbol} 的資料</h1>
        <p className="mt-2 text-slate-400">{fetchError}</p>
      </main>
    );
  }

  // AI 報告（若需要）
  let aiReport = dashboardData.aiReport;
  if ((sections.has('aiAnalysis') || sections.has('researchReport')) && !aiReport) {
    try {
      aiReport = await fetchAiReport(dashboardData);
    } catch {
      aiReport = null;
    }
  }
  const finalData: DashboardData = { ...dashboardData, aiReport };

  const now = new Date();
  const reportDate = now.toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <main className="print-root bg-white text-slate-900">
      {/* Running header（每頁出現，除了封面與頁尾） */}
      <header className="pdf-page-header">
        <span className="pdf-page-header-left">{finalData.overview.symbol} · {finalData.overview.name}</span>
        <span className="pdf-page-header-right">Stock Research Report · {reportDate.split(' ')[0]}</span>
      </header>

      {/* 封面 */}
      <header className="pdf-page pdf-cover" data-pdf-block="cover">
        <div className="pdf-cover-inner">
          <div className="pdf-cover-eyebrow">Equity Research · Q3 2026 Initiation</div>
          <div className="pdf-cover-meta">
            <span className="pdf-cover-meta-item">{finalData.overview.exchange || 'TWSE'}</span>
            <span className="pdf-cover-meta-sep">·</span>
            <span className="pdf-cover-meta-item">{finalData.overview.industry || 'Technology'}</span>
            <span className="pdf-cover-meta-sep">·</span>
            <span className="pdf-cover-meta-item">{reportDate}</span>
          </div>

          <h1 className="pdf-cover-title">{finalData.overview.name}</h1>
          <div className="pdf-cover-symbol">{finalData.overview.symbol}</div>

          {/* Rating chip + 大字目標價 */}
          <div className="pdf-cover-rating-row">
            <div className={`pdf-cover-rating ${ratingClass(finalData.overview.analystRating)}`}>
              {ratingLabel(finalData.overview.analystRating)}
            </div>
            <div className="pdf-cover-rating-count">
              基於 {finalData.overview.analystCount ?? '—'} 位分析師共識 · Yahoo Finance
            </div>
          </div>

          {/* 三大關鍵數字 */}
          <div className="pdf-cover-keymetrics">
            <div className="pdf-cover-keymetric">
              <div className="pdf-cover-keymetric-label">現價</div>
              <div className="pdf-cover-keymetric-value">{formatPrice(finalData.overview.price, finalData.overview.currency)}</div>
            </div>
            <div className="pdf-cover-keymetric pdf-cover-keymetric-highlight">
              <div className="pdf-cover-keymetric-label">分析師公允目標價</div>
              <div className="pdf-cover-keymetric-value">
                {finalData.overview.analystTargetMean ? formatPrice(finalData.overview.analystTargetMean, finalData.overview.currency) : 'N/A'}
              </div>
              {finalData.overview.analystTargetMean && (
                <div className="pdf-cover-keymetric-delta">
                  {(() => {
                    const p = finalData.overview.premiumToAnalystTarget;
                    if (p === undefined) return '';
                    const sign = p >= 0 ? '+' : '';
                    return `${sign}${p.toFixed(1)}% 上行空間`;
                  })()}
                </div>
              )}
            </div>
            <div className="pdf-cover-keymetric">
              <div className="pdf-cover-keymetric-label">量化公允估值</div>
              <div className="pdf-cover-keymetric-value">
                {finalData.overview.fairValue ? formatPrice(finalData.overview.fairValue, finalData.overview.currency) : 'N/A'}
              </div>
            </div>
          </div>

          {/* Analyst byline */}
          <div className="pdf-cover-byline">
            <div className="pdf-cover-byline-label">分析師</div>
            <div className="pdf-cover-byline-name">Stock_Pro Quant Model</div>
            <div className="pdf-cover-byline-date">{reportDate}</div>
          </div>

          {/* 章節列表 */}
          <div className="pdf-cover-toc">
            <div className="pdf-cover-toc-title">本報告章節</div>
            <ol className="pdf-cover-toc-list">
              {sectionList.map((key, idx) => (
                <li key={key} className="pdf-cover-toc-item">
                  <span className="pdf-cover-toc-num">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="pdf-cover-toc-label">{PRINT_SECTION_LABELS[key]}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </header>

      {/* 隱藏：傳遞給 Playwright 的區塊清單 */}
      <div id="pdf-section-list" data-sections={sectionList.join(',')} className="hidden" />

      {/* 區塊們（client component 接收 server-fetched data） */}
      <PrintableSections data={finalData} sections={sectionList} />

      <footer className="pdf-page pdf-footer text-center text-xs text-slate-500" data-pdf-block="footer">
        Stock_Pro v0.1.0 · 報告生成時間：{reportDate} · 僅供研究參考
      </footer>
    </main>
  );
}

function ratingLabel(r: string | undefined): string {
  switch (r) {
    case 'strongBuy': return '強力買進';
    case 'buy': return '買進';
    case 'hold': return '持有';
    case 'sell': return '賣出';
    case 'strongSell': return '強力賣出';
    default: return '無評級';
  }
}

function ratingClass(r: string | undefined): string {
  if (r === 'strongBuy' || r === 'buy') return 'pdf-rating-bull';
  if (r === 'strongSell' || r === 'sell') return 'pdf-rating-bear';
  return 'pdf-rating-neutral';
}

function formatPrice(price: number, currency: string): string {
  if (currency === 'TWD') return `NT$${price.toLocaleString('zh-TW')}`;
  if (currency === 'USD') return `$${price.toLocaleString('en-US')}`;
  return `${price.toLocaleString()} ${currency}`;
}

async function fetchAllData(symbol: string): Promise<DashboardData> {
  const overview = await getStockOverview(symbol);
  const [financials, chart] = await Promise.all([
    getFinancials(symbol),
    getHistoricalPrices(symbol, '1Y'),
  ]);

  // 新聞與競爭對手（簡化版：給 mock，避免拖慢）
  const peerSymbols = getCompetitorsForSymbol(symbol).slice(0, 5).map((c) => c.symbol);
  let peerMetrics: Awaited<ReturnType<typeof getCompetitorMetrics>> | null = null;
  try {
    if (peerSymbols.length > 0) {
      peerMetrics = await getCompetitorMetrics(peerSymbols);
    }
  } catch { /* ignore */ }
  const competitors = peerMetrics
    ? {
        competitors: Array.from(peerMetrics.entries())
          .map(([sym, m]) => ({
            symbol: sym,
            name: getCompetitorsForSymbol(symbol).find((c) => c.symbol === sym)?.name ?? sym,
            marketCap: m.marketCap,
            revenue: undefined,
            grossMargin: m.grossMargin,
            netMargin: m.netMargin,
            eps: m.eps,
            pe: m.pe,
            roe: m.roe,
            dividendYield: m.dividendYield,
            growthRate: undefined,
            fiftyTwoWeekHigh: m.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: m.fiftyTwoWeekLow,
            marketPosition: getCompetitorsForSymbol(symbol).find((c) => c.symbol === sym)?.marketPosition ?? '',
            coreStrength: getCompetitorsForSymbol(symbol).find((c) => c.symbol === sym)?.coreStrength ?? '',
            coreRisk: getCompetitorsForSymbol(symbol).find((c) => c.symbol === sym)?.coreRisk ?? '',
          })),
        aiSummary: '',
      }
    : { competitors: [], aiSummary: '' };

  return {
    overview,
    financials,
    chart,
    news: [],
    competitors,
    // print 頁面是靜態快照，不需要 loading 狀態
    competitorsLoading: false,
    aiReport: null,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchAiReport(data: DashboardData): Promise<AIReport> {
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