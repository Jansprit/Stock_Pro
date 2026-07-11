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
  const hasAnalyst = typeof overview.analystTargetMean === 'number' && overview.analystTargetMean! > 0;
  const hasFairValue = typeof overview.fairValue === 'number' && overview.fairValue! > 0;
  const fairValueDivergence = hasFairValue && overview.fairValue !== undefined && overview.price > 0
    ? Math.abs((overview.fairValue - overview.price) / overview.price)
    : 0;
  if (!hasAnalyst && !hasFairValue) return null;

  return (
    <Card
      padding="lg"
      title={
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-brand-500 dark:text-brand-400" />
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
          className="inline-flex items-center gap-1 rounded-md border border-edge bg-card px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          title="查看計算說明"
        >
          <Info className="h-3 w-3" />
          模型說明
        </a>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ValueColumn
          label="現價"
          value={formatCurrency(overview.price, overview.currency)}
          colorClass="text-fg"
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

      {hasAnalyst && hasFairValue && (
        <PriceRangeBar
          fairValue={overview.fairValue!}
          analystTarget={overview.analystTargetMean!}
          analystLow={overview.analystTargetLow}
          analystHigh={overview.analystTargetHigh}
          currentPrice={overview.price}
          currency={overview.currency}
        />
      )}

      {hasAnalyst && (
        <div className="mt-4 rounded-lg border border-edge bg-sunken p-3">
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span>分析師目標區間</span>
            <span className="font-mono text-fg">
              {formatCurrency(overview.analystTargetLow ?? overview.analystTargetMean!, overview.currency)}
            </span>
            <RangeBar
              low={overview.analystTargetLow}
              high={overview.analystTargetHigh}
              mean={overview.analystTargetMean}
              current={overview.price}
              currency={overview.currency}
            />
            <span className="font-mono text-fg">
              {formatCurrency(overview.analystTargetHigh ?? overview.analystTargetMean!, overview.currency)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Tag variant={ratingVariant(overview.analystRating)}>
              {translateRating(overview.analystRating)}
            </Tag>
            <span className="text-fg-muted">
              {overview.analystCount ?? '?'} 位分析師 · 資料來源 Yahoo Finance
            </span>
          </div>
        </div>
      )}

      <p id="valuation-disclaimer" className="mt-4 border-t border-edge pt-3 text-xs leading-relaxed text-fg-muted">
        ⚠️ 量化公允價值為本機以 DCF / DDM / P-E / P-S / EV-EBITDA 五模型加權平均估算，
        基於公開財報與同業中位數，<strong className="text-fg">不含分析師產業拜訪、供應鏈訪查、質化調整等前瞻判斷</strong>。
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
      <div className="text-xs text-fg-subtle">{label}</div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${colorClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-fg-muted">{sub}</div>}
    </div>
  );
}

function formatPremium(p: number | undefined): string {
  if (p === undefined || !isFinite(p)) return '';
  const sign = p >= 0 ? '+' : '';
  return `相對現價 ${sign}${p.toFixed(1)}%`;
}

function premiumColor(p: number | undefined): string {
  if (p === undefined) return 'text-fg-muted';
  if (p < -5) return 'text-bull-500 dark:text-bull-400';
  if (p > 5) return 'text-bear-500 dark:text-bear-400';
  return 'text-fg';
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

function RangeBar({
  low, high, mean, current, currency,
}: { low?: number; high?: number; mean?: number; current?: number; currency: string }) {
  if (!low || !high || low >= high) {
    return <span className="font-mono text-xs text-fg-subtle">N/A</span>;
  }
  const span = high - low;
  const meanPct = mean !== undefined ? ((mean - low) / span) * 100 : null;
  const currentPct = current !== undefined ? Math.max(0, Math.min(100, ((current - low) / span) * 100)) : null;
  return (
    <div className="relative mx-2 h-1.5 flex-1 rounded-full bg-edge-strong">
      {meanPct !== null && (
        <div className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500" style={{ left: `${meanPct}%` }} />
      )}
      {currentPct !== null && (
        <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fg bg-amber-500" style={{ left: `${currentPct}%` }} title={`現價 ${formatCurrency(current!, currency)}`} />
      )}
    </div>
  );
}

/* 以下為水平價格條佔位（避免 build error，下方為精簡版）*/
function PriceRangeBar(_: { fairValue: number; analystTarget: number; analystLow?: number; analystHigh?: number; currentPrice: number; currency: string }) {
  return null;
}
