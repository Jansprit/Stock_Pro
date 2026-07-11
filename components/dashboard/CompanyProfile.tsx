import { Card } from '@/components/ui/Card';
import { Building2, MapPin, Calendar, Users, Globe } from 'lucide-react';
import { truncate } from '@/lib/format';
import type { StockOverview } from '@/lib/types';

interface CompanyProfileProps {
  overview: StockOverview;
}

interface InfoItem {
  Icon: typeof Building2;
  label: string;
  value: string;
}

export function CompanyProfile({ overview }: CompanyProfileProps) {
  const info: InfoItem[] = [
    { Icon: Building2, label: '股票代碼', value: overview.symbol },
    { Icon: Globe, label: '交易所', value: overview.exchange || '—' },
    { Icon: Building2, label: '產業', value: `${overview.sector ?? '—'} / ${overview.industry ?? '—'}` },
    { Icon: MapPin, label: '總部', value: overview.headquarters || overview.country || '—' },
  ];

  if (overview.employees) {
    info.push({ Icon: Users, label: '員工數', value: `${overview.employees.toLocaleString()} 人` });
  }

  return (
    <Card title="公司基本資料" subtitle={overview.name}>
      <p className="text-sm leading-relaxed text-fg-muted">
        {truncate(overview.description || '暫無公司簡介', 600)}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-edge pt-4 sm:grid-cols-2">
        {info.map(({ Icon, label, value }) => (
          <div key={label} className="flex items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
            <div className="min-w-0">
              <div className="text-xs text-fg-subtle">{label}</div>
              <div className="mt-0.5 truncate text-sm text-fg">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {overview.website && (
        <div className="mt-3 border-t border-edge pt-3">
          <a
            href={overview.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-400 hover:underline"
          >
            官方網站：{overview.website} →
          </a>
        </div>
      )}
    </Card>
  );
}