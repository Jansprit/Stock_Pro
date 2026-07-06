/**
 * 列印區塊 key 型別（純型別，server-safe，可被 API route / server component import）
 */

export type PrintSectionKey =
  | 'overview'
  | 'valuation'
  | 'priceChart'
  | 'financialCharts'
  | 'aiAnalysis'
  | 'companyProfile'
  | 'news'
  | 'competitors'
  | 'researchReport';

export const PRINT_SECTION_LABELS: Record<PrintSectionKey, string> = {
  overview: '總覽（個股基本資料）',
  valuation: '估值分析（量化公允 + 分析師目標）',
  priceChart: '股價走勢圖',
  financialCharts: '財務趨勢圖（營收/淨利/EPS/毛利率/現金流）',
  aiAnalysis: 'AI 分析報告（7 評分）',
  companyProfile: '公司資料 + 財務數據表（並排）',
  news: '相關新聞',
  competitors: '競爭對手比較',
  researchReport: '完整研究報告（展開）',
};

export const DEFAULT_PRINT_SECTIONS: Record<PrintSectionKey, boolean> = {
  overview: true,
  valuation: true,
  priceChart: true,
  financialCharts: true,
  aiAnalysis: true,
  companyProfile: true,
  news: false,
  competitors: true,
  researchReport: true,
};

export const ALL_SECTION_KEYS: PrintSectionKey[] = Object.keys(DEFAULT_PRINT_SECTIONS) as PrintSectionKey[];