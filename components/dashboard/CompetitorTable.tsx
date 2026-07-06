import { Users, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCurrency, formatPercent } from '@/lib/format';
import type { CompetitorData } from '@/lib/types';

interface CompetitorTableProps {
  data: CompetitorData;
  baseSymbol: string;
  loading?: boolean;
  error?: string | null;
}

export function CompetitorTable({ data, baseSymbol, loading, error }: CompetitorTableProps) {
  if (error) {
    return (
      <Card title="競爭對手比較">
        <ErrorMessage message={error} title="無法載入競爭對手資料" />
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="競爭對手比較">
        <Skeleton className="h-64 w-full" />
      </Card>
    );
  }

  if (data.competitors.length === 0) {
    return (
      <Card title="競爭對手比較">
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="無競爭對手資料"
          description={`${baseSymbol} 不在預設競爭對手資料表中，AI 報告中將以通用方式討論產業競爭。`}
        />
      </Card>
    );
  }

  return (
    <Card
      title="競爭對手比較"
      subtitle={`${baseSymbol} vs 主要競爭對手（共 ${data.competitors.length} 家）`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
              <th className="py-2 pr-3 font-medium">公司</th>
              <th className="px-3 py-2 text-right font-medium">市值</th>
              <th className="px-3 py-2 text-right font-medium">毛利率</th>
              <th className="px-3 py-2 text-right font-medium">淨利率</th>
              <th className="px-3 py-2 text-right font-medium">EPS</th>
              <th className="px-3 py-2 text-right font-medium">本益比</th>
              <th className="px-3 py-2 text-right font-medium">ROE</th>
              <th className="px-3 py-2 text-left font-medium">市場定位</th>
            </tr>
          </thead>
          <tbody data-pdf-block="competitors-rows">
            {data.competitors.map((c) => (
              <tr key={c.symbol} data-pdf-block="competitor-row" className="border-b border-slate-800/50 transition-colors hover:bg-slate-800/30">
                <td className="py-3 pr-3">
                  <div className="font-mono text-sm font-semibold text-slate-100">{c.symbol}</div>
                  <div className="text-xs text-slate-500">{c.name}</div>
                </td>
                <td className="px-3 py-3 text-right font-mono text-slate-300">
                  {c.marketCap ? formatCurrency(c.marketCap) : '—'}
                </td>
                <td className={`px-3 py-3 text-right font-mono ${scoreColor(c.grossMargin, 30, 50)}`}>
                  {c.grossMargin !== undefined ? formatPercent(c.grossMargin, 1) : '—'}
                </td>
                <td className={`px-3 py-3 text-right font-mono ${scoreColor(c.netMargin, 10, 20)}`}>
                  {c.netMargin !== undefined ? formatPercent(c.netMargin, 1) : '—'}
                </td>
                <td className="px-3 py-3 text-right font-mono text-slate-300">
                  {c.eps !== undefined ? c.eps.toFixed(2) : '—'}
                </td>
                <td className="px-3 py-3 text-right font-mono text-slate-300">
                  {c.pe !== undefined ? c.pe.toFixed(1) : '—'}
                </td>
                <td className={`px-3 py-3 text-right font-mono ${scoreColor(c.roe, 10, 20)}`}>
                  {c.roe !== undefined ? formatPercent(c.roe, 1) : '—'}
                </td>
                <td className="px-3 py-3 text-xs text-slate-400">
                  <div>{c.marketPosition}</div>
                  <div className="mt-0.5 text-slate-500">
                    <span className="text-bull-400">+</span> {c.coreStrength}
                  </div>
                  <div className="text-slate-500">
                    <span className="text-bear-400">−</span> {c.coreRisk}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.aiSummary && (
        <div className="mt-4 rounded-lg border border-brand-500/20 bg-brand-500/5 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-400">
            <TrendingUp className="h-4 w-4" />
            AI 總結
          </div>
          <p className="text-sm leading-relaxed text-slate-300">{data.aiSummary}</p>
        </div>
      )}
    </Card>
  );
}

/** 高於 high 用 bull，低於 low 用 bear */
function scoreColor(value: number | undefined, low: number, high: number): string {
  if (value === undefined) return 'text-slate-500';
  if (value >= high) return 'text-bull-400';
  if (value <= low) return 'text-bear-400';
  return 'text-slate-300';
}