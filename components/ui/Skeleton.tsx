interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circle' | 'rect';
}

export function Skeleton({ className = '', variant = 'rect' }: SkeletonProps) {
  const variantClass =
    variant === 'circle'
      ? 'rounded-full'
      : variant === 'text'
        ? 'rounded h-3'
        : 'rounded-md';
  return (
    <div
      className={`
        animate-pulse-soft bg-sunken
        ${variantClass} ${className}
      `}
      aria-label="載入中"
    />
  );
}

/** 整個區塊的骨架屏 */
export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-edge bg-card p-5 shadow-sm">
      <Skeleton className="mb-3 h-5 w-1/3" />
      <Skeleton className="mb-2 h-3 w-full" />
      <Skeleton className="mb-2 h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
