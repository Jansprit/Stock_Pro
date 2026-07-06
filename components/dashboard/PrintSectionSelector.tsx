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
  /** 受控：父層持有的選擇狀態（持久化於 localStorage） */
  selected: Record<PrintSectionKey, boolean>;
  onChange: (next: Record<PrintSectionKey, boolean>) => void;
  /** 確認列印 → 呼叫父層觸發 API */
  onConfirm: () => void;
  /** API 正在產生 PDF */
  generating?: boolean;
  /** 關閉 Modal */
  onClose?: () => void;
}

/**
 * 列印區塊選擇器
 *
 * UX：
 *  - 每個區塊獨立 checkbox
 *  - 預設除了「相關新聞」外全選
 *  - 「全選 / 全不選 / 反選」快速操作
 *  - 「確認列印」呼叫父層 onConfirm
 */
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

  const toggle = (key: PrintSectionKey) => {
    onChange({ ...selected, [key]: !selected[key] });
  };

  const selectAll = () => {
    onChange(Object.fromEntries(ALL_SECTION_KEYS.map((k) => [k, true])) as Record<PrintSectionKey, boolean>);
  };

  const selectNone = () => {
    onChange(Object.fromEntries(ALL_SECTION_KEYS.map((k) => [k, false])) as Record<PrintSectionKey, boolean>);
  };

  const invert = () => {
    onChange(Object.fromEntries(ALL_SECTION_KEYS.map((k) => [k, !selected[k]])) as Record<PrintSectionKey, boolean>);
  };

  const resetDefault = () => {
    onChange({ ...DEFAULT_PRINT_SECTIONS });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <Card
        padding="lg"
        className="relative z-10 w-full max-w-xl"
        title={
          <div className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-brand-400" />
            <span>選擇要包含在 PDF 的區塊</span>
          </div>
        }
        subtitle={`${stockName} (${symbol}) — 已選擇 ${selectedCount} / ${totalCount} 個區塊`}
        actions={
          onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
              aria-label="關閉"
            >
              <X className="h-4 w-4" />
            </button>
          )
        }
      >
        {/* 快速操作列 */}
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
          >
            全選
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
          >
            全不選
          </button>
          <button
            type="button"
            onClick={invert}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
          >
            <RotateCcw className="h-3 w-3" />
            反選
          </button>
          <button
            type="button"
            onClick={resetDefault}
            className="rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
          >
            恢復預設
          </button>
        </div>

        {/* 9 個區塊核選方塊 */}
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

        {/* 確認按鈕 */}
        <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
          <div className="text-xs text-slate-500">
            提示：「相關新聞」預設不列印（避免塞滿版面）
          </div>
          <button
            type="button"
            onClick={onConfirm}
            disabled={generating || selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
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
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-slate-800/60"
    >
      <Icon className={`h-4 w-4 shrink-0 ${checked ? 'text-brand-400' : 'text-slate-500'}`} />
      <span className={`flex-1 ${checked ? 'text-slate-100' : 'text-slate-400'}`}>{label}</span>
      {isDefault && (
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">預設</span>
      )}
    </button>
  );
}