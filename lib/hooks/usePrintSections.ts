'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ALL_SECTION_KEYS,
  DEFAULT_PRINT_SECTIONS,
  PrintSectionKey,
} from '@/lib/print-sections';

const STORAGE_KEY = 'stock_pro:print_sections';

function loadFromStorage(): Record<PrintSectionKey, boolean> {
  if (typeof window === 'undefined') return { ...DEFAULT_PRINT_SECTIONS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRINT_SECTIONS };
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    // 對新加入的 section 補上預設值，避免舊資料缺漏
    const merged: Record<PrintSectionKey, boolean> = { ...DEFAULT_PRINT_SECTIONS };
    for (const key of ALL_SECTION_KEYS) {
      if (typeof parsed[key] === 'boolean') merged[key] = parsed[key];
    }
    return merged;
  } catch {
    return { ...DEFAULT_PRINT_SECTIONS };
  }
}

function saveToStorage(value: Record<PrintSectionKey, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 忽略 localStorage 寫入失敗（quota / private mode）
  }
}

/**
 * 列印區塊選擇 hook
 *
 * - 從 localStorage 載入上次選擇
 * - 自動持久化（任何變更都寫回）
 * - 提供 generatePdf 動作（呼叫 /api/pdf-report 並下載）
 * - PDF 下載用 blob URL，避免直接 navigate 導致頁面跳走
 */
export function usePrintSections(symbol: string) {
  const [selected, setSelectedState] = useState<Record<PrintSectionKey, boolean>>(() => ({
    ...DEFAULT_PRINT_SECTIONS,
  }));
  const [isOpen, setIsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 首次掛載時從 localStorage 載入
  useEffect(() => {
    setSelectedState(loadFromStorage());
  }, []);

  // 任何變更自動寫回
  const setSelected = useCallback((next: Record<PrintSectionKey, boolean>) => {
    setSelectedState(next);
    saveToStorage(next);
  }, []);

  const open = useCallback(() => {
    setError(null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  /**
   * 呼叫 API 生成 PDF 並觸發瀏覽器下載
   * @returns Promise<boolean> 是否成功
   */
  const generatePdf = useCallback(async (): Promise<boolean> => {
    setGenerating(true);
    setError(null);
    try {
      const selectedKeys = ALL_SECTION_KEYS.filter((k) => selected[k]);
      if (selectedKeys.length === 0) {
        setError('請至少選擇一個區塊');
        setGenerating(false);
        return false;
      }
      const params = new URLSearchParams({ sections: selectedKeys.join(',') });
      const res = await fetch(`/api/pdf-report/${encodeURIComponent(symbol)}?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${symbol}_research_report_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setGenerating(false);
      setIsOpen(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF 生成失敗');
      setGenerating(false);
      return false;
    }
  }, [selected, symbol]);

  return {
    selected,
    setSelected,
    isOpen,
    open,
    close,
    generating,
    error,
    generatePdf,
  };
}