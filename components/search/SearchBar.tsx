'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { Search, Loader2, TrendingUp } from 'lucide-react';
import type { SearchResult } from '@/lib/types';

interface SearchBarProps {
  onSelect: (symbol: string) => void;
  initialValue?: string;
}

export function SearchBar({ onSelect, initialValue = '' }: SearchBarProps) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (data.results) {
          setResults(data.results);
          setOpen(true);
          setActiveIndex(-1);
        } else {
          setResults([]);
          setOpen(false);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (symbol: string) => {
    setOpen(false);
    setQuery(symbol);
    onSelect(symbol);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) {
      if (e.key === 'Enter' && query.trim()) {
        handleSelect(query.trim().toUpperCase());
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = activeIndex >= 0 ? activeIndex : 0;
      handleSelect(results[idx].symbol);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="輸入股票代碼或公司名稱（如 AAPL、Apple、台積電）"
          className="
            w-full rounded-lg border border-edge bg-card
            py-2.5 pl-10 pr-10 text-sm text-fg placeholder:text-fg-subtle
            shadow-sm
            focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30
            transition-colors
          "
          aria-label="股票搜尋"
          aria-autocomplete="list"
          aria-haspopup="listbox"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-fg-muted" />
        )}
      </div>

      {open && results.length > 0 && (
        <div
          className="
            absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-auto
            rounded-lg border border-edge bg-card shadow-xl shadow-black/20
            animate-fade-in
          "
        >
          {results.map((r, idx) => (
            <button
              key={`${r.symbol}-${r.exchange}`}
              type="button"
              onClick={() => handleSelect(r.symbol)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`
                flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left
                transition-colors
                ${activeIndex === idx ? 'bg-hover' : ''}
              `}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-fg">{r.symbol}</span>
                  <span className="text-xs text-fg-subtle">{r.exchange}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-fg-muted">{r.name}</div>
              </div>
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
