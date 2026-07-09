import type { ReactNode } from 'react';

interface TagProps {
  children: ReactNode;
  variant?: 'default' | 'bull' | 'bear' | 'brand' | 'warning';
  size?: 'sm' | 'md';
}

const variants = {
  default: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
  bull: 'bg-bull-50 text-bull-700 border-bull-200 dark:bg-bull-500/10 dark:text-bull-400 dark:border-bull-500/30',
  bear: 'bg-bear-50 text-bear-700 border-bear-200 dark:bg-bear-500/10 dark:text-bear-400 dark:border-bear-500/30',
  brand: 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/30',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',
};

export function Tag({ children, variant = 'default', size = 'sm' }: TagProps) {
  const sizing = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-md border font-medium
        ${variants[variant]} ${sizing}
      `}
    >
      {children}
    </span>
  );
}