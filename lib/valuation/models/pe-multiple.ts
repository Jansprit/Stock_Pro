/**
 * 本益比倍數法（P/E Multiple）
 *
 * 公式：fairValue = 同業 PE 中位數 × 該股 EPS
 *
 * 限制：competitors PE 由 lib/competitors.ts 手填同業對照，需手動維護。
 * 沒同業對照時模型跳過。
 */

import type { ModelBreakdown } from '../types';

interface PeInput {
  eps: number;
  sectorPeMedian?: number; // 同業 PE 中位數
}

export function peMultipleModel(input: PeInput): ModelBreakdown {
  if (!input.sectorPeMedian || input.sectorPeMedian <= 0) {
    return { name: 'peMultiple', displayName: 'P/E 倍數法', fairValue: 0, weight: 0, skipped: '無同業 PE 中位數（competitors 未填）' };
  }
  if (!input.eps || input.eps <= 0) {
    return { name: 'peMultiple', displayName: 'P/E 倍數法', fairValue: 0, weight: 0, skipped: 'EPS 為零或負' };
  }
  return {
    name: 'peMultiple',
    displayName: 'P/E 倍數法',
    fairValue: input.sectorPeMedian * input.eps,
    weight: 0,
  };
}