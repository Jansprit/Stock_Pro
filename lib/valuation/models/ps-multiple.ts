/**
 * 股價營收比倍數法（P/S Multiple）
 *
 * 公式：fairValue = 同業 P/S 中位數 × SPS
 *   SPS = revenue / sharesOutstanding
 *
 * 適用：尚未獲利但有營收的成長股（很多 SaaS、生物科技）。
 * 沒 SPS 或同業 PS 時跳過。
 */

import type { ModelBreakdown } from '../types';

interface PsInput {
  sps: number;                  // 每股營收
  sectorPsMedian?: number;      // 同業 P/S 中位數
}

export function psMultipleModel(input: PsInput): ModelBreakdown {
  if (!input.sectorPsMedian || input.sectorPsMedian <= 0) {
    return { name: 'psMultiple', displayName: 'P/S 倍數法', fairValue: 0, weight: 0, skipped: '無同業 P/S 中位數（competitors 未填）' };
  }
  if (!input.sps || input.sps <= 0) {
    return { name: 'psMultiple', displayName: 'P/S 倍數法', fairValue: 0, weight: 0, skipped: 'SPS 為零或負（無營收資料）' };
  }
  return {
    name: 'psMultiple',
    displayName: 'P/S 倍數法',
    fairValue: input.sectorPsMedian * input.sps,
    weight: 0,
  };
}