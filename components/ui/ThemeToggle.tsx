'use client';

import { useEffect, useState } from 'react';
import { Sun, Lightbulb } from 'lucide-react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'stock-pro:theme';

/**
 * 主題切換按鈕（燈泡圖示）
 *
 * - 預設跟隨系統（prefers-color-scheme: dark → dark）
 * - 點擊切換，存 localStorage
 * - 主題切換「舊主題淡出 / 新主題淡入」過渡
 * - 燈泡本身在 light 時是「關閉的暗燈泡」、dark 時是「亮著的太陽」
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

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

  // 未掛載前：保持可點，視覺低權重
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="切換主題"
        title="切換主題"
        className="rounded-md p-1.5 text-fg-muted hover:bg-hover hover:text-fg"
        onClick={() => {
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
          : 'text-fg-muted hover:bg-hover hover:text-fg'}
      `}
    >
      {isDark ? (
        <Sun className="h-4 w-4 animate-bulb-flicker" />
      ) : (
        <Lightbulb className="h-4 w-4" />
      )}

      {/* hover 提示 */}
      <span
        className="
          pointer-events-none absolute -bottom-7 right-0 whitespace-nowrap rounded
          bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0
          shadow-md transition-opacity group-hover:opacity-100 dark:bg-slate-700
        "
      >
        {isDark ? '🌞 白天版' : '🌙 暗黑版'}
      </span>
    </button>
  );
}
