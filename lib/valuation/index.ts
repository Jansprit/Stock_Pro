/**
 * 估值模組統一入口
 *
 * 並行呼叫 5 個估值模型，加權平均得出公允價值。
 * 任何模型缺資料會自動跳過，權重按剩餘模型比例重分配。
 */

import type { ValuationResult, ModelBreakdown } from './types';
import { DEFAULT_WEIGHTS } from './constants';
import { dcfModel } from './models/dcf';
import { ddmModel } from './models/ddm';
import { peMultipleModel } from './models/pe-multiple';
import { psMultipleModel } from './models/ps-multiple';
import { evEbitdaModel } from './models/ev-ebitda';

export interface ValuationInput {
  symbol: string;
  currency: string;

  // 報價與估值基本欄位
  price: number;
  eps?: number;
  beta?: number;
  roe?: number;
  payoutRatio?: number; // DPS / EPS
  sectorPeMedian?: number;
  sectorPsMedian?: number;
  sectorEvEbitdaMedian?: number;

  // 自由現金流與成長率
  fcf?: number;
  fcfCagr?: number;

  // 每股派生
  sps?: number; // 每股營收

  // SEC EDGAR 拉來的精確財報
  dps?: number;
  ebitda?: number;
  totalDebt?: number;
  cash?: number;
  sharesOutstanding?: number;

  // 巨集：無風險利率
  riskFreeRate: number;
}

export function runValuation(input: ValuationInput): ValuationResult {
  // 1. 跑各個模型
  const dcf = input.fcf ? dcfModel({
    fcf: input.fcf,
    fcfCagr: input.fcfCagr,
    beta: input.beta,
    riskFreeRate: input.riskFreeRate,
    sharesOutstanding: input.sharesOutstanding,
  }) : skipResult('dcf', 'DCF（5Y FCF 折現）', '無 FCF 資料');

  const ddm = ddmModel({
    dps: input.dps ?? 0,
    roe: input.roe,
    payoutRatio: input.payoutRatio,
    beta: input.beta,
    riskFreeRate: input.riskFreeRate,
  });

  const peMultiple = peMultipleModel({
    eps: input.eps ?? 0,
    sectorPeMedian: input.sectorPeMedian,
  });

  const psMultiple = psMultipleModel({
    sps: input.sps ?? 0,
    sectorPsMedian: input.sectorPsMedian,
  });

  const evEbitda = evEbitdaModel({
    ebitda: input.ebitda ?? 0,
    totalDebt: input.totalDebt ?? 0,
    cash: input.cash ?? 0,
    sharesOutstanding: input.sharesOutstanding ?? 0,
    sectorEvEbitdaMedian: input.sectorEvEbitdaMedian,
  });

  // 2. 計算權重重分配：把跳過的模型的權重，按比例分給沒跳過的
  const all: ModelBreakdown[] = [dcf, ddm, peMultiple, psMultiple, evEbitda];
  const valid = all.filter((m) => !m.skipped && m.fairValue > 0);
  const skipped = all.filter((m) => m.skipped);

  if (valid.length === 0) {
    return {
      symbol: input.symbol,
      currency: input.currency,
      fairValue: undefined,
      models: all.map((m) => ({ ...m, weight: 0 })),
      dispersion: undefined,
      computedAt: new Date().toISOString(),
    };
  }

  const weightMap: Record<string, number> = {
    dcf: DEFAULT_WEIGHTS.dcf,
    ddm: DEFAULT_WEIGHTS.ddm,
    peMultiple: DEFAULT_WEIGHTS.peMultiple,
    psMultiple: DEFAULT_WEIGHTS.psMultiple,
    evEbitda: DEFAULT_WEIGHTS.evEbitda,
  };

  // 跳過模型的權重 = 0；剩餘有效模型的權重按原比例放大
  const totalValidWeight = valid.reduce((s, m) => s + weightMap[m.name], 0);
  if (totalValidWeight <= 0) {
    // 全部預設權重都被跳過，平均分配
    const equal = 1 / valid.length;
    valid.forEach((m) => (m.weight = equal));
  } else {
    valid.forEach((m) => (m.weight = weightMap[m.name] / totalValidWeight));
    skipped.forEach((m) => (m.weight = 0));
  }

  // 3. 加權平均
  const fairValue = valid.reduce((s, m) => s + m.fairValue * m.weight, 0);

  // 合理性 sanity check：若模型結果偏離現價超過 80%，可能資料錯誤，標示但不丟棄
  const reasonable = input.price > 0 && fairValue > 0
    && Math.abs(fairValue - input.price) / input.price < 0.8;
  if (!reasonable) {
    console.warn(`[valuation] ${input.symbol}: 加權公允價值 ${fairValue.toFixed(2)} 與現價 ${input.price.toFixed(2)} 偏離 > 80%，可能輸入資料有誤`);
  }

  // 4. 計算分歧度（標準差 / 平均），>0.5 表示模型結果分歧大
  let dispersion: number | undefined;
  if (valid.length >= 2) {
    const mean = fairValue / valid.reduce((s, m) => s + m.weight, 0);
    const variance = valid.reduce((s, m) => s + m.weight * Math.pow(m.fairValue - mean, 2), 0);
    const std = Math.sqrt(variance);
    dispersion = mean > 0 ? std / mean : undefined;
  }

  return {
    symbol: input.symbol,
    currency: input.currency,
    fairValue,
    models: all.map((m) => ({ ...m, weight: m.weight })),
    dispersion,
    computedAt: new Date().toISOString(),
  };
}

function skipResult(name: 'dcf', displayName: string, reason: string): ModelBreakdown {
  return { name, displayName, fairValue: 0, weight: 0, skipped: reason };
}

export type { ValuationResult, ModelBreakdown } from './types';