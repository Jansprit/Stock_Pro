'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon, Lightbulb } from 'lucide-react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'stock-pro:theme';

/**
 * 主題切換按鈕（燈泡圖示）
 *
 * - 預設跟隨系統（prefers-color-scheme: dark → dark）
 * - 點擊切換，存 localStorage
 * - 主題切換「舊主題淡出 / 新主題淡入」過渡
 * - 燈泡本身在 light 時是「關閉的暗燈泡」、dark 時是「亮著的暖燈泡」
 */
export function ThemeToggle() {
  // 起始值 lazy init（避免 SSR mismatch）
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // 初始化：讀 localStorage → 沒設就讀系統 → 套用到 <html>
  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Theme | null;
    const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial: Theme = stored ?? (systemDark ? 'dark' : 'light');
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const applyTheme = (next: Theme) => {
    const root = document.documentElement;
    if (next === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    // 給瀏覽器原生 UI（scrollbar / form control）也對應
    root.style.colorScheme = next;
  };

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage 被擋（隱私模式）時靜默忽略
    }
  };

  // 防止 hydration 不一致：未掛載前顯示簡化版（保持可點，視覺較低權重）
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="切換主題"
        title="切換主題"
        className="rounded-md p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        onClick={() => {
          // mounted 前使用者強行點：用系統偏好代替
          const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          const next: Theme = sys === 'dark' ? 'light' : 'dark';
          applyTheme(next);
          setTheme(next);
          try { localStorage.setItem(STORAGE_KEY, next); } catch {}
          setMounted(true);
        }}
      >
        <Lightbulb className="h-4 w-4" />
      </button>
    );
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '切換為白天版' : '切換為暗黑版'}
      title={isDark ? '切換為白天版（適合列印）' : '切換為暗黑版（OLED 省電 + 護眼）'}
      className={`
        group relative rounded-md p-1.5 transition-colors
        ${isDark
          ? 'text-amber-300 hover:bg-amber-500/10 hover:text-amber-200'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}
      `}
    >
      {isDark ? (
        // 暗黑模式中：顯示「正在亮著的」太陽 + 暖色光暈
        <Sun className="h-4 w-4 animate-bulb-flicker" />
      ) : (
        // 白天模式中：顯示「關閉的暗燈泡」
        <Lightbulb className="h-4 w-4" />
      )}

      {/* 點擊時冒出小標籤（第一次切換提示用）*/}
      <span
        className={`
          pointer-events-none absolute -bottom-7 right-0 whitespace-nowrap rounded
          bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0
          shadow-md transition-opacity group-hover:opacity-100 dark:bg-slate-700
        `}
      >
        {isDark ? '🌞 白天版' : '🌙 暗黑版'}
      </span>
    </button>
  );
}
