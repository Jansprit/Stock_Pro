'use client';

import { TrendingUp, TrendingDown, Calculator, Info } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { formatCurrency, formatPercent } from '@/lib/format';
import type { StockOverview } from '@/lib/types';

interface ValuationPanelProps {
  overview: StockOverview;
}

export function ValuationPanel({ overview }: ValuationPanelProps) {
  const hasAnalyst = typeof overview.analystTargetMean === 'number' && overview.analystTargetMean > 0;
  const hasFairValue = typeof overview.fairValue === 'number' && overview.fairValue > 0;
  // 計算偏離程度，用於決定要不要顯示警示
  const fairValueDivergence = hasFairValue && overview.fairValue !== undefined && overview.price > 0
    ? Math.abs((overview.fairValue - overview.price) / overview.price)
    : 0;
  // 完全沒資料就不顯示
  if (!hasAnalyst && !hasFairValue) return null;

  return (
    <Card
      padding="lg"
      title={
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-brand-400" />
          <span>估值分析</span>
          <Tag variant="brand">量化模型</Tag>
          {fairValueDivergence > 0.8 && (
            <Tag variant="warning">資料偏離</Tag>
          )}
        </div>
      }
      subtitle={fairValueDivergence > 0.8
        ? `量化公允價值 (${formatCurrency(overview.fairValue!, overview.currency)}) 與現價偏離 ${(fairValueDivergence * 100).toFixed(0)}%，可能為單季資料年化誤差，建議以分析師目標價為主`
        : '現價相對於市場分析師目標價與本機量化公允估值的差距'
      }
      actions={
        <a
          href="#valuation-disclaimer"
          className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
          title="查看計算說明"
        >
          <Info className="h-3 w-3" />
          模型說明
        </a>
      }
    >
      {/* 三大數字：現價 / 模型公允 / 分析師目標 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ValueColumn
          label="現價"
          value={formatCurrency(overview.price, overview.currency)}
          colorClass="text-slate-100"
        />
        <ValueColumn
          label="量化公允價值"
          value={hasFairValue ? formatCurrency(overview.fairValue!, overview.currency) : 'N/A'}
          sub={hasFairValue ? formatPremium(overview.premiumToFairValue) : '模型資料不足'}
          colorClass={premiumColor(overview.premiumToFairValue)}
          tooltip="本機以 DCF/DDM/P-E/P-S/EV-EBITDA 五模型加權平均估算"
        />
        <ValueColumn
          label="分析師公允目標價"
          value={hasAnalyst ? formatCurrency(overview.analystTargetMean!, overview.currency) : 'N/A'}
          sub={hasAnalyst ? formatPremium(overview.premiumToAnalystTarget) : '尚無分析師覆蓋'}
          colorClass={premiumColor(overview.premiumToAnalystTarget)}
          tooltip={hasAnalyst ? `Yahoo Finance 共識，${overview.analystCount ?? '?'} 位分析師` : undefined}
        />
      </div>

      {/* 水平位置條：現價相對模型公允與分析師目標 */}
      {hasAnalyst && hasFairValue && (
        <PriceRangeBar
          fairValue={overview.fairValue!}
          analystTarget={overview.analystTargetMean!}
          currentPrice={overview.price}
          currency={overview.currency}
        />
      )}

      {/* 分析師目標區間與評級 */}
      {hasAnalyst && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>分析師目標區間</span>
            <span className="font-mono text-slate-300">
              {formatCurrency(overview.analystTargetLow ?? overview.analystTargetMean!, overview.currency)}
            </span>
            <RangeBar
              low={overview.analystTargetLow}
              high={overview.analystTargetHigh}
              mean={overview.analystTargetMean}
              current={overview.price}
              currency={overview.currency}
            />
            <span className="font-mono text-slate-300">
              {formatCurrency(overview.analystTargetHigh ?? overview.analystTargetMean!, overview.currency)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Tag variant={ratingVariant(overview.analystRating)}>
              {translateRating(overview.analystRating)}
            </Tag>
            <span className="text-slate-500">
              {overview.analystCount ?? '?'} 位分析師 · 資料來源 Yahoo Finance
            </span>
          </div>
        </div>
      )}

      {/* 免責聲明 */}
      <p id="valuation-disclaimer" className="mt-4 border-t border-slate-800 pt-3 text-xs leading-relaxed text-slate-500">
        ⚠️ 量化公允價值為本機以 DCF / DDM / P-E / P-S / EV-EBITDA 五模型加權平均估算，
        基於公開財報與同業中位數，<strong className="text-slate-400">不含分析師產業拜訪、供應鏈訪查、質化調整等前瞻判斷</strong>。
        分析師公允目標價為 Yahoo Finance 收集之市場共識。投資有風險，數據僅供研究參考。
      </p>
    </Card>
  );
}

function ValueColumn({
  label,
  value,
  sub,
  colorClass,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass: string;
  tooltip?: string;
}) {
  return (
    <div title={tooltip}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${colorClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function formatPremium(p: number | undefined): string {
  if (p === undefined || !isFinite(p)) return '';
  const sign = p >= 0 ? '+' : '';
  return `相對現價 ${sign}${p.toFixed(1)}%`;
}

function premiumColor(p: number | undefined): string {
  if (p === undefined) return 'text-slate-400';
  if (p < -5) return 'text-bull-500'; // 折價便宜
  if (p > 5) return 'text-bear-500'; // 溢價昂貴
  return 'text-slate-100'; // 接近
}

function translateRating(r: StockOverview['analystRating']): string {
  switch (r) {
    case 'strongBuy': return '強力買進';
    case 'buy': return '買進';
    case 'hold': return '持有';
    case 'sell': return '賣出';
    case 'strongSell': return '強力賣出';
    default: return '無評級';
  }
}

function ratingVariant(r: StockOverview['analystRating']): 'bull' | 'bear' | 'default' | 'warning' {
  if (r === 'strongBuy' || r === 'buy') return 'bull';
  if (r === 'strongSell' || r === 'sell') return 'bear';
  if (r === 'hold') return 'warning';
  return 'default';
}

/** 簡單水平範圍條（分析師目標區間） */
function RangeBar({
  low, high, mean, current, currency,
}: { low?: number; high?: number; mean?: number; current?: number; currency: string }) {
  if (!low || !high || low >= high) {
    return <span className="font-mono text-xs text-slate-500">N/A</span>;
  }
  // 顯示比例
  const span = high - low;
  const meanPct = mean !== undefined ? ((mean - low) / span) * 100 : null;
  const currentPct = current !== undefined ? Math.max(0, Math.min(100, ((current - low) / span) * 100)) : null;
  return (
    <div className="relative mx-2 h-1.5 flex-1 rounded-full bg-slate-800">
      {meanPct !== null && (
        <div className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500" style={{ left: `${meanPct}%` }} />
      )}
      {currentPct !== null && (
        <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-100 bg-amber-400" style={{ left: `${currentPct}%` }} title={`現價 ${formatCurrency(current!, currency)}`} />
      )}
    </div>
  );
}

/** 三點水平條：模型公允 / 現價 / 分析師目標 */
function PriceRangeBar({
  fairValue, analystTarget, currentPrice, currency,
}: { fairValue: number; analystTarget: number; currentPrice: number; currency: string }) {
  const min = Math.min(fairValue, analystTarget, currentPrice);
  const max = Math.max(fairValue, analystTarget, currentPrice);
  const span = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
  return (
    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="relative h-6">
        {/* 模型公允價值標記 */}
        <Marker pct={pct(fairValue)} color="bg-emerald-500" label={`模型 ${formatCurrency(fairValue, currency)}`} />
        {/* 分析師目標 */}
        <Marker pct={pct(analystTarget)} color="bg-brand-500" label={`目標 ${formatCurrency(analystTarget, currency)}`} />
        {/* 現價 */}
        <Marker pct={pct(currentPrice)} color="bg-amber-400" label={`現價 ${formatCurrency(currentPrice, currency)}`} bold />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{formatCurrency(min, currency)}</span>
        <span>{formatCurrency(max, currency)}</span>
      </div>
    </div>
  );
}

function Marker({ pct, color, label, bold }: { pct: number; color: string; label: string; bold?: boolean }) {
  return (
    <div
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${pct}%` }}
      title={label}
    >
      <div className={`h-3 w-3 rounded-full ${color} ${bold ? 'ring-2 ring-slate-100' : ''}`} />
      <div className={`mt-1 whitespace-nowrap text-[10px] ${bold ? 'font-semibold text-slate-100' : 'text-slate-500'}`}>{label}</div>
    </div>
  );
}