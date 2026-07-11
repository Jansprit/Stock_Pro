import type { ReactNode } from 'react';

interface TagProps {
  children: ReactNode;
  variant?: 'default' | 'bull' | 'bear' | 'brand' | 'warning';
  size?: 'sm' | 'md';
}

const variants = {
  default: 'bg-sunken text-fg border-edge',
  bull: 'bg-bull-500/10 text-bull-600 border-bull-500/30 dark:text-bull-400',
  bear: 'bg-bear-500/10 text-bear-600 border-bear-500/30 dark:text-bear-400',
  brand: 'bg-brand-500/10 text-brand-600 border-brand-500/30 dark:text-brand-400',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400',
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
