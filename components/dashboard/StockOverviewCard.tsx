'use client';

import { TrendingUp, TrendingDown, Building2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { formatCurrency, formatFullCurrency, formatPercent, formatLargeNumber } from '@/lib/format';
import type { StockOverview } from '@/lib/types';

interface StockOverviewCardProps {
  overview: StockOverview;
}

export function StockOverviewCard({ overview }: StockOverviewCardProps) {
  const isPositive = overview.change >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;
  const trendColor = isPositive ? 'text-bull-500' : 'text-bear-500';

  return (
    <Card padding="lg" className="relative overflow-hidden">
      {/* 背景裝飾 */}
      <div
        className={`
          pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-10 blur-3xl
          ${isPositive ? 'bg-bull-500' : 'bg-bear-500'}
        `}
      />

      <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
        {/* 左：名稱 + 代碼 */}
        <div>
          <div className="flex items-center gap-2 text-slate-400">
            <Building2 className="h-4 w-4" />
            <span className="text-xs">{overview.exchange}</span>
          </div>
          <h2 className="mt-1 text-xl font-bold text-slate-100 sm:text-2xl">
            {overview.name}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-sm font-semibold text-slate-300">
              {overview.symbol}
            </span>
            {overview.sector && (
              <Tag variant="default">{overview.sector}</Tag>
            )}
            {overview.industry && (
              <Tag variant="brand">{overview.industry}</Tag>
            )}
          </div>
        </div>

        {/* 右：現價 + 漲跌 */}
        <div className="lg:text-right">
          <div className="text-sm text-slate-400">現價</div>
          <div className="mt-0.5 flex items-baseline gap-2 lg:justify-end">
            <span className="text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">
              {formatFullCurrency(overview.price, overview.currency)}
            </span>
          </div>
          <div className={`mt-1 flex items-center gap-1.5 text-sm ${trendColor}`}>
            <TrendIcon className="h-4 w-4" />
            <span className="font-semibold">
              {isPositive ? '+' : ''}{overview.change.toFixed(2)}
            </span>
            <span className="font-semibold">
              ({formatPercent(overview.changePercent, 2, true)})
            </span>
          </div>
        </div>
      </div>

      {/* 數據網格 */}
      <div className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-800 pt-5 sm:grid-cols-4 lg:grid-cols-4">
        <Metric label="市值" value={overview.marketCap ? formatCurrency(overview.marketCap, overview.currency) : 'N/A'} />
        <Metric label="本益比 (TTM)" value={overview.trailingPE?.toFixed(2) ?? 'N/A'} />
        <Metric label="EPS (TTM)" value={overview.eps?.toFixed(2) ?? 'N/A'} />
        <Metric label="52週區間" value={
          overview.fiftyTwoWeekLow !== undefined && overview.fiftyTwoWeekHigh !== undefined
            ? `${formatCurrency(overview.fiftyTwoWeekLow, overview.currency)} ~ ${formatCurrency(overview.fiftyTwoWeekHigh, overview.currency)}`
            : 'N/A'
        } />
        <Metric label="成交量" value={formatLargeNumber(overview.volume)} />
        <Metric label="平均成交量" value={overview.avgVolume ? formatLargeNumber(overview.avgVolume) : 'N/A'} />
        <Metric label="日內區間" value={
          `${formatCurrency(overview.dayLow, overview.currency)} ~ ${formatCurrency(overview.dayHigh, overview.currency)}`
        } />
        <Metric label="Beta" value={overview.beta?.toFixed(2) ?? 'N/A'} />
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}