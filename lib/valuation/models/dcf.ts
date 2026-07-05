/**
 * DCF（Discounted Cash Flow，自由現金流折現）
 *
 * 公式：
 *   WACC = rf + β × ERP
 *   FCF_t = FCF_0 × (1 + g)^t        (g = 歷史 FCF CAGR，clamp 至 safeGdp)
 *   TV    = FCF_5 × (1 + safeGdp) / (WACC - safeGdp)
 *   FairValue = Σ FCF_t / (1+WACC)^t + TV / (1+WACC)^5
 *
 * 輸入：歷史 FCF（CFO - CapEx）、β、無風險利率、ERP
 */

import type { ModelBreakdown } from '../types';
import { DCF_PROJECTION_YEARS, DEFAULT_ERP, DEFAULT_SAFE_GDP } from '../constants';

interface DcfInput {
  fcf: number;          // 最新一年度的自由現金流（公司整體，例如 TWD）
  fcfCagr?: number;     // 歷史 FCF CAGR（小數）
  beta?: number;        // 個股貝他
  riskFreeRate: number; // rf
  erp?: number;         // ERP
  safeGdp?: number;     // 長期成長上限
  /** 流通股數（用於把企業整體價值除成每股公允價值） */
  sharesOutstanding?: number;
}

export function dcfModel(input: DcfInput): ModelBreakdown {
  const erp = input.erp ?? DEFAULT_ERP;
  const safeGdp = input.safeGdp ?? DEFAULT_SAFE_GDP;
  const beta = input.beta ?? 1.0;
  const wacc = input.riskFreeRate + beta * erp;

  if (!isFinite(wacc) || wacc <= safeGdp) {
    return skip('dcf', 'DCF 折現率', `WACC (${(wacc * 100).toFixed(1)}%) 必須大於長期成長率 (${(safeGdp * 100).toFixed(1)}%)`);
  }
  if (input.fcf <= 0) {
    return skip('dcf', 'DCF（5Y FCF 折現）', '自由現金流為零或負，DCF 結果無意義');
  }

  // g = clamp(歷史 CAGR, -10%, safeGdp)
  const g = clamp(input.fcfCagr ?? safeGdp, -0.10, safeGdp);

  // 預估 5 年 FCF
  const projectionYears = DCF_PROJECTION_YEARS;
  let pvSum = 0;
  for (let t = 1; t <= projectionYears; t++) {
    const fcfT = input.fcf * Math.pow(1 + g, t);
    pvSum += fcfT / Math.pow(1 + wacc, t);
  }

  // Gordon 終值（保守成長）
  const fcfN = input.fcf * Math.pow(1 + g, projectionYears);
  const terminalValue = (fcfN * (1 + safeGdp)) / (wacc - safeGdp);
  const pvTerminal = terminalValue / Math.pow(1 + wacc, projectionYears);

  // 企業整體價值
  const enterpriseValue = pvSum + pvTerminal;

  // 轉每股價值（沒流通股數就跳過）
  if (!input.sharesOutstanding || input.sharesOutstanding <= 0) {
    return skip('dcf', 'DCF（5Y FCF 折現）', '缺流通股數，無法換算每股公允價值');
  }
  const fairValue = enterpriseValue / input.sharesOutstanding;

  return {
    name: 'dcf',
    displayName: `DCF（${projectionYears}Y FCF 折現）`,
    fairValue,
    weight: 0, // 由 index.ts 統一計算
  };
}

function skip(name: 'dcf', displayName: string, reason: string): ModelBreakdown {
  return { name, displayName, fairValue: 0, weight: 0, skipped: reason };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}