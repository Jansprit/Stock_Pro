'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCurrency, formatFullCurrency } from '@/lib/format';
import type { ChartRange, PricePoint, StockOverview } from '@/lib/types';

interface PriceChartProps {
  symbol: string;
  overview: StockOverview;
  initialData: PricePoint[];
  initialRange: ChartRange;
}

const RANGES: Array<{ value: ChartRange; label: string }> = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '1Y', label: '1Y' },
  { value: '5Y', label: '5Y' },
];

export function PriceChart({ symbol, overview, initialData, initialRange }: PriceChartProps) {
  const [range, setRange] = useState<ChartRange>(initialRange);
  const [data, setData] = useState<PricePoint[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (range === initialRange) return; // 初次載入已用 initialData
    setLoading(true);
    setError(null);
    fetch(`/api/chart/${encodeURIComponent(symbol)}?range=${range}`)
      .then(async (r) => {
        const json = await r.json();
        if (json.error) throw new Error(json.message);
        return json.points as PricePoint[];
      })
      .then((points) => setData(points))
      .catch((err) => setError(err instanceof Error ? err.message : '載入失敗'))
      .finally(() => setLoading(false));
  }, [range, symbol, initialRange]);

  const isPositive = data.length > 0 && data[data.length - 1].close >= data[0].close;
  const chartColor = isPositive ? '#10b981' : '#ef4444';

  return (
    <Card
      title="股價走勢"
      subtitle={`${overview.name} (${overview.symbol}) · ${overview.currency}`}
      actions={
        <div className="flex rounded-md border border-slate-800 bg-slate-950/50 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={`
                rounded px-2.5 py-1 text-xs font-medium transition-colors
                ${range === r.value
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-400 hover:text-slate-100'}
              `}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      {error ? (
        <ErrorMessage message={error} title="無法載入歷史股價" />
      ) : loading ? (
        <Skeleton className="h-64 w-full" />
      ) : data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          暫無資料
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
                minTickGap={50}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => formatCurrency(v, overview.currency)}
                domain={['auto', 'auto']}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value: number) => [formatFullCurrency(value, overview.currency), '收盤價']}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#priceGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}