'use client';

import { useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import type { AIReport } from '@/lib/types';

interface ResearchReportProps {
  report: AIReport;
  stockName: string;
  /** 列印模式：預設展開且隱藏收合按鈕 */
  defaultExpanded?: boolean;
}

export function ResearchReport({ report, stockName, defaultExpanded = false }: ResearchReportProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const sections = [
    { title: '財務表現分析', content: report.financialAnalysis },
    { title: '產業與競爭分析', content: report.competitiveAnalysis },
    { title: '最新新聞影響', content: report.newsImpact },
    { title: '公司核心優勢', content: null, list: report.strengths },
  ];

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-400" />
          <span>完整研究報告</span>
          <Tag variant="brand">Claude AI</Tag>
        </div>
      }
      subtitle={`${stockName} · 由 AI 生成的完整研究分析`}
      actions={
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="
            inline-flex items-center gap-1 rounded-md border border-edge bg-card
            px-2.5 py-1 text-xs text-fg-muted transition-colors
            hover:bg-hover hover:text-fg
          "
        >
          {expanded ? '收起' : '展開'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      }
    >
      {!expanded ? (
        <div className="text-sm text-fg-muted">
          <p>{report.summary}</p>
          <p className="mt-2 text-xs text-fg-subtle">
            點擊「展開」查看完整的財務分析、競爭分析、新聞影響與公司優勢列表。
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.title} data-pdf-block="research-chapter">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                <span className="h-1 w-1 rounded-full bg-brand-500" />
                {s.title}
              </h4>
              {s.content && (
                <p className="text-sm leading-relaxed text-fg">{s.content}</p>
              )}
              {s.list && (
                <ul className="space-y-2.5">
                  {s.list.map((item, idx) => (
                    <li key={idx} className="rounded-md border border-edge bg-sunken p-3">
                      <div className="text-sm font-semibold text-fg">{item.title}</div>
                      <div className="mt-1 text-xs leading-relaxed text-fg-muted">{item.description}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* 評分解釋 */}
          <section>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
              <span className="h-1 w-1 rounded-full bg-brand-500" />
              AI 評分依據
            </h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(report.scoreReasons).map(([key, reason]) => (
                <div key={key} className="rounded-md border border-edge bg-sunken p-3">
                  <div className="text-xs font-semibold text-brand-500 dark:text-brand-400">{translateScoreKey(key)}</div>
                  <div className="mt-1 text-xs leading-relaxed text-fg-muted">{reason}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Card>
  );
}

function translateScoreKey(key: string): string {
  const map: Record<string, string> = {
    growth: '成長性',
    profitability: '獲利能力',
    financialSafety: '財務安全性',
    competitiveAdvantage: '競爭優勢',
    valuation: '估值合理性',
    newsSentiment: '新聞情緒',
    longTermPotential: '長期潛力',
    overall: '整體評分',
  };
  return map[key] ?? key;
}