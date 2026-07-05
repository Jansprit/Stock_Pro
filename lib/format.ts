/**
 * 格式化工具：貨幣、百分比、大數字、日期
 *
 * 注意：Yahoo Finance 對於美股回傳 USD、台股回傳 TWD，
 * 為避免貨幣換算錯誤，格式化函式接受 currency 參數。
 */

const currencySymbols: Record<string, string> = {
  USD: '$',
  TWD: 'NT$',
  JPY: '¥',
  CNY: '¥',
  HKD: 'HK$',
  EUR: '€',
  GBP: '£',
  KRW: '₩',
};

/**
 * 格式化貨幣：1234567 → $1.23M / NT$1.23M
 */
export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'USD',
  options: { compact?: boolean; decimals?: number } = {},
): string {
  if (value === null || value === undefined || !isFinite(value)) return 'N/A';

  const { compact = true, decimals = 2 } = options;
  const symbol = currencySymbols[currency] ?? `${currency} `;

  if (compact && Math.abs(value) >= 1e12) {
    return `${symbol}${(value / 1e12).toFixed(decimals)}T`;
  }
  if (compact && Math.abs(value) >= 1e9) {
    return `${symbol}${(value / 1e9).toFixed(decimals)}B`;
  }
  if (compact && Math.abs(value) >= 1e6) {
    return `${symbol}${(value / 1e6).toFixed(decimals)}M`;
  }
  if (compact && Math.abs(value) >= 1e3) {
    return `${symbol}${(value / 1e3).toFixed(decimals)}K`;
  }
  return `${symbol}${value.toFixed(decimals)}`;
}

/**
 * 格式化完整貨幣：1234567 → $1,234,567.00
 */
export function formatFullCurrency(
  value: number | null | undefined,
  currency: string = 'USD',
  decimals: number = 2,
): string {
  if (value === null || value === undefined || !isFinite(value)) return 'N/A';
  const symbol = currencySymbols[currency] ?? `${currency} `;
  return `${symbol}${value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * 格式化百分比：0.123 → 12.30%
 */
export function formatPercent(
  value: number | null | undefined,
  decimals: number = 2,
  withSign: boolean = false,
): string {
  if (value === null || value === undefined || !isFinite(value)) return 'N/A';
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * 格式化大數字：1234567 → 1.23M
 */
export function formatLargeNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || !isFinite(value)) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(decimals)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(decimals)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(decimals)}K`;
  return value.toFixed(decimals);
}

/**
 * 格式化日期
 */
export function formatDate(date: string | Date, format: 'short' | 'long' | 'relative' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'N/A';

  if (format === 'long') {
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  if (format === 'relative') {
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays} 天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} 週前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} 個月前`;
    return `${Math.floor(diffDays / 365)} 年前`;
  }
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * 根據正負返回顏色 className（用於 Tailwind）
 */
export function valueColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value) || value === 0) {
    return 'text-slate-400';
  }
  return value > 0 ? 'text-bull-500' : 'text-bear-500';
}

/**
 * 將文字截斷到指定長度
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

/**
 * 安全除法（避免除以 0）
 */
export function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  if (!isFinite(numerator) || !isFinite(denominator) || denominator === 0) return fallback;
  return numerator / denominator;
}