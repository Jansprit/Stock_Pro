'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Table2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { formatCurrency, formatPercent, valueColorClass } from '@/lib/format';
import type { FinancialYear, StockOverview } from '@/lib/types';

interface FinancialTableProps {
  overview: StockOverview;
  years: FinancialYear[];
  loading?: boolean;
  error?: string | null;
}

type TabKey = 'profitability' | 'growth' | 'safety';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'profitability', label: '獲利能力' },
  { key: 'growth', label: '成長能力' },
  { key: 'safety', label: '財務安全性' },
];

export function FinancialTable({ overview, years, loading, error }: FinancialTableProps) {
  const [tab, setTab] = useState<TabKey>('profitability');

  if (error) {
    return (
      <Card title="財務數據表">
        <ErrorMessage message={error} title="無法載入財務數據" />
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="財務數據表">
        <Skeleton className="h-48 w-full" />
      </Card>
    );
  }

  if (years.length === 0) {
    const isTaiwan = overview.symbol.endsWith('.TW') || overview.symbol.endsWith('.TWO');
    const isEtf = /^\d{4,6}\.TWO?$/.test(overview.symbol);
    const isNewListing = (overview.founded ?? '') >= '2026';
    const reason = isEtf
      ? 'ETF 不揭露傳統三表，改以「成分股與淨值」視角評估。'
      : isNewListing
        ? '該股票 2026 年才掛牌上市，公開財報尚未申報完成。'
        : isTaiwan
          ? '台股詳細三表資料需付費資料源（如 TEJ、CMoney），本專案目前未整合。'
          : '目前免費 API 無法取得此股票的詳細財務三表。';
    return (
      <Card title="財務數據表">
        <EmptyState
          icon={<Table2 className="h-10 w-10" />}
          title="目前無財務三表資料"
          description={reason}
        />
      </Card>
    );
  }

  const sortedYears = [...years].sort((a, b) => b.year - a.year); // 由近到遠
  const oldest = sortedYears[sortedYears.length - 1];

  // 計算 YoY 成長率
  const growthRows = sortedYears.map((y) => {
    const prev = sortedYears.find((p) => p.year === y.year - 1);
    return {
      year: y.year,
      revenue: prev ? ((y.revenue - prev.revenue) / Math.abs(prev.revenue || 1)) * 100 : 0,
      netIncome: prev ? ((y.netIncome - prev.netIncome) / Math.abs(prev.netIncome || 1)) * 100 : 0,
      eps: prev && prev.eps !== 0 ? ((y.eps - prev.eps) / Math.abs(prev.eps)) * 100 : 0,
    };
  });

  return (
    <Card
      title="財務數據分析"
      subtitle={`近 ${sortedYears.length} 年（${oldest?.year ?? ''} ~ ${sortedYears[0]?.year}）`}
    >
      {/* Tabs */}
      <div className="no-print-tab mb-4 flex gap-2 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`
              relative px-3 py-2 text-sm font-medium transition-colors
              ${tab === t.key ? 'text-brand-400' : 'text-slate-400 hover:text-slate-200'}
            `}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-500" />
            )}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        {tab === 'profitability' && (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="py-2 pr-4 font-medium">指標</th>
                {sortedYears.map((y) => (
                  <th key={y.year} className="px-3 py-2 text-right font-medium">{y.year}</th>
                ))}
              </tr>
            </thead>
            <tbody data-pdf-block="financial-rows">
              <Row label="營收" cells={sortedYears.map((y) => formatCurrency(y.revenue, overview.currency))} />
              <Row label="毛利" cells={sortedYears.map((y) => formatCurrency(y.grossProfit, overview.currency))} />
              <Row label="營業利益" cells={sortedYears.map((y) => formatCurrency(y.operatingIncome, overview.currency))} />
              <Row label="淨利" cells={sortedYears.map((y) => formatCurrency(y.netIncome, overview.currency))} highlight />
              <Row label="EPS" cells={sortedYears.map((y) => y.eps.toFixed(2))} />
              <Row label="毛利率" cells={sortedYears.map((y) => `${y.grossMargin.toFixed(2)}%`)} positive />
              <Row label="營業利益率" cells={sortedYears.map((y) => `${y.operatingMargin.toFixed(2)}%`)} />
              <Row label="淨利率" cells={sortedYears.map((y) => `${y.netMargin.toFixed(2)}%`)} positive />
              <Row label="ROE" cells={sortedYears.map((y) => `${y.roe.toFixed(2)}%`)} positive />
              <Row label="ROA" cells={sortedYears.map((y) => `${y.roa.toFixed(2)}%`)} positive />
            </tbody>
          </table>
        )}

        {tab === 'growth' && (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="py-2 pr-4 font-medium">成長指標</th>
                {sortedYears.map((y) => (
                  <th key={y.year} className="px-3 py-2 text-right font-medium">{y.year}</th>
                ))}
              </tr>
            </thead>
            <tbody data-pdf-block="financial-rows-growth">
              <Row
                label="營收 YoY"
                cells={growthRows.map((g) => formatPercent(g.revenue, 2, true))}
                colored
              />
              <Row
                label="淨利 YoY"
                cells={growthRows.map((g) => formatPercent(g.netIncome, 2, true))}
                colored
              />
              <Row
                label="EPS YoY"
                cells={growthRows.map((g) => formatPercent(g.eps, 2, true))}
                colored
              />
              <tr className="border-t border-slate-800">
                <td colSpan={sortedYears.length + 1} className="pt-3 text-xs text-slate-500">
                  <span className="font-medium text-slate-300">AI 觀察：</span>
                  {analyzeGrowth(years)}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {tab === 'safety' && (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="py-2 pr-4 font-medium">指標</th>
                {sortedYears.map((y) => (
                  <th key={y.year} className="px-3 py-2 text-right font-medium">{y.year}</th>
                ))}
              </tr>
            </thead>
            <tbody data-pdf-block="financial-rows-safety">
              <Row label="總資產" cells={sortedYears.map((y) => formatCurrency(y.totalAssets, overview.currency))} />
              <Row label="總負債" cells={sortedYears.map((y) => formatCurrency(y.totalLiabilities, overview.currency))} />
              <Row label="股東權益" cells={sortedYears.map((y) => formatCurrency(y.totalEquity, overview.currency))} />
              <Row label="營運現金流" cells={sortedYears.map((y) => formatCurrency(y.operatingCashFlow, overview.currency))} />
              <Row label="自由現金流" cells={sortedYears.map((y) => formatCurrency(y.freeCashFlow, overview.currency))} highlight />
              <Row label="負債比 (D/E)" cells={sortedYears.map((y) => `${y.debtToEquity.toFixed(2)}%`)} warning />
              {sortedYears[0]?.currentRatio !== undefined && (
                <Row label="流動比" cells={sortedYears.map((y) => y.currentRatio?.toFixed(2) ?? 'N/A')} />
              )}
              <tr className="border-t border-slate-800">
                <td colSpan={sortedYears.length + 1} className="pt-3 text-xs text-slate-500">
                  <span className="font-medium text-slate-300">AI 觀察：</span>
                  {analyzeSafety(years)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

interface RowProps {
  label: string;
  cells: string[];
  highlight?: boolean;
  positive?: boolean;
  warning?: boolean;
  colored?: boolean;
}

function Row({ label, cells, highlight, positive, warning, colored }: RowProps) {
  return (
    <tr className={`border-b border-slate-800/50 ${highlight ? 'bg-slate-800/30' : ''}`}>
      <td className="py-2 pr-4 text-slate-400">{label}</td>
      {cells.map((c, idx) => {
        let cls = 'text-slate-100';
        if (colored) {
          const num = parseFloat(c.replace(/[^-\d.]/g, ''));
          cls = valueColorClass(num);
        }
        if (positive && (c.includes('%'))) {
          const num = parseFloat(c);
          if (num > 30) cls = 'text-bull-400';
        }
        if (warning) {
          const num = parseFloat(c);
          if (num > 100) cls = 'text-bear-400';
          else if (num > 60) cls = 'text-amber-400';
        }
        return (
          <td key={idx} className={`px-3 py-2 text-right font-mono text-sm font-medium ${cls}`}>
            {c}
          </td>
        );
      })}
    </tr>
  );
}

/** 簡易成長分析（規則引擎，作為 AI 報告未完成時的 fallback） */
function analyzeGrowth(years: FinancialYear[]): string {
  if (years.length < 2) return '需要更多年度資料才能判斷成長趨勢。';
  const sorted = [...years].sort((a, b) => a.year - b.year);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const revenueCAGR = (Math.pow(last.revenue / Math.max(first.revenue, 1), 1 / (sorted.length - 1)) - 1) * 100;
  const netCAGR = (Math.pow(last.netIncome / Math.max(first.netIncome, 1), 1 / (sorted.length - 1)) - 1) * 100;

  if (revenueCAGR > 15) return `營收年複合成長率約 ${revenueCAGR.toFixed(1)}%，屬於高速成長公司。`;
  if (revenueCAGR > 5) return `營收年複合成長率約 ${revenueCAGR.toFixed(1)}%，呈現穩健成長。`;
  if (revenueCAGR > 0) return `營收年複合成長率約 ${revenueCAGR.toFixed(1)}%，成長平緩。`;
  return `營收呈現下滑趨勢（CAGR ${revenueCAGR.toFixed(1)}%），需特別關注。`;
}

/** 簡易財務安全分析 */
function analyzeSafety(years: FinancialYear[]): string {
  const last = [...years].sort((a, b) =>b.year - a.year)[0];
  if (!last) return '無資料';

  const debt = last.debtToEquity;
  const cash = last.operatingCashFlow;
  const fcf = last.freeCashFlow;

  const parts: string[] = [];
  if (debt < 50) parts.push('負債比偏低，財務結構穩健');
  else if (debt < 100) parts.push('負債比適中');
  else parts.push('負債比偏高，需注意財務槓桿');

  if (cash > 0) parts.push('營運現金流為正');
  else parts.push('營運現金流為負，需關注');

  if (fcf > 0) parts.push('自由現金流為正');
  else parts.push('自由現金流為負');

  return parts.join('；') + '。';
}