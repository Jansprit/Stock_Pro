import { ExternalLink, Newspaper } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SentimentBadge } from '@/components/ui/SentimentBadge';
import { Tag } from '@/components/ui/Tag';
import { formatDate } from '@/lib/format';
import type { NewsItem } from '@/lib/types';

interface NewsListProps {
  news: NewsItem[];
  loading?: boolean;
  error?: string | null;
}

const CATEGORY_LABELS: Record<NewsItem['category'], string> = {
  operations: '營運',
  financials: '財報',
  industry: '產業',
  legal: '法規/訴訟',
  market: '市場情緒',
};

const CATEGORY_VARIANTS: Record<NewsItem['category'], 'default' | 'bull' | 'bear' | 'brand' | 'warning'> = {
  operations: 'default',
  financials: 'brand',
  industry: 'default',
  legal: 'warning',
  market: 'default',
};

export function NewsList({ news, loading, error }: NewsListProps) {
  if (error) {
    return (
      <Card title="最新新聞">
        <ErrorMessage message={error} title="無法載入新聞" />
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="最新新聞">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (news.length === 0) {
    return (
      <Card title="最新新聞">
        <EmptyState
          icon={<Newspaper className="h-10 w-10" />}
          title="暫無此股票的新聞"
          description="本平台使用 Finnhub 免費方案，僅支援美股公司新聞；台股與 ETF 詳細新聞需付費資料源。"
        />
      </Card>
    );
  }

  return (
    <Card
      title="最新新聞摘要"
      subtitle={`共 ${news.length} 則 · 依發布時間排序`}
    >
      <div className="space-y-3">
        {news.map((n, idx) => (
          <a
            key={idx}
            href={n.link || '#'}
            target="_blank"
            rel="noopener noreferrer"
            data-pdf-block="news-item"
            className="
              group block rounded-lg border border-slate-800 bg-slate-900/40 p-3
              transition-all hover:border-slate-700 hover:bg-slate-800/50
            "
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold leading-snug text-slate-100 group-hover:text-brand-400">
                {n.title}
              </h4>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-600 group-hover:text-brand-400" />
            </div>

            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
              {n.summary}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <SentimentBadge sentiment={n.sentiment} />
              <Tag variant={CATEGORY_VARIANTS[n.category]} size="sm">
                {CATEGORY_LABELS[n.category]}
              </Tag>
              <span className="text-xs text-slate-500">{n.publisher}</span>
              <span className="text-xs text-slate-600">·</span>
              <span className="text-xs text-slate-500">{formatDate(n.publishDate, 'relative')}</span>
            </div>

            {n.impact && (
              <p className="mt-2 border-t border-slate-800/50 pt-2 text-xs italic text-slate-500">
                💡 可能影響：{n.impact}
              </p>
            )}
          </a>
        ))}
      </div>
    </Card>
  );
}