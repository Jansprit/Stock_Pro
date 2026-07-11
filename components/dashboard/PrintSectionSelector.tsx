'use client';

import { useState } from 'react';
import { CheckSquare, Square, FileDown, X, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  ALL_SECTION_KEYS,
  DEFAULT_PRINT_SECTIONS,
  PRINT_SECTION_LABELS,
  PrintSectionKey,
} from '@/lib/print-sections';

export type { PrintSectionKey } from '@/lib/print-sections';
export { ALL_SECTION_KEYS, DEFAULT_PRINT_SECTIONS, PRINT_SECTION_LABELS };

interface PrintSectionSelectorProps {
  symbol: string;
  stockName: string;
  selected: Record<PrintSectionKey, boolean>;
  onChange: (next: Record<PrintSectionKey, boolean>) => void;
  onConfirm: () => void;
  generating?: boolean;
  onClose?: () => void;
}

export function PrintSectionSelector({
  symbol,
  stockName,
  selected,
  onChange,
  onConfirm,
  generating,
  onClose,
}: PrintSectionSelectorProps) {
  const selectedCount = ALL_SECTION_KEYS.filter((k) => selected[k]).length;
  const totalCount = ALL_SECTION_KEYS.length;

  const toggle = (key: PrintSectionKey) => onChange({ ...selected, [key]: !selected[key] });
  const selectAll = () => onChange(Object.fromEntries(ALL_SECTION_KEYS.map((k) => [k, true])) as Record<PrintSectionKey, boolean>);
  const selectNone = () => onChange(Object.fromEntries(ALL_SECTION_KEYS.map((k) => [k, false])) as Record<PrintSectionKey, boolean>);
  const invert = () => onChange(Object.fromEntries(ALL_SECTION_KEYS.map((k) => [k, !selected[k]])) as Record<PrintSectionKey, boolean>);
  const resetDefault = () => onChange({ ...DEFAULT_PRINT_SECTIONS });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-sunken backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
    >
      <Card
        padding="lg"
        className="relative z-10 w-full max-w-xl"
        title={
          <div className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-brand-500 dark:text-brand-400" />
            <span>選擇要包含在 PDF 的區塊</span>
          </div>
        }
        subtitle={`${stockName} (${symbol}) — 已選擇 ${selectedCount} / ${totalCount} 個區塊`}
        actions={
          onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              aria-label="關閉"
            >
              <X className="h-4 w-4" />
            </button>
          )
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-edge pb-3">
          {[
            { label: '全選', onClick: selectAll },
            { label: '全不選', onClick: selectNone },
            { label: '反選', onClick: invert, icon: RotateCcw },
            { label: '恢復預設', onClick: resetDefault },
          ].map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="inline-flex items-center gap-1 rounded-md border border-edge bg-card px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              {a.icon && <a.icon className="h-3 w-3" />}
              {a.label}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          {ALL_SECTION_KEYS.map((key) => (
            <CheckboxRow
              key={key}
              label={PRINT_SECTION_LABELS[key]}
              checked={selected[key]}
              onChange={() => toggle(key)}
              isDefault={DEFAULT_PRINT_SECTIONS[key]}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-edge pt-4">
          <div className="text-xs text-fg-subtle">
            提示：「相關新聞」預設不列印（避免塞滿版面）
          </div>
          <button
            type="button"
            onClick={onConfirm}
            disabled={generating || selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-edge disabled:text-fg-subtle"
          >
            <FileDown className="h-4 w-4" />
            {generating ? 'PDF 生成中…' : '確認列印'}
          </button>
        </div>
      </Card>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
  isDefault,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  isDefault: boolean;
}) {
  const Icon = checked ? CheckSquare : Square;
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-fg transition-colors hover:bg-hover"
    >
      <Icon className={`h-4 w-4 shrink-0 ${checked ? 'text-brand-500 dark:text-brand-400' : 'text-fg-subtle'}`} />
      <span className={`flex-1 ${checked ? 'text-fg' : 'text-fg-muted'}`}>{label}</span>
      {isDefault && (
        <span className="rounded bg-sunken px-1.5 py-0.5 text-[10px] text-fg-subtle">預設</span>
      )}
    </button>
  );
}
