import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  variant?: 'inline' | 'card';
}

export function ErrorMessage({
  title = '資料載入失敗',
  message,
  onRetry,
  variant = 'card',
}: ErrorMessageProps) {
  const containerClass =
    variant === 'card'
      ? 'rounded-xl border border-bear-200 bg-bear-50 p-5 dark:border-bear-700/30 dark:bg-bear-500/5'
      : 'rounded-lg border border-bear-200 bg-bear-50 p-3 dark:border-bear-700/30 dark:bg-bear-500/5';

  return (
    <div className={containerClass} role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-bear-500 dark:text-bear-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 dark:text-slate-100">{title}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="
              inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white
              px-2.5 py-1 text-xs text-slate-700 transition-colors
              hover:bg-slate-100 hover:text-slate-900
              dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300
              dark:hover:bg-slate-700 dark:hover:text-slate-100
            "
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重試
          </button>
        )}
      </div>
    </div>
  );
}
