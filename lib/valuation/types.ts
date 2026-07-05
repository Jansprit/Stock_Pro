/**
 * 估值結果型別
 */

export type ModelName = 'dcf' | 'ddm' | 'peMultiple' | 'psMultiple' | 'evEbitda';

export interface ModelBreakdown {
  name: ModelName;
  displayName: string;
  fairValue: number;
  weight: number; // 0-1，含重分配後的權重
  /** 模型無法計算的原因（缺資料等） */
  skipped?: string;
}

export interface ValuationResult {
  symbol: string;
  currency: string;
  fairValue?: number; // 加權平均後的公允價值（undefined 表示全部模型跳過）
  models: ModelBreakdown[];
  /** 模型結果的標準差 / 平均，作為「模型分歧度」指標（> 0.5 = 分歧大） */
  dispersion?: number;
  computedAt: string; // ISO
}