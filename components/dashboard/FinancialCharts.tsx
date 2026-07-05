'use client';

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCurrency, formatPercent } from '@/lib/format';
import type { FinancialYear, StockOverview } from '@/lib/types';

interface FinancialChartsProps {
  overview: StockOverview;
  years: FinancialYear[];
  loading?: boolean;
  error?: string | null;
}

interface ChartDataPoint {
  year: string;
  value: number;
}

export function FinancialCharts({ overview, years, loading, error }: FinancialChartsProps) {
  if (error) {
    return (
      <Card title="財務趨勢圖">
        <ErrorMessage message={error} title="無法載入財務圖表" />
      </Card>
    );
  }

  if (loading || years.length === 0) {
    if (loading) {
      return (
        <Card title="財務趨勢圖" subtitle="營收、淨利、EPS、毛利率、現金流">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </Card>
      );
    }
    // years 空但不是 loading → 真實無資料
    const isTaiwan = overview.symbol.endsWith('.TW') || overview.symbol.endsWith('.TWO');
    const isEtf = /^\d{4,6}\.TWO?$/.test(overview.symbol);
    const isNewListing = (overview.founded ?? '') >= '2026';
    const reason = isEtf
      ? 'ETF 通常不揭露傳統三表（營收/淨利/現金流），本區塊需改由「成分股與淨值」視角分析。'
      : isNewListing
        ? '該股票 2026 年才掛牌上市，公開財報尚未申報完成。'
        : isTaiwan
          ? '台股詳細三表資料需付費資料源（如 TEJ、CMoney），本專案目前未整合。'
          : '目前免費 API 無法取得此股票的詳細財務三表。';
    return (
      <Card title="財務趨勢圖" subtitle="營收、淨利、EPS、毛利率、現金流">
        <EmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title="目前無財務三表資料"
          description={reason}
        />
      </Card>
    );
  }

  const sortedYears = [...years].sort((a, b) => a.year - b.year);
  const data = sortedYears.map((y) => ({ ...y, year: `${y.year}` }));

  const revenueData: ChartDataPoint[] = sortedYears.map((y) => ({ year: `${y.year}`, value: y.revenue }));
  const netIncomeData: ChartDataPoint[] = sortedYears.map((y) => ({ year: `${y.year}`, value: y.netIncome }));
  const epsData: ChartDataPoint[] = sortedYears.map((y) => ({ year: `${y.year}`, value: y.eps }));
  const marginData = sortedYears.map((y) => ({
    year: `${y.year}`,
    value: y.grossMargin,
    netMargin: y.netMargin,
  }));
  const cashflowData = sortedYears.map((y) => ({
    year: `${y.year}`,
    operating: y.operatingCashFlow,
    free: y.freeCashFlow,
  }));

  return (
    <Card title="財務趨勢圖" subtitle={`近 ${sortedYears.length} 年 · ${overview.currency}`}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartBox title="營收趨勢" data={revenueData} color="#3b82f6" format="currency" currency={overview.currency} />
        <ChartBox title="淨利趨勢" data={netIncomeData} color="#10b981" format="currency" currency={overview.currency} />
        <ChartBox title="EPS 趨勢" data={epsData} color="#a78bfa" format="number" currency={overview.currency} />

        {/* 毛利率 + 淨利率 */}
        <Card padding="sm">
          <h4 className="mb-2 text-sm font-semibold text-slate-200">毛利率 vs 淨利率</h4>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={marginData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} width={45} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name === 'value' ? '毛利率' : '淨利率']}
                />
                <Line type="monotone" dataKey="value" name="毛利率" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="netMargin" name="淨利率" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 現金流 */}
        <Card padding="sm" className="lg:col-span-2">
          <h4 className="mb-2 text-sm font-semibold text-slate-200">現金流變化（營運現金流 vs 自由現金流）</h4>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflowData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, overview.currency)} width={70} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [formatCurrency(v, overview.currency), name === 'operating' ? '營運現金流' : '自由現金流']}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Bar dataKey="operating" name="operating" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {cashflowData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.operating >= 0 ? '#3b82f6' : '#ef4444'} />
                  ))}
                </Bar>
                <Bar dataKey="free" name="free" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {cashflowData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.free >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </Card>
  );
}

interface ChartBoxProps {
  title: string;
  data: ChartDataPoint[];
  color: string;
  format: 'currency' | 'number' | 'percent';
  currency: string;
}

function ChartBox({ title, data, color, format, currency }: ChartBoxProps) {
  const hasNegative = data.some((d) => d.value < 0);
  return (
    <Card padding="sm">
      <h4 className="mb-2 text-sm font-semibold text-slate-200">{title}</h4>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => format === 'currency' ? formatCurrency(v, currency) : v.toFixed(2)}
              width={70}
            />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [format === 'currency' ? formatCurrency(v, currency) : v.toFixed(2), title]}
            />
            {hasNegative && <ReferenceLine y={0} stroke="#475569" />}
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.value >= 0 ? color : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}