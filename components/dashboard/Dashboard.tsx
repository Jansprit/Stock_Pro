'use client';

import { useState } from 'react';
import { RefreshCw, Sparkles, FileDown } from 'lucide-react';
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
import { PrintSectionSelector } from './PrintSectionSelector';
import { usePrintSections } from '@/lib/hooks/usePrintSections';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { AiLoading } from '@/components/ui/AiLoading';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import type { DashboardData } from '@/lib/types';

interface DashboardProps {
  data: DashboardData;
  aiError?: string | null;
  isAiLoading?: boolean;
  onRefresh: () => void;
}

export function Dashboard({ data, aiError, isAiLoading = false, onRefresh }: DashboardProps) {
  const { overview, financials, chart, news, competitors, aiReport, fetchedAt } = data;
  const print = usePrintSections(overview.symbol);
  const [showPdfError, setShowPdfError] = useState<string | null>(null);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 頂部：總覽 + 重整 + 下載 PDF */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Tag variant="default">資料時間：{new Date(fetchedAt).toLocaleString('zh-TW')}</Tag>
        </div>
        <div className="flex items-center gap-2">
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
          {/* PDF 按鈕暫時隱藏（功能保留，重啟用改 {false &&} 為 {true &&}） */}
          {false && (
            <button
              type="button"
              onClick={() => {
                setShowPdfError(null);
                print.open();
              }}
              className="
                inline-flex items-center gap-1.5 rounded-md border border-brand-500/40
                bg-brand-500/10 px-3 py-1.5 text-xs text-brand-300
                transition-colors hover:bg-brand-500/20 hover:text-brand-100
              "
            >
              <FileDown className="h-3.5 w-3.5" />
              下載 PDF 報告
            </button>
          )}
        </div>
      </div>

      {/* PDF 錯誤提示 */}
      {showPdfError && (
        <ErrorMessage
          title="PDF 生成失敗"
          message={showPdfError}
        />
      )}

      {/* 列印區塊選擇 Modal */}
      {print.isOpen && (
        <PrintSectionSelector
          symbol={overview.symbol}
          stockName={overview.name}
          selected={print.selected}
          onChange={print.setSelected}
          generating={print.generating}
          onConfirm={async () => {
            const ok = await print.generatePdf();
            if (!ok && print.error) setShowPdfError(print.error);
          }}
          onClose={print.close}
        />
      )}

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
      ) : isAiLoading ? (
        <AiLoading
          title="AI 分析報告生成中"
          subtitle={`正在分析 ${overview.symbol} ${overview.name} 的 7 維度評分`}
        />
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
      <CompetitorTable data={competitors} baseSymbol={overview.symbol} aiSummaryLoading={isAiLoading && !competitors.aiSummary} />

      {/* 完整研究報告（摺疊式） */}
      {aiReport ? (
        <ResearchReport report={aiReport} stockName={overview.name} />
      ) : isAiLoading ? (
        <AiLoading
          title="完整研究報告生成中"
          subtitle={`正在為 ${overview.symbol} ${overview.name} 撰寫財務分析、競爭分析、新聞影響與公司優勢`}
        />
      ) : null}
    </div>
  );
}