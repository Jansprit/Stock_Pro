/**
 * DDM（Dividend Discount Model，股利折現）
 *
 * 公式（Gordon Growth Model）：
 *   g  = ROE × (1 - payoutRatio)         (Sustainable Growth Rate)
 *   Ke = rf + β × ERP                     (Cost of Equity)
 *   FairValue = DPS × (1 + g) / (Ke - g)
 *
 * 適用：高配息成熟股（金融、電信、公用事業）。對不配息股會回傳 skip。
 *
 * 輸入：歷史 DPS（DPS 5Y CAGR 可選）、ROE、payoutRatio、β、無風險利率、ERP
 */

import type { ModelBreakdown } from '../types';
import { DEFAULT_ERP, DEFAULT_SAFE_GDP } from '../constants';

interface DdmInput {
  dps: number;          // 最新 DPS（USD per share）
  roe?: number;         // ROE（小數，例如 0.15 = 15%）
  payoutRatio?: number; // DPS / EPS（小數）
  beta?: number;
  riskFreeRate: number;
  erp?: number;
}

export function ddmModel(input: DdmInput): ModelBreakdown {
  const erp = input.erp ?? DEFAULT_ERP;
  const beta = input.beta ?? 1.0;
  const ke = input.riskFreeRate + beta * erp;

  if (input.dps <= 0) {
    return { name: 'ddm', displayName: 'DDM（SGR 成長）', fairValue: 0, weight: 0, skipped: '該股不配息或 DPS 為 0，DDM 不適用' };
  }

  // g = ROE × (1 - payoutRatio)；若缺 ROE/payoutRatio，用 safeGdp 兜底
  let g: number;
  if (input.roe !== undefined && input.payoutRatio !== undefined) {
    g = input.roe * (1 - input.payoutRatio);
  } else if (input.roe !== undefined) {
    // 沒有 payout ratio，假設全數保留：g = ROE
    g = input.roe;
  } else {
    g = DEFAULT_SAFE_GDP;
  }
  g = Math.min(Math.max(g, 0), DEFAULT_SAFE_GDP); // clamp 至 [0, safeGdp]

  if (ke <= g) {
    return { name: 'ddm', displayName: 'DDM（SGR 成長）', fairValue: 0, weight: 0, skipped: `Ke (${(ke * 100).toFixed(1)}%) ≤ g (${(g * 100).toFixed(1)}%)，Gordon 模型失效` };
  }

  const fairValue = (input.dps * (1 + g)) / (ke - g);
  return { name: 'ddm', displayName: 'DDM（SGR 成長）', fairValue, weight: 0 };
}