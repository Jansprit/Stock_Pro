import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Sentiment } from '@/lib/types';

interface SentimentBadgeProps {
  sentiment: Sentiment;
  size?: 'sm' | 'md';
}

const config = {
  positive: {
    label: '正面',
    bgClass: 'bg-bull-500/10 border-bull-500/30',
    textClass: 'text-bull-400',
    Icon: TrendingUp,
  },
  negative: {
    label: '負面',
    bgClass: 'bg-bear-500/10 border-bear-500/30',
    textClass: 'text-bear-400',
    Icon: TrendingDown,
  },
  neutral: {
    label: '中性',
    bgClass: 'bg-slate-500/10 border-slate-500/30',
    textClass: 'text-fg-muted',
    Icon: Minus,
  },
} as const;

export function SentimentBadge({ sentiment, size = 'sm' }: SentimentBadgeProps) {
  const cfg = config[sentiment];
  const { Icon } = cfg;
  const sizing = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-md border font-medium
        ${cfg.bgClass} ${cfg.textClass} ${sizing}
      `}
    >
      <Icon className={iconSize} />
      {cfg.label}
    </span>
  );
}