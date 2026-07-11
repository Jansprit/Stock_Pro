/**
 * 共用型別定義
 *
 * 設計原則：所有外部資料來源（Yahoo Finance / Claude）都先對齊到這些型別，
 * 元件只接收這些型別，不直接耦合外部 SDK。
 */

// ========== 股票搜尋 ==========
export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  currency?: string;
}

// ========== 個股總覽 ==========
export interface StockOverview {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  avgVolume?: number;
  marketCap?: number;
  trailingPE?: number;
  /** 額外基本資料（從 Goodinfo 等台股網站擷取，optional） */
  chairman?: string;
  twseIndustry?: string;
  ipoDate?: string;
  mainProducts?: string;
  address?: string;
  employeeCount?: number;
  president?: string;
  spokesperson?: string;
  capitalPaidIn?: number;
  listingDate?: string;
  forwardPE?: number;
  eps?: number;
  beta?: number;
  dividendYield?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  sector?: string;
  industry?: string;
  description?: string;
  website?: string;
  country?: string;
  employees?: number;
  founded?: string;
  headquarters?: string;
  ceo?: string;

  // ========== 估值 / 分析師共識（公允價值面板用）==========
  /** 分析師目標均價（Yahoo v10 quoteSummary / Finnhub） */
  analystTargetMean?: number;
  /** 分析師目標最高價 */
  analystTargetHigh?: number;
  /** 分析師目標最低價 */
  analystTargetLow?: number;
  /** 提供目標價的分析師人數 */
  analystCount?: number;
  /** 評級共識（buy / hold / sell） */
  analystRating?: 'strongBuy' | 'buy' | 'hold' | 'sell' | 'strongSell';
  /** 目標價資料來源 */
  priceTargetSource?: 'yahoo-v10' | 'finnhub' | 'mock';
  /** 量化公允價值（5 模型加權平均，本機算） */
  fairValue?: number;
  /** 現價相對於分析師目標的溢/折價 %（正值 = 溢價，負值 = 折價） */
  premiumToAnalystTarget?: number;
  /** 現價相對於量化公允價值的溢/折價 % */
  premiumToFairValue?: number;
}

// ========== 歷史股價 ==========
export interface PricePoint {
  date: string; // ISO format YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartRange = '1M' | '3M' | '1Y' | '5Y';

// ========== 財務報表 ==========
export interface FinancialYear {
  year: number;
  // 損益表
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  // 資產負債表
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  // 現金流
  operatingCashFlow: number;
  freeCashFlow: number;
  // 比率（計算）
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
  debtToEquity: number;
  priceToBook?: number;
  peRatio?: number;
  currentRatio?: number;
}

export interface FinancialsData {
  symbol: string;
  currency: string;
  years: FinancialYear[];
}

// ========== 新聞 ==========
export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishDate: string;
  summary: string;
  category: 'operations' | 'financials' | 'industry' | 'legal' | 'market';
  sentiment: Sentiment;
  impact: string;
}

// ========== 競爭對手 ==========
export interface Competitor {
  symbol: string;
  name: string;
  /** 資料來源標記（'goodinfo' 表示由 Goodinfo 同業自動撈的；seeded 表示預先建表） */
  source?: string;
  marketCap?: number;
  revenue?: number;
  grossMargin?: number;
  netMargin?: number;
  eps?: number;
  pe?: number;
  ps?: number;
  evEbitda?: number;
  roe?: number;
  dividendYield?: number;
  growthRate?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  marketPosition: string;
  coreStrength: string;
  coreRisk: string;
}

export interface CompetitorData {
  competitors: Competitor[];
  aiSummary: string; // 由 AI 生成的相對優劣總結
}

// ========== AI 報告 ==========
export interface AIReport {
  summary: string; // 150-250 字公司摘要
  highlights: string[]; // 3-5 點投資亮點
  shortTermRisks: Array<{ title: string; description: string }>;
  midTermRisks: Array<{ title: string; description: string }>;
  longTermRisks: Array<{ title: string; description: string }>;
  strengths: Array<{ title: string; description: string }>;
  scores: {
    growth: number;
    profitability: number;
    financialSafety: number;
    competitiveAdvantage: number;
    valuation: number;
    newsSentiment: number;
    longTermPotential: number;
    overall: number;
  };
  scoreReasons: Record<string, string>;
  competitiveAnalysis: string; // 與競爭對手的相對優劣總結
  financialAnalysis: string; // 財務表現分析
  newsImpact: string; // 新聞影響總結
  conclusion: string; // 結論 150-200 字
}

// ========== Dashboard 整合資料 ==========
export interface DashboardData {
  overview: StockOverview;
  financials: FinancialsData;
  chart: PricePoint[];
  news: NewsItem[];
  competitors: CompetitorData;
  aiReport: AIReport | null;
  fetchedAt: string;
}

// ========== API 統一錯誤回應 ==========
export interface ApiError {
  error: true;
  message: string;
  code?: string;
}