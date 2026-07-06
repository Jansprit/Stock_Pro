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

      {/* 數據網格（4×2 重組：左 4 欄重點、右 4 欄次要） */}
      <div className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-slate-800 pt-5 sm:grid-cols-4 lg:grid-cols-4">
        <Metric
          label="市值"
          value={overview.marketCap ? formatCurrency(overview.marketCap, overview.currency) : 'N/A'}
          delta={positionIn52w(overview)}
        />
        <Metric
          label="本益比 (TTM)"
          value={overview.trailingPE?.toFixed(2) ?? 'N/A'}
        />
        <Metric
          label="EPS (TTM)"
          value={overview.eps?.toFixed(2) ?? 'N/A'}
        />
        <Metric
          label="52週區間"
          value={
            overview.fiftyTwoWeekLow !== undefined && overview.fiftyTwoWeekHigh !== undefined
              ? `${formatCurrency(overview.fiftyTwoWeekLow, overview.currency)} ~ ${formatCurrency(overview.fiftyTwoWeekHigh, overview.currency)}`
              : 'N/A'
          }
        />
        <Metric
          label="成交量"
          value={formatLargeNumber(overview.volume)}
          subValue={overview.avgVolume ? `均 ${formatLargeNumber(overview.avgVolume)}` : undefined}
        />
        <Metric
          label="日內區間"
          value={`${formatCurrency(overview.dayLow, overview.currency)} ~ ${formatCurrency(overview.dayHigh, overview.currency)}`}
          delta={intraDayPosition(overview)}
        />
        <Metric
          label="Beta"
          value={overview.beta?.toFixed(2) ?? 'N/A'}
          subValue={overview.beta ? (overview.beta >= 1 ? '波動大於大盤' : '波動小於大盤') : undefined}
        />
        <Metric
          label="殖利率"
          value={overview.dividendYield !== undefined ? `${overview.dividendYield.toFixed(2)}%` : 'N/A'}
        />
      </div>
    </Card>
  );
}

/** 計算現價相對於 52 週區間的位置（% from low） */
function positionIn52w(o: StockOverview): { pct: number; label: string } | undefined {
  if (o.fiftyTwoWeekLow === undefined || o.fiftyTwoWeekHigh === undefined) return undefined;
  const span = o.fiftyTwoWeekHigh - o.fiftyTwoWeekLow;
  if (span <= 0) return undefined;
  const pct = ((o.price - o.fiftyTwoWeekLow) / span) * 100;
  return {
    pct: Math.max(0, Math.min(100, pct)),
    label: pct >= 80 ? '近 52週高' : pct <= 20 ? '近 52週低' : '中間',
  };
}

/** 計算現價在日內區間的位置 */
function intraDayPosition(o: StockOverview): { pct: number; label: string } | undefined {
  const span = o.dayHigh - o.dayLow;
  if (span <= 0) return undefined;
  const pct = ((o.price - o.dayLow) / span) * 100;
  return {
    pct: Math.max(0, Math.min(100, pct)),
    label: pct >= 80 ? '近盤中高' : pct <= 20 ? '近盤中低' : '中間',
  };
}

function Metric({ label, value, delta, subValue }: {
  label: string;
  value: string;
  delta?: { pct: number; label: string };
  subValue?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        {delta && (
          <span className={`text-[10px] font-medium ${delta.pct >= 80 ? 'text-bear-400' : delta.pct <= 20 ? 'text-bull-400' : 'text-slate-500'}`}>
            {delta.label}
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-100">{value}</div>
      {/* 位置進度條 */}
      {delta && (
        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full ${delta.pct >= 80 ? 'bg-bear-500' : delta.pct <= 20 ? 'bg-bull-500' : 'bg-slate-500'}`}
            style={{ width: `${delta.pct}%` }}
          />
        </div>
      )}
      {subValue && (
        <div className="mt-0.5 text-[10px] text-slate-500">{subValue}</div>
      )}
    </div>
  );
}