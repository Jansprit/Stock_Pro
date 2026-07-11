import { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClass = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ children, title, subtitle, actions, padding = 'md', className = '', ...rest }: CardProps) {
  return (
    <div
      className={`
        rounded-xl border border-edge bg-card shadow-sm
        transition-colors hover:border-edge-hover
        ${className}
      `}
      {...rest}
    >
      {(title || subtitle || actions) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {title && <h3 className="text-base font-semibold text-fg sm:text-lg">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      <div className={paddingClass[padding]}>{children}</div>
    </div>
  );
}
