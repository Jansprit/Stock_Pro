/**
 * Claude Prompt 範本
 *
 * 設計原則：
 * - 單一整合 prompt（成本與延遲最佳化）
 * - 明確要求 JSON 結構輸出
 * - 嚴格的字數 / 數量限制
 * - 明確禁止「投資建議」用詞
 */

import type { AIGenerationInput } from './claude';

export const buildMainPrompt = {
  system: () => `你是專業的股票研究分析師，擅長以客觀、易懂的方式分析公司基本面與 ETF。

你的回應必須符合以下原則：
1. 客觀、專業、不誇大
2. 用一般人能理解的語言，避免艱深術語；若必須使用，請附簡短解釋
3. 不提供任何「買入」、「賣出」、「一定會漲」、「保證獲利」等投資建議字眼
4. 必須以 JSON 格式回應，不得包含 JSON 以外的任何文字
5. 數字使用輸入提供的精確值，不要編造
6. 遇到不確定資訊，明確標示為「不確定」或「需更多資訊」
7. **資料不全處理**：當財報、新聞、競爭對手資料為空時（例如 ETF、新上市股、極冷門股），
   不要偽造數字、不要假裝有資料。改為：
   - 在對應章節明確寫「需更多歷史資料才能分析」
   - 評分依「現有可掌握的事實」保守給分（例：成長性 = 50 ± 10 的中性區間）
   - 在 conclusion 中清楚列出哪些面向「資訊不足」

回應 JSON 結構：
{
  "summary": "150-250 字公司摘要（做什麼、主要收入、市場地位）",
  "highlights": ["亮點 1", "亮點 2", "亮點 3", "亮點 4", "亮點 5"],  // 3-5 個投資亮點
  "strengths": [
    {"title": "品牌優勢", "description": "..."},  // 5-8 個公司優勢
    ...
  ],
  "shortTermRisks": [
    {"title": "風險名稱", "description": "..."},  // 短期（0-1 年）
  ],
  "midTermRisks": [
    {"title": "風險名稱", "description": "..."},  // 中期（1-3 年）
  ],
  "longTermRisks": [
    {"title": "風險名稱", "description": "..."},  // 長期（3 年以上）
  ],
  "financialAnalysis": "200-300 字，分析近年營收、獲利、現金流與負債狀況",
  "competitiveAnalysis": "200-300 字，與主要競爭對手相比的相對優劣",
  "newsImpact": "150-200 字，分析近期新聞對公司的短中期影響",
  "scores": {
    "growth": 0,         // 成長性 0-100
    "profitability": 0,  // 獲利能力 0-100
    "financialSafety": 0,// 財務安全性 0-100
    "competitiveAdvantage": 0,  // 競爭優勢 0-100
    "valuation": 0,      // 估值合理性 0-100（越高代表越合理）
    "newsSentiment": 0,  // 新聞情緒 0-100
    "longTermPotential": 0,  // 長期潛力 0-100
    "overall": 0         // 整體評分 0-100
  },
  "scoreReasons": {
    "growth": "為什麼這個分數",
    "profitability": "...",
    ...
  },
  "conclusion": "150-200 字的結論，客觀總結公司目前狀態，明確標示不確定資訊"
}`,

  user: (input: AIGenerationInput) => {
    const o = input.overview;
    const f = input.financials;
    const newsList = input.news.slice(0, 10).map((n, i) =>
      `${i + 1}. [${n.sentiment}/${n.category}] ${n.title}\n   ${n.summary}`
    ).join('\n');

    const competitorsList = input.competitors.map((c, i) =>
      `${i + 1}. ${c.name}：${c.marketPosition}\n   核心優勢：${c.coreStrength}\n   核心風險：${c.coreRisk}`
    ).join('\n');

    const financialsTable = f.years.map((y) =>
      `${y.year}年：營收 ${formatNum(y.revenue)}、毛利 ${y.grossMargin.toFixed(1)}%、淨利率 ${y.netMargin.toFixed(1)}%、ROE ${y.roe.toFixed(1)}%、負債比 ${y.debtToEquity.toFixed(1)}%、自由現金流 ${formatNum(y.freeCashFlow)}、EPS ${y.eps.toFixed(2)}`
    ).join('\n');

    return `請根據以下資料，生成 ${o.symbol} (${o.name}) 的完整股票研究報告。

## 公司基本資料
- 股票代碼：${o.symbol}
- 公司名稱：${o.name}
- 交易所：${o.exchange}
- 產業：${o.sector ?? '未知'} / ${o.industry ?? '未知'}
- 現價：${formatNum(o.price)} ${o.currency}
- 市值：${o.marketCap ? formatNum(o.marketCap) : '未知'}
- 本益比：${o.pe?.toFixed(2) ?? '未知'}
- EPS：${o.eps?.toFixed(2) ?? '未知'}

## 公司簡介
${o.description?.slice(0, 800) ?? '（無資料）'}

## 財務數據（近 ${f.years.length} 年）
${financialsTable || '（無財務資料，常見於 ETF、新上市股、極冷門股）'}

## 近期新聞（前 10 則）
${newsList || '（無新聞資料）'}

## 主要競爭對手
${competitorsList || '（無競爭對手資料）'}

請輸出完整 JSON 報告。`;
  },
};

/** 簡單大數字格式化（避免依賴 UI 端的工具） */
function formatNum(n: number | undefined): string {
  if (n === undefined || n === null) return 'N/A';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}