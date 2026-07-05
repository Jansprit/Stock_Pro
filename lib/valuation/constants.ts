/**
 * 估值模組常數
 *
 * 這些是寫死的合理預設值，使用者可在 .env.local 覆寫：
 *   VALUATION_ERP=0.055
 *   VALUATION_SAFE_GDP=0.025
 *   VALUATION_SAFE_PE=15
 *   VALUATION_DCF_PROJECTION_YEARS=5
 */

/** Equity Risk Premium（股票市場風險溢酬）歷史平均 ~5.5% */
export const DEFAULT_ERP = Number(process.env.VALUATION_ERP ?? '0.055');
/** 長期 GDP / 通膨上限，避免模型過度樂觀 */
export const DEFAULT_SAFE_GDP = Number(process.env.VALUATION_SAFE_GDP ?? '0.025');
/** 長期 S&P 500 平均本益比，保守預設 15 */
export const DEFAULT_SAFE_PE = Number(process.env.VALUATION_SAFE_PE ?? '15');
/** DCF 預估年數 */
export const DCF_PROJECTION_YEARS = Number(process.env.VALUATION_DCF_YEARS ?? '5');

/** 5 模型加權（缺資料時自動按比例重分配） */
export const DEFAULT_WEIGHTS = {
  dcf: Number(process.env.VALUATION_W_DCF ?? '0.30'),
  ddm: Number(process.env.VALUATION_W_DDM ?? '0.15'),
  peMultiple: Number(process.env.VALUATION_W_PE ?? '0.25'),
  psMultiple: Number(process.env.VALUATION_W_PS ?? '0.15'),
  evEbitda: Number(process.env.VALUATION_W_EVEBITDA ?? '0.15'),
};