import { Card } from '@/components/ui/Card';
import { Building2, MapPin, Calendar, Users, Globe, Briefcase, UserCircle2, Package, Phone, DollarSign } from 'lucide-react';
import { truncate } from '@/lib/format';
import type { StockOverview } from '@/lib/types';

interface CompanyProfileProps {
  overview: StockOverview;
}

interface InfoItem {
  Icon: typeof Building2;
  label: string;
  value: string;
  /** 加粗顯示（新欄位如董事長） */
  highlight?: boolean;
}

export function CompanyProfile({ overview }: CompanyProfileProps) {
  const info: InfoItem[] = [
    { Icon: Building2, label: '股票代碼', value: overview.symbol },
    { Icon: Globe, label: '交易所', value: overview.exchange || '—' },
  ];

  // 產業：優先用 Goodinfo 拿到的 twseIndustry（e.g. 半導體業），fallback 到 Yahoo sector/industry
  if (overview.twseIndustry) {
    info.push({
      Icon: Building2,
      label: '產業',
      value: overview.twseIndustry,
      highlight: true,
    });
  } else {
    info.push({
      Icon: Building2,
      label: '產業',
      value: `${overview.sector ?? '—'} / ${overview.industry ?? '—'}`,
    });
  }

  // 董事長（Goodinfo 提供，台股限定）
  if (overview.chairman) {
    info.push({ Icon: UserCircle2, label: '董事長', value: overview.chairman, highlight: true });
  }
  // 總經理（Goodinfo 提供）
  if (overview.president) {
    info.push({ Icon: Briefcase, label: '總經理', value: overview.president });
  }

  // 上市日期（Goodinfo 提供）
  if (overview.ipoDate) {
    info.push({ Icon: Calendar, label: '上市日期', value: overview.ipoDate });
  }

  // 員工人數（Goodinfo 或 Yahoo）
  if (overview.employeeCount) {
    info.push({ Icon: Users, label: '員工人數', value: `${overview.employeeCount.toLocaleString()} 人` });
  } else if (overview.employees) {
    info.push({ Icon: Users, label: '員工數', value: `${overview.employees.toLocaleString()} 人` });
  }

  // 總部地址（Goodinfo 提供）
  if (overview.address) {
    info.push({ Icon: MapPin, label: '總部地址', value: overview.address });
  } else if (overview.headquarters) {
    info.push({ Icon: MapPin, label: '總部', value: overview.headquarters });
  } else if (overview.country) {
    info.push({ Icon: Globe, label: '所在地', value: overview.country });
  }

  return (
    <Card title="公司基本資料" subtitle={overview.name}>
      <p className="text-sm leading-relaxed text-fg-muted">
        {truncate(overview.description || '暫無公司簡介', 600)}
      </p>

      {/* 主要產品（Goodinfo 提供，台股限定） — 顯示在描述下方優先區 */}
      {overview.mainProducts && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-brand-500/5 p-3 border border-brand-500/20">
          <Package className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          <div className="min-w-0">
            <div className="text-xs font-medium text-brand-600 dark:text-brand-400">主要產品 / 業務範圍</div>
            <div className="mt-0.5 text-sm text-fg">{overview.mainProducts}</div>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-edge pt-4 sm:grid-cols-2">
        {info.map(({ Icon, label, value, highlight }) => (
          <div key={label} className="flex items-start gap-2">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${highlight ? 'text-brand-500' : 'text-fg-subtle'}`} />
            <div className="min-w-0">
              <div className="text-xs text-fg-subtle">{label}</div>
              <div className={`mt-0.5 truncate text-sm ${highlight ? 'font-medium text-fg' : 'text-fg'}`}>
                {value}
              </div>
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
            className="text-xs text-brand-500 hover:underline dark:text-brand-400"
          >
            <Phone className="inline h-3 w-3 mr-1" />
            官方網站：{overview.website} →
          </a>
        </div>
      )}
    </Card>
  );
}
