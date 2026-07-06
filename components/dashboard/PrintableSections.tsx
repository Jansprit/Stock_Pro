'use client';

import dynamic from 'next/dynamic';
import {
  ALL_SECTION_KEYS,
  PrintSectionKey,
  PRINT_SECTION_LABELS,
} from '@/lib/print-sections';
import type { DashboardData } from '@/lib/types';

// 所有 dashboard 元件都改用 dynamic import (ssr: false) 避免 server-side Symbol 衝突
// 因為 client component 不能直接被 server component named import
const StockOverviewCard = dynamic(() => import('@/components/dashboard/StockOverviewCard').then((m) => m.StockOverviewCard), { ssr: false });
const ValuationPanel = dynamic(() => import('@/components/dashboard/ValuationPanel').then((m) => m.ValuationPanel), { ssr: false });
const PriceChart = dynamic(() => import('@/components/dashboard/PriceChart').then((m) => m.PriceChart), { ssr: false });
const FinancialCharts = dynamic(() => import('@/components/dashboard/FinancialCharts').then((m) => m.FinancialCharts), { ssr: false });
const CompanyProfile = dynamic(() => import('@/components/dashboard/CompanyProfile').then((m) => m.CompanyProfile), { ssr: false });
const FinancialTable = dynamic(() => import('@/components/dashboard/FinancialTable').then((m) => m.FinancialTable), { ssr: false });
const NewsList = dynamic(() => import('@/components/dashboard/NewsList').then((m) => m.NewsList), { ssr: false });
const CompetitorTable = dynamic(() => import('@/components/dashboard/CompetitorTable').then((m) => m.CompetitorTable), { ssr: false });
const AIAnalysisPanel = dynamic(() => import('@/components/dashboard/AIAnalysisPanel').then((m) => m.AIAnalysisPanel), { ssr: false });
const ResearchReport = dynamic(() => import('@/components/dashboard/ResearchReport').then((m) => m.ResearchReport), { ssr: false });

interface Props {
  data: DashboardData;
  sections: PrintSectionKey[];
}

/**
 * 接收 server 端預先 fetch 的資料，依使用者選擇渲染對應區塊。
 * 用 client component 是為了避免 server 直接 import 多個 client component 時的 named-export 限制。
 */
export function PrintableSections({ data, sections }: Props) {
  const { overview, financials, chart, news, competitors, aiReport } = data;
  const sectionSet = new Set(sections);
  // 動態章節編號：依使用者選擇順序編 1, 2, 3, ...
  const orderedKeys = ALL_SECTION_KEYS.filter((k) => sectionSet.has(k));
  const indexOf = (key: PrintSectionKey) => orderedKeys.indexOf(key) + 1;

  return (
    <>
      {/* 區塊們 */}
      {sectionSet.has('overview') && (
        <section className="pdf-page" data-pdf-section="overview">
          <SectionHeader index={indexOf('overview')} title={PRINT_SECTION_LABELS.overview} />
          <div className="data-pdf-block" data-pdf-block="overview">
            <StockOverviewCard overview={overview} />
          </div>
        </section>
      )}

      {sectionSet.has('valuation') && (
        <section className="pdf-page" data-pdf-section="valuation">
          <SectionHeader index={indexOf('valuation')} title={PRINT_SECTION_LABELS.valuation} />
          <div className="data-pdf-block" data-pdf-block="valuation">
            <ValuationPanel overview={overview} />
          </div>
        </section>
      )}

      {sectionSet.has('priceChart') && (
        <section className="pdf-page" data-pdf-section="priceChart">
          <SectionHeader index={indexOf('priceChart')} title={PRINT_SECTION_LABELS.priceChart} />
          <div className="data-pdf-block" data-pdf-block="priceChart">
            <PriceChart
              symbol={overview.symbol}
              overview={overview}
              initialData={chart}
              initialRange="1Y"
            />
          </div>
        </section>
      )}

      {sectionSet.has('financialCharts') && financials.years.length > 0 && (
        <section className="pdf-page" data-pdf-section="financialCharts">
          <SectionHeader index={indexOf('financialCharts')} title={PRINT_SECTION_LABELS.financialCharts} />
          <div className="data-pdf-block" data-pdf-block="financialCharts">
            <FinancialCharts overview={overview} years={financials.years} />
          </div>
        </section>
      )}

      {sectionSet.has('companyProfile') && (
        <section className="pdf-page" data-pdf-section="companyProfile">
          <SectionHeader index={indexOf('companyProfile')} title={PRINT_SECTION_LABELS.companyProfile} />
          <div className="data-pdf-block grid grid-cols-1 gap-4 lg:grid-cols-3" data-pdf-block="companyProfile">
            <div className="lg:col-span-1">
              <CompanyProfile overview={overview} />
            </div>
            <div className="lg:col-span-2">
              <FinancialTable overview={overview} years={financials.years} />
            </div>
          </div>
        </section>
      )}

      {sectionSet.has('aiAnalysis') && aiReport && (
        <section className="pdf-page" data-pdf-section="aiAnalysis">
          <SectionHeader index={indexOf('aiAnalysis')} title={PRINT_SECTION_LABELS.aiAnalysis} />
          <div className="data-pdf-block" data-pdf-block="aiAnalysis">
            <AIAnalysisPanel report={aiReport} stockName={overview.name} />
          </div>
        </section>
      )}

      {sectionSet.has('news') && news.length > 0 && (
        <section className="pdf-page" data-pdf-section="news">
          <SectionHeader index={indexOf('news')} title={PRINT_SECTION_LABELS.news} />
          <div className="data-pdf-block space-y-3" data-pdf-block="news-list">
            <NewsList news={news} />
          </div>
        </section>
      )}

      {sectionSet.has('competitors') && competitors.competitors.length > 0 && (
        <section className="pdf-page" data-pdf-section="competitors">
          <SectionHeader index={indexOf('competitors')} title={PRINT_SECTION_LABELS.competitors} />
          <div className="data-pdf-block" data-pdf-block="competitors">
            <CompetitorTable data={competitors} baseSymbol={overview.symbol} />
          </div>
        </section>
      )}

      {sectionSet.has('researchReport') && aiReport && (
        <section className="pdf-page" data-pdf-section="researchReport">
          <SectionHeader index={indexOf('researchReport')} title={PRINT_SECTION_LABELS.researchReport} />
          <div className="data-pdf-block" data-pdf-block="researchReport">
            <ResearchReport report={aiReport} stockName={overview.name} defaultExpanded />
          </div>
        </section>
      )}

      {/* 免責聲明（4 段：分析師認證、利益衝突、方法論、風險） */}
      <section className="pdf-page pdf-disclaimer" data-pdf-block="disclaimer">
        <SectionHeader index={orderedKeys.length + 1} title="重要聲明與方法論" />
        <div className="pdf-disclaimer-block">
          <div className="pdf-disclaimer-section">
            <div className="pdf-disclaimer-heading">1. 分析師認證 (Analyst Certification)</div>
            <p>
              本報告由 Stock_Pro 量化模型自動生成，所有數據與結論基於公開資訊源（TWSE 公開資訊觀測站、SEC EDGAR、Yahoo Finance），
              並透過標準化估值模型（DCF / DDM / P-E / P-S / EV-EBITDA）運算。我們保證報告中所有數字皆來自上述公開源，
              未經人工主觀調整。
            </p>
          </div>
          <div className="pdf-disclaimer-section">
            <div className="pdf-disclaimer-heading">2. 利益衝突聲明 (Conflict of Interest)</div>
            <p>
              Stock_Pro 為獨立第三方分析平台。本報告作者及關聯方目前並無持有本報告所述標的之任何部位。
              本平台未接受標的公司之任何形式委託、贊助或報酬，亦無涉及該公司之承銷、顧問、經紀等業務。
              </p>
          </div>
          <div className="pdf-disclaimer-section">
            <div className="pdf-disclaimer-heading">3. 估值方法論 (Methodology)</div>
            <p>
              量化公允價值 = DCF (5Y FCF 折現 + Gordon 終值) × 30% + DDM (SGR 成長 × Gordon) × 15% +
              P/E 倍數法 × 25% + P/S 倍數法 × 15% + EV/EBITDA × 15%。
              WACC = 無風險利率 (10Y 美債) + β × 5.5% ERP。缺少資料的模型自動跳過，權重按剩餘模型比例重分配。
              <strong>本估值不含分析師產業拜訪、供應鏈訪查、質化調整等前瞻判斷</strong>，僅供量化模型基準比較。
            </p>
          </div>
          <div className="pdf-disclaimer-section">
            <div className="pdf-disclaimer-heading">4. 風險聲明 (Risk Disclosure)</div>
            <p>
              投資有風險，過去績效不代表未來表現。本報告內容僅供學術研究與教育用途，<strong>不構成任何投資建議</strong>。
              使用者應自行評估自身財務狀況、風險承受能力，並諮詢合格之財務顧問。Stock_Pro 對任何因使用本報告所造成之損失不負任何責任。
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHeader({ index, title }: { index: number; title: string }) {
  return (
    <div className="pdf-section-header">
      <span className="pdf-section-index">{String(index).padStart(2, '0')}</span>
      <span className="pdf-section-title">{title}</span>
    </div>
  );
}