'use client';

import { useEffect, useState } from 'react';
import { LineChart, Clock } from 'lucide-react';
import { SearchBar } from '@/components/search/SearchBar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

interface HeaderProps {
  onSelectStock: (symbol: string) => void;
}

export function Header({ onSelectStock }: HeaderProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const formatted = now
    ? now.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '載入中…';

  return (
    // 主題自適應：light 用紙白，dark 用近黑半透明（搭配 backdrop blur）
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-black/85">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 p-2 shadow-lg shadow-brand-500/20">
            <LineChart className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-lg">
              AI Stock Research
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">智慧化股票研究分析平台</p>
          </div>
        </div>

        {/* Search */}
        <SearchBar onSelect={onSelectStock} />

        {/* Right tools */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 lg:flex">
            <Clock className="h-3.5 w-3.5" />
            <span>更新時間：{formatted}</span>
          </div>
          {/* 主題切換（燈泡 / 太陽） */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
