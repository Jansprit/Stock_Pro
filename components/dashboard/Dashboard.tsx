'use client';

import { RefreshCw, Sparkles } from 'lucide-react';
import { StockOverviewCard } from './StockOverviewCard';
import { PriceChart } from './PriceChart';
import { FinancialCharts } from './FinancialCharts';
import { FinancialTable } from './FinancialTable';
import { CompanyProfile } from './CompanyProfile';
import { NewsList } from './NewsList';
import { CompetitorTable } from './CompetitorTable';
import { AIAnalysisPanel } from './AIAnalysisPanel';
import { ResearchReport } from './ResearchReport';
import { ValuationPanel } from './ValuationPanel';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import type { DashboardData } from '@/lib/types';

interface DashboardProps {
  data: DashboardData;
  aiError?: string | null;
  onRefresh: () => void;
}

export function Dashboard({ data, aiError, onRefresh }: DashboardProps) {
  const { overview, financials, chart, news, competitors, aiReport, fetchedAt } = data;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 頂部：總覽 + 重整 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Tag variant="default">資料時間：{new Date(fetchedAt).toLocaleString('zh-TW')}</Tag>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="
            inline-flex items-center gap-1.5 rounded-md border border-slate-700
            bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300
            transition-colors hover:bg-slate-700 hover:text-slate-100
          "
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重新整理
        </button>
      </div>

      {/* 總覽卡片 */}
      <StockOverviewCard overview={overview} />

      {/* 估值分析（公允價值 + 分析師目標） */}
      <ValuationPanel overview={overview} />

      {/* 股價走勢 */}
      <PriceChart symbol={overview.symbol} overview={overview} initialData={chart} initialRange="1Y" />

      {/* 財務圖表 */}
      <FinancialCharts overview={overview} years={financials.years} />

      {/* AI 分析（最優先顯示） */}
      {aiReport ? (
        <AIAnalysisPanel report={aiReport} stockName={overview.name} />
      ) : aiError ? (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-400" />
              <span>AI 分析</span>
            </div>
          }
        >
          <ErrorMessage
            title="AI 分析暫時無法取得"
            message={aiError + ' 您仍可查看下方財務數據與新聞自行判斷。'}
          />
        </Card>
      ) : null}

      {/* 公司基本資料 + 財務數據表（並排） */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <CompanyProfile overview={overview} />
        </div>
        <div className="lg:col-span-2">
          <FinancialTable overview={overview} years={financials.years} />
        </div>
      </div>

      {/* 新聞 */}
      <NewsList news={news} />

      {/* 競爭對手比較 */}
      <CompetitorTable data={competitors} baseSymbol={overview.symbol} />

      {/* 完整研究報告（摺疊式） */}
      {aiReport && <ResearchReport report={aiReport} stockName={overview.name} />}
    </div>
  );
}