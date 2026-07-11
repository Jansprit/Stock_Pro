import { Sparkles, CheckCircle2, AlertTriangle, Target } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ScoreCircle } from '@/components/ui/ScoreCircle';
import { Tag } from '@/components/ui/Tag';
import type { AIReport } from '@/lib/types';

interface AIAnalysisPanelProps {
  report: AIReport;
  stockName: string;
}

const SCORE_LABELS: Array<{ key: keyof AIReport['scores']; label: string }> = [
  { key: 'growth', label: '成長性' },
  { key: 'profitability', label: '獲利能力' },
  { key: 'financialSafety', label: '財務安全' },
  { key: 'competitiveAdvantage', label: '競爭優勢' },
  { key: 'valuation', label: '估值合理' },
  { key: 'newsSentiment', label: '新聞情緒' },
  { key: 'longTermPotential', label: '長期潛力' },
];

export function AIAnalysisPanel({ report, stockName }: AIAnalysisPanelProps) {
  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-400" />
          <span>AI 分析</span>
          <Tag variant="brand">Claude AI</Tag>
        </div>
      }
      subtitle={`${stockName} 綜合評分與分析重點`}
    >
      {/* 評分區 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        <div className="col-span-2 sm:col-span-4 lg:col-span-1">
          <ScoreCircle score={report.scores.overall} label="整體評分" size={88} strokeWidth={8} />
        </div>
        {SCORE_LABELS.map((s) => (
          <ScoreCircle key={s.key} score={report.scores[s.key]} label={s.label} />
        ))}
      </div>

      {/* 公司摘要 */}
      <div className="mt-6 rounded-lg border border-edge bg-sunken p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
          <Target className="h-4 w-4 text-brand-500 dark:text-brand-400" />
          公司摘要
        </div>
        <p className="text-sm leading-relaxed text-fg">{report.summary}</p>
      </div>

      {/* 投資亮點 */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
          <CheckCircle2 className="h-4 w-4 text-bull-500 dark:text-bull-400" />
          投資亮點
        </div>
        <ul className="space-y-1.5">
          {report.highlights.map((h, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-fg">
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bull-500/20 text-xs font-bold text-bull-500 dark:text-bull-400">
                {idx + 1}
              </span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 風險速覽 */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
          <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
          主要風險
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <RiskGroup title="短期 (0-1 年)" risks={report.shortTermRisks} variant="bear" />
          <RiskGroup title="中期 (1-3 年)" risks={report.midTermRisks} variant="warning" />
          <RiskGroup title="長期 (3+ 年)" risks={report.longTermRisks} variant="default" />
        </div>
      </div>

      {/* 結論 */}
      <div className="mt-4 rounded-lg border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-transparent p-4">
        <div className="mb-2 text-sm font-semibold text-brand-500 dark:text-brand-400">一句話總結</div>
        <p className="text-sm leading-relaxed text-fg">{report.conclusion}</p>
      </div>
    </Card>
  );
}

function RiskGroup({
  title,
  risks,
  variant,
}: {
  title: string;
  risks: Array<{ title: string; description: string }>;
  variant: 'bear' | 'warning' | 'default';
}) {
  const headerColor =
    variant === 'bear' ? 'text-bear-500 dark:text-bear-400' : variant === 'warning' ? 'text-amber-500 dark:text-amber-400' : 'text-fg-muted';
  return (
    <div className="rounded-md border border-edge bg-sunken p-3">
      <div className={`mb-1.5 text-xs font-semibold ${headerColor}`}>{title}</div>
      {risks.length === 0 ? (
        <p className="text-xs text-fg-subtle">無顯著風險</p>
      ) : (
        <ul className="space-y-1.5">
          {risks.map((r, idx) => (
            <li key={idx} className="text-xs">
              <div className="font-medium text-fg">{r.title}</div>
              <div className="mt-0.5 text-fg-muted">{r.description}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}