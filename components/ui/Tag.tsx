import type { ReactNode } from 'react';

interface TagProps {
  children: ReactNode;
  variant?: 'default' | 'bull' | 'bear' | 'brand' | 'warning';
  size?: 'sm' | 'md';
}

const variants = {
  default: 'bg-slate-800/60 text-slate-300 border-slate-700',
  bull: 'bg-bull-500/10 text-bull-400 border-bull-500/30',
  bear: 'bg-bear-500/10 text-bear-400 border-bear-500/30',
  brand: 'bg-brand-500/10 text-brand-400 border-brand-500/30',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
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