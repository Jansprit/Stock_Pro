/**
 * EV/EBITDA 倍數法
 *
 * 公式：
 *   EV = marketCap + totalDebt - cash
 *   EBITDA = operatingIncome + D&A
 *   推算 fairValue（per share）：
 *     fairValue_EV = sector EV/EBITDA × EBITDA
 *     fairValue = (fairValue_EV - totalDebt + cash) / sharesOutstanding
 *
 * 適用：資本密集型產業（半導體、航運、電信）。
 * 沒 EBITDA 或同業 EV/EBITDA 時跳過。
 */

import type { ModelBreakdown } from '../types';

interface EvEbitdaInput {
  ebitda: number;            // 該股 EBITDA（公司整體）
  totalDebt: number;
  cash: number;
  sharesOutstanding: number;
  sectorEvEbitdaMedian?: number; // 同業 EV/EBITDA 中位數
}

export function evEbitdaModel(input: EvEbitdaInput): ModelBreakdown {
  if (!input.sectorEvEbitdaMedian || input.sectorEvEbitdaMedian <= 0) {
    return { name: 'evEbitda', displayName: 'EV/EBITDA', fairValue: 0, weight: 0, skipped: '無同業 EV/EBITDA 中位數（competitors 未填）' };
  }
  if (!input.ebitda || input.ebitda <= 0) {
    return { name: 'evEbitda', displayName: 'EV/EBITDA', fairValue: 0, weight: 0, skipped: 'EBITDA 為零或負' };
  }
  if (!input.sharesOutstanding || input.sharesOutstanding <= 0) {
    return { name: 'evEbitda', displayName: 'EV/EBITDA', fairValue: 0, weight: 0, skipped: '流通股數未知' };
  }
  const ev = input.sectorEvEbitdaMedian * input.ebitda;
  const equity = ev - input.totalDebt + input.cash;
  const fairValue = equity / input.sharesOutstanding;
  return { name: 'evEbitda', displayName: 'EV/EBITDA', fairValue, weight: 0 };
}