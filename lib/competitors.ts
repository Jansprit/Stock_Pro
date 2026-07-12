/**
 * 主流股票競爭對手對照表
 *
 * 為何預先寫入：競爭對手清單需要領域知識（誰和誰競爭），
 * Yahoo Finance 沒有「競爭對手」這個資料欄位。
 *
 * 對於不在表中的股票，AI 會根據公司簡介推測（如果可以的話）。
 */

import type { Competitor } from './types';

interface CompetitorSeed {
  symbol: string;
  name: string;
  marketPosition: string;
  coreStrength: string;
  coreRisk: string;
  /**
   * 同業估值手填參考（2026-07 估值面板使用）
   * 沒填時估值模型會跳過該同業，避免 median 失真。
   *
   * 數值僅供同業相對比較，非即時報價。
   *   pe      — TTM 本益比
   *   ps      — TTM 股價營收比
   *   evEbitda — TTM EV/EBITDA 倍數
   */
  pe?: number;
  ps?: number;
  evEbitda?: number;
}

const COMPETITORS: Record<string, CompetitorSeed[]> = {
  // 科技龍頭
  AAPL: [
    { symbol: 'MSFT', name: 'Microsoft', marketPosition: '企業軟體、雲端、AI 領導者', coreStrength: 'Azure 雲端、Office 訂閱制', coreRisk: 'AI 投資回收期長', pe: 35, ps: 12, evEbitda: 23 },
    { symbol: 'GOOGL', name: 'Alphabet', marketPosition: '搜尋引擎、廣告、Android', coreStrength: '搜尋壟斷、YouTube', coreRisk: '反壟斷訴訟', pe: 22, ps: 6, evEbitda: 16 },
    { symbol: 'SAMSUNG', name: 'Samsung Electronics', marketPosition: '記憶體、手機、面板', coreStrength: '垂直整合、記憶體週期', coreRisk: '記憶體價格波動', pe: 18, ps: 1.5, evEbitda: 8 },
    { symbol: 'DELL', name: 'Dell Technologies', marketPosition: 'PC、伺服器、企業硬體', coreStrength: '企業端市占', coreRisk: 'PC 市場飽和', pe: 17, ps: 1.2, evEbitda: 11 },
  ],
  MSFT: [
    { symbol: 'AAPL', name: 'Apple', marketPosition: '消費電子、服務訂閱', coreStrength: '品牌與生態系', coreRisk: '依賴 iPhone 週期', pe: 30, ps: 8, evEbitda: 22 },
    { symbol: 'GOOGL', name: 'Alphabet', marketPosition: '搜尋、廣告、雲端', coreStrength: '搜尋引擎壟斷', coreRisk: '反壟斷壓力', pe: 22, ps: 6, evEbitda: 16 },
    { symbol: 'AMZN', name: 'Amazon', marketPosition: '電商、雲端', coreStrength: 'AWS 市占', coreRisk: '零售利潤低', pe: 45, ps: 3.5, evEbitda: 20 },
    { symbol: 'ORCL', name: 'Oracle', marketPosition: '企業資料庫', coreStrength: '企業客戶黏著', coreRisk: '雲端轉型壓力', pe: 28, ps: 7, evEbitda: 18 },
  ],
  GOOGL: [
    { symbol: 'META', name: 'Meta Platforms', marketPosition: '社群媒體、廣告', coreStrength: 'FB/IG 用戶規模', coreRisk: 'Z 世代流失', pe: 24, ps: 7, evEbitda: 15 },
    { symbol: 'MSFT', name: 'Microsoft', marketPosition: 'Bing、企業軟體', coreStrength: 'Bing + ChatGPT 整合', coreRisk: '搜尋市占低', pe: 35, ps: 12, evEbitda: 23 },
    { symbol: 'AAPL', name: 'Apple', marketPosition: '裝置、隱私', coreStrength: 'Safari 預設搜尋金流', coreRisk: '與 AI 整合較慢', pe: 30, ps: 8, evEbitda: 22 },
    { symbol: 'AMZN', name: 'Amazon', marketPosition: '電商、廣告', coreStrength: '產品搜尋廣告', coreRisk: '與 Google 廣告競爭', pe: 45, ps: 3.5, evEbitda: 20 },
  ],

  // 電動車
  TSLA: [
    { symbol: 'F', name: 'Ford', marketPosition: '傳統車廠、EV 轉型中', coreStrength: '製造規模與經銷網', coreRisk: 'EV 業務虧損', pe: 9, ps: 0.3, evEbitda: 6 },
    { symbol: 'GM', name: 'General Motors', marketPosition: '傳統車廠、Ultium 平台', coreStrength: '製造底盤與供應鏈', coreRisk: '中國市場退場', pe: 6, ps: 0.4, evEbitda: 5 },
    { symbol: 'RIVN', name: 'Rivian', marketPosition: '電動皮卡/SUV', coreStrength: 'Amazon 商用車訂單', coreRisk: '量產燒錢', pe: 0, ps: 1.5, evEbitda: 0 }, // 虧損同業，PE 設 0 排除
    { symbol: 'BYDDY', name: 'BYD', marketPosition: '中國 EV 龍頭', coreStrength: '價格戰、垂直整合', coreRisk: '中國市場內捲', pe: 18, ps: 1.2, evEbitda: 9 },
    { symbol: 'STLA', name: 'Stellantis', marketPosition: '全球多元車廠', coreStrength: '品牌組合', coreRisk: 'EV 轉型緩慢', pe: 6, ps: 0.3, evEbitda: 4 },
  ],

  // 半導體
  NVDA: [
    { symbol: 'AMD', name: 'AMD', marketPosition: 'CPU/GPU 次要供應商', coreStrength: '資料中心 MI 系列', coreRisk: '與 NVIDIA 差距大', pe: 45, ps: 10, evEbitda: 40 },
    { symbol: 'INTC', name: 'Intel', marketPosition: '傳統 CPU 龍頭、IDM', coreStrength: '美國製造補貼', coreRisk: '製程落後', pe: 0, ps: 2.5, evEbitda: 20 },
    { symbol: 'QCOM', name: 'Qualcomm', marketPosition: '行動晶片', coreStrength: '手機 SoC 領導地位', coreRisk: '行動市場成熟', pe: 18, ps: 4, evEbitda: 12 },
    { symbol: 'AVGO', name: 'Broadcom', marketPosition: '網通晶片、客製化 ASIC', coreStrength: '與 hyperscaler 關係', coreRisk: '客戶集中', pe: 35, ps: 13, evEbitda: 25 },
    { symbol: 'TSM', name: 'TSMC', marketPosition: '晶圓代工龍頭', coreStrength: '先進製程、產能規模', coreRisk: '地緣政治', pe: 25, ps: 8, evEbitda: 14 },
  ],
  AMD: [
    { symbol: 'NVDA', name: 'NVIDIA', marketPosition: 'AI 加速器龍頭', coreStrength: 'CUDA 護城河', coreRisk: '估值偏高', pe: 50, ps: 25, evEbitda: 45 },
    { symbol: 'INTC', name: 'Intel', marketPosition: '傳統 CPU、IDM', coreStrength: '自家晶圓廠', coreRisk: '製程延遲', pe: 0, ps: 2.5, evEbitda: 20 },
    { symbol: 'QCOM', name: 'Qualcomm', marketPosition: '行動 SoC', coreStrength: '手機晶片市占', coreRisk: 'PC/Server 拓展', pe: 18, ps: 4, evEbitda: 12 },
    { symbol: 'ARM', name: 'ARM Holdings', marketPosition: 'IP 授權', coreStrength: '節能架構授權', coreRisk: '授權費率壓力', pe: 70, ps: 30, evEbitda: 60 },
  ],

  // 台股
  '2330.TW': [
    { symbol: '2454.TW', name: '聯發科', marketPosition: 'IC 設計、手機 SoC', coreStrength: '手機與網通晶片', coreRisk: '手機市場飽和', pe: 18, ps: 2.5, evEbitda: 10 },
    { symbol: '2303.TW', name: '聯電', marketPosition: '成熟製程晶圓代工', coreStrength: '車用/IoT 布局', coreRisk: '製程落後先進', pe: 12, ps: 1.8, evEbitda: 6 },
    { symbol: 'TSM', name: 'TSMC', marketPosition: '全球晶圓代工龍頭', coreStrength: '先進製程、產能', coreRisk: '與台灣自身重疊（同一公司）', pe: 25, ps: 8, evEbitda: 14 },
    { symbol: '3711.TW', name: '日月光投控', marketPosition: '封測龍頭', coreStrength: '先進封裝', coreRisk: '毛利率受壓', pe: 15, ps: 1.5, evEbitda: 8 },
  ],
  '2454.TW': [
    { symbol: '2330.TW', name: '台積電', marketPosition: '晶圓代工', coreStrength: '先進製程', coreRisk: '需排隊等產能', pe: 25, ps: 8, evEbitda: 14 },
    { symbol: 'QCOM', name: 'Qualcomm', marketPosition: '行動晶片', coreStrength: '高階 SoC', coreRisk: '與聯發科價格戰', pe: 18, ps: 4, evEbitda: 12 },
    { symbol: 'NVDA', name: 'NVIDIA', marketPosition: 'GPU、AI', coreStrength: 'AI 加速器', coreRisk: '與聯發科無重疊', pe: 50, ps: 25, evEbitda: 45 },
  ],
  '2303.TW': [
    { symbol: '2330.TW', name: '台積電', marketPosition: '晶圓代工', coreStrength: '先進製程', coreRisk: '聯電無法追趕', pe: 25, ps: 8, evEbitda: 14 },
    { symbol: '2454.TW', name: '聯發科', marketPosition: 'IC 設計', coreStrength: '產品多元', coreRisk: '客戶集中', pe: 18, ps: 2.5, evEbitda: 10 },
    { symbol: '0522.TW', name: '世界先進', marketPosition: '成熟製程晶圓代工', coreStrength: '車用面板驅動', coreRisk: '同質競爭', pe: 14, ps: 3, evEbitda: 8 },
  ],
  '2308.TW': [
    { symbol: '2330.TW', name: '台積電', marketPosition: '晶圓代工', coreStrength: '先進製程', coreRisk: '與台達電業務無重疊', pe: 25, ps: 8, evEbitda: 14 },
    { symbol: '2383.TW', name: '台光電', marketPosition: '銅箔基板、散熱', coreStrength: '高頻高速材料', coreRisk: '原料價格波動', pe: 20, ps: 3, evEbitda: 12 },
    { symbol: 'GIGAFACTORY', name: '國際電源管理同業', marketPosition: '工業電源', coreStrength: '工業客戶黏著', coreRisk: '電動車轉型壓力', pe: 18, ps: 2.2, evEbitda: 11 },
  ],
  '2317.TW': [
    { symbol: '2357.TW', name: '華碩', marketPosition: 'PC、主機板、品牌', coreStrength: '品牌力', coreRisk: 'PC 市場飽和', pe: 12, ps: 0.6, evEbitda: 7 },
    { symbol: '2382.TW', name: '廣達', marketPosition: '伺服器、筆電代工', coreStrength: '雲端伺服器', coreRisk: '毛利受壓', pe: 20, ps: 1.2, evEbitda: 14 },
    { symbol: 'AAPL', name: 'Apple', marketPosition: '最大客戶', coreStrength: '消費電子領導', coreRisk: '客戶過度集中', pe: 30, ps: 8, evEbitda: 22 },
  ],
  '3711.TW': [
    { symbol: '2330.TW', name: '台積電', marketPosition: '晶圓代工', coreStrength: '先進製程', coreRisk: '封測依賴客戶製程', pe: 25, ps: 8, evEbitda: 14 },
    { symbol: '6239.TW', name: '力成', marketPosition: '封測', coreStrength: '記憶體封測', coreRisk: '記憶體循環', pe: 12, ps: 1, evEbitda: 6 },
    { symbol: 'ASX', name: '日月光（美 ADR）', marketPosition: '封測全球', coreStrength: '規模', coreRisk: '與 3711.TW 同集團', pe: 15, ps: 1.5, evEbitda: 8 },
  ],

  // 記憶體 / 面板（上櫃）
  '6488.TWO': [
    { symbol: '2337.TW', name: '旺宏', marketPosition: 'NOR Flash', coreStrength: '車用記憶體', coreRisk: 'NOR 市場規模有限', pe: 0, ps: 1.5, evEbitda: 7 },
    { symbol: '2344.TW', name: '華邦電', marketPosition: 'DRAM / Flash', coreStrength: '利基型記憶體', coreRisk: '景氣循環', pe: 0, ps: 1.4, evEbitda: 8 },
    { symbol: '4961.TW', name: '天鈺', marketPosition: '驅動 IC', coreStrength: '面板驅動', coreRisk: '與環球晶業務無重疊', pe: 18, ps: 2.5, evEbitda: 9 },
  ],

  // 航運
  '2603.TW': [
    { symbol: '2609.TW', name: '陽明海運', marketPosition: '貨櫃航運', coreStrength: '亞洲航線', coreRisk: '運價波動', pe: 5, ps: 0.8, evEbitda: 4 },
    { symbol: '2615.TW', name: '萬海航運', marketPosition: '貨櫃航運', coreStrength: '亞洲區域', coreRisk: '運價波動', pe: 4, ps: 0.6, evEbitda: 3 },
    { symbol: 'MAERSK', name: 'Maersk', marketPosition: '全球貨櫃龍頭', coreStrength: '全球網絡', coreRisk: '紅海危機', pe: 6, ps: 0.7, evEbitda: 5 },
  ],

  // 金融
  '2881.TW': [
    { symbol: '2882.TW', name: '國泰金', marketPosition: '壽險、銀行', coreStrength: '壽險市占', coreRisk: '匯率敏感', pe: 10, ps: 1, evEbitda: 0 },
    { symbol: '2884.TW', name: '玉山金', marketPosition: '銀行、壽險', coreStrength: '消金品牌', coreRisk: '利差縮', pe: 11, ps: 1.2, evEbitda: 0 },
    { symbol: '2885.TW', name: '元大金', marketPosition: '證券、銀行', coreStrength: '券商龍頭', coreRisk: '景氣循環', pe: 9, ps: 0.9, evEbitda: 0 },
  ],
  '2884.TW': [
    { symbol: '2881.TW', name: '富邦金', marketPosition: '壽險', coreStrength: '壽險規模', coreRisk: '與玉山同質', pe: 10, ps: 1, evEbitda: 0 },
    { symbol: '2882.TW', name: '國泰金', marketPosition: '壽險', coreStrength: '市占', coreRisk: '同上', pe: 10, ps: 1, evEbitda: 0 },
    { symbol: '2887.TW', name: '台新金', marketPosition: '銀行', coreStrength: '消金客群', coreRisk: '利差縮', pe: 10, ps: 1.1, evEbitda: 0 },
  ],

  // 電子代工
  '2382.TW': [
    { symbol: '2317.TW', name: '鴻海', marketPosition: 'EMS 代工', coreStrength: '規模', coreRisk: '毛利受壓', pe: 14, ps: 0.6, evEbitda: 9 },
    { symbol: '3231.TW', name: '緯創', marketPosition: '伺服器、筆電', coreStrength: 'AI 伺服器', coreRisk: '客戶集中', pe: 18, ps: 0.8, evEbitda: 12 },
    { symbol: '6669.TW', name: '緯穎', marketPosition: '雲端伺服器', coreStrength: '超大規模客戶', coreRisk: '客戶集中', pe: 22, ps: 1.5, evEbitda: 16 },
  ],

  // 雲端/平台
  AMZN: [
    { symbol: 'MSFT', name: 'Microsoft', marketPosition: '企業雲端', coreStrength: 'Azure、Office', coreRisk: '與 OpenAI 投入大', pe: 35, ps: 12, evEbitda: 23 },
    { symbol: 'GOOGL', name: 'Alphabet', marketPosition: '搜尋、雲端', coreStrength: 'GCP、AI', coreRisk: '雲端市占第三', pe: 22, ps: 6, evEbitda: 16 },
    { symbol: 'BABA', name: 'Alibaba', marketPosition: '中國電商、雲端', coreStrength: '中國市場', coreRisk: '中國監管', pe: 10, ps: 1.2, evEbitda: 8 },
    { symbol: 'SHOP', name: 'Shopify', marketPosition: '中小電商 SaaS', coreStrength: '獨立站工具', coreRisk: '與 Amazon 競爭不對稱', pe: 70, ps: 12, evEbitda: 50 },
  ],
  META: [
    { symbol: 'GOOGL', name: 'Alphabet', marketPosition: '數位廣告', coreStrength: '搜尋廣告', coreRisk: '與 META 互搶廣告', pe: 22, ps: 6, evEbitda: 16 },
    { symbol: 'SNAP', name: 'Snap', marketPosition: '社群', coreStrength: '年輕用戶', coreRisk: '從未穩定獲利', pe: 0, ps: 2.5, evEbitda: 25 },
    { symbol: 'PINS', name: 'Pinterest', marketPosition: '視覺社群', coreStrength: '電子商務意圖', coreRisk: '規模有限', pe: 30, ps: 6, evEbitda: 20 },
    { symbol: 'MSFT', name: 'Microsoft', marketPosition: 'LinkedIn 持有', coreStrength: '專業人士社群', coreRisk: '成長平穩', pe: 35, ps: 12, evEbitda: 23 },
  ],

  // 金融
  JPM: [
    { symbol: 'BAC', name: 'Bank of America', marketPosition: '美國大型銀行', coreStrength: '零售銀行規模', coreRisk: '利率敏感', pe: 12, ps: 2.5, evEbitda: 0 },
    { symbol: 'WFC', name: 'Wells Fargo', marketPosition: '美國大型銀行', coreStrength: '商業地產', coreRisk: '監管限制', pe: 11, ps: 2.2, evEbitda: 0 },
    { symbol: 'C', name: 'Citigroup', marketPosition: '全球銀行', coreStrength: '國際業務', coreRisk: '轉型緩慢', pe: 9, ps: 1.5, evEbitda: 0 },
    { symbol: 'GS', name: 'Goldman Sachs', marketPosition: '投資銀行', coreStrength: '交易與承銷', coreRisk: '週期性高', pe: 13, ps: 3, evEbitda: 0 },
  ],

  // 醫療
  JNJ: [
    { symbol: 'PFE', name: 'Pfizer', marketPosition: '製藥', coreStrength: '疫苗管線', coreRisk: '專利懸崖', pe: 14, ps: 3, evEbitda: 9 },
    { symbol: 'MRK', name: 'Merck', marketPosition: '製藥', coreStrength: 'Keytruda', coreRisk: 'Keytruda 專利到期', pe: 16, ps: 4, evEbitda: 11 },
    { symbol: 'LLY', name: 'Eli Lilly', marketPosition: '製藥、減肥藥', coreStrength: 'GLP-1 領導地位', coreRisk: '估值極高', pe: 55, ps: 14, evEbitda: 35 },
    { symbol: 'ABBV', name: 'AbbVie', marketPosition: '製藥', coreStrength: 'Humira 後繼者', coreRisk: 'Humira 衰退', pe: 15, ps: 4, evEbitda: 10 },
  ],
  LLY: [
    { symbol: 'NVO', name: 'Novo Nordisk', marketPosition: '減肥藥龍頭', coreStrength: 'Ozempic/Wegovy', coreRisk: '供不應求', pe: 28, ps: 10, evEbitda: 20 },
    { symbol: 'JNJ', name: 'Johnson & Johnson', marketPosition: '多元製藥', coreStrength: '規模與多元化', coreRisk: '創新速度較慢', pe: 22, ps: 5, evEbitda: 14 },
    { symbol: 'PFE', name: 'Pfizer', marketPosition: '製藥', coreStrength: 'COVID 後現金流', coreRisk: '研發產出下降', pe: 14, ps: 3, evEbitda: 9 },
  ],

  // === 台股 ETF（主動型 / 被動型對照）===
  '00405A.TW': [
    { symbol: '0050.TW', name: '元大台灣 50 ETF', marketPosition: '被動追蹤台灣 50 指數、市值最大 ETF', coreStrength: '市值加權、流動性最佳', coreRisk: '受台積電權重影響大' },
    { symbol: '0056.TW', name: '元大高股息 ETF', marketPosition: '被動追蹤高股息指數', coreStrength: '高殖利率、配息穩定', coreRisk: '選股規則侷限大型股' },
    { symbol: '00878.TW', name: '國泰永續高股息 ETF', marketPosition: '被動追蹤 ESG 高股息指數', coreStrength: 'ESG 篩選、配息穩定', coreRisk: '規則複雜、規模膨脹稀釋' },
    { symbol: '00918.TW', name: '統一台灣高息 ETF', marketPosition: '被動追蹤高息精選 30 指數', coreStrength: '高息篩選、規則透明', coreRisk: '持股集中金融股' },
    { symbol: '00400A.TW', name: '主動國泰動能高息', marketPosition: '主動型高息 ETF（同類新兵）', coreStrength: '基金經理人主動選股', coreRisk: '主動管理費較高、上市時間短' },
  ],
  '00400A.TW': [
    { symbol: '00405A.TW', name: '主動富邦台灣龍耀', marketPosition: '主動型 ETF（同類競爭）', coreStrength: '富邦投信主動選股', coreRisk: '上市時間短、無歷史績效' },
    { symbol: '0050.TW', name: '元大台灣 50 ETF', marketPosition: '被動型旗艦', coreStrength: '規模最大、流動性最佳', coreRisk: '與主動 ETF 投資邏輯不同' },
    { symbol: '0056.TW', name: '元大高股息 ETF', marketPosition: '高息被動型', coreStrength: '高股息、配息穩', coreRisk: '規則限制' },
  ],
};

/**
 * 取得某股票的同業估值中位數（給估值模型用）
 *
 * 注意：這裡回傳的是 Competitor.pe / ps / evEbitda 的**中位數**，
 * 取自 fetchCompetitorMetrics 抓到的最新數字。如果沒抓到（PE 為 0）就排除。
 */
export function getSectorValuationMedian(symbol: string, peers: Competitor[]): {
  pe?: number;
  ps?: number;
  evEbitda?: number;
} {
  const pes = peers.map((p) => p.pe).filter((v): v is number => typeof v === 'number' && v > 0 && v < 200);
  const pss = peers.map((p) => p.ps).filter((v): v is number => typeof v === 'number' && v > 0 && v < 50);
  const evs = peers.map((p) => p.evEbitda).filter((v): v is number => typeof v === 'number' && v > 0 && v < 100);
  return {
    pe: pes.length >= 2 ? median(pes) : undefined,
    ps: pss.length >= 2 ? median(pss) : undefined,
    evEbitda: evs.length >= 2 ? median(evs) : undefined,
  };
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
}

/**
 * 取得某股票的競爭對手清單
 *
 * 如果該股票不在預設表中，回傳空陣列（呼叫端會回退到 AI 生成）
 */
export function getCompetitorsForSymbol(symbol: string): Competitor[] {
  const seeds = COMPETITORS[symbol.toUpperCase()];
  if (!seeds) return [];
  return seeds.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    marketPosition: s.marketPosition,
    coreStrength: s.coreStrength,
    coreRisk: s.coreRisk,
    // 把手填的同業估值參考帶到 Competitor 結構
    pe: s.pe,
    ps: s.ps,
    evEbitda: s.evEbitda,
  }));
}

/**
 * 判斷是否為預設支援股票
 */
export function hasCompetitorTable(symbol: string): boolean {
  return symbol.toUpperCase() in COMPETITORS;
}

/** 測試 / 健康檢查 */
export function isAvailable(): boolean {
  return true;
}

// ========== 行業 / 產業分類 → 通用美股同業清單 ==========
//
// 用途：當某檔個股（如 NOK / Communications）不在 COMPETITORS map 時，
// 改用其 industry 從這張表查同業。涵蓋常見 US sector / industry。
//
// 注意：這是「合理 fallback」，不是精準 mapping。
// 真正的精準是各公司自家 10-K 的 Item 1 Competition 章節。

export interface IndustryPeer {
  symbol: string;
  name: string;
  marketPosition: string;
  coreStrength: string;
  coreRisk: string;
  pe?: number;
  ps?: number;
  evEbitda?: number;
}

export const INDUSTRY_PEERS: Record<string, IndustryPeer[]> = {
  // 通訊設備（NOK / ERIC / CSCO 屬此）
  'Communication Equipment': [
    { symbol: 'CSCO', name: 'Cisco Systems', marketPosition: '企業網通龍頭', coreStrength: '路由器/交換器市占', coreRisk: '成長趨緩', pe: 18, ps: 4.5, evEbitda: 13 },
    { symbol: 'MSI', name: 'Motorola Solutions', marketPosition: '公共安全通訊', coreStrength: '政府標案穩定', coreRisk: '估值偏高', pe: 32, ps: 6, evEbitda: 20 },
    { symbol: 'ERIC', name: 'Ericsson (ADR)', marketPosition: '5G 設備大廠', coreStrength: '電信營運商關係', coreRisk: '中國華為競爭', pe: 16, ps: 1.2, evEbitda: 8 },
    { symbol: 'QCOM', name: 'Qualcomm', marketPosition: '行動晶片 + 授權', coreStrength: '專利授權收入', coreRisk: '手機市場成熟', pe: 18, ps: 4, evEbitda: 12 },
    { symbol: 'JNPR', name: 'Juniper Networks', marketPosition: '企業路由/資料中心', coreStrength: 'Mist AI 平台', coreRisk: '思科擠壓', pe: 22, ps: 2.5, evEbitda: 14 },
  ],
  // 科技硬體
  'Computer Hardware': [
    { symbol: 'DELL', name: 'Dell Technologies', marketPosition: '伺服器/儲存', coreStrength: '企業客戶關係', coreRisk: 'PC 市場萎縮', pe: 18, ps: 1.2, evEbitda: 11 },
    { symbol: 'HPE', name: 'Hewlett Packard Enterprise', marketPosition: '企業 IT 基礎設施', coreStrength: 'Edge 運算布局', coreRisk: '雲端競爭', pe: 12, ps: 1, evEbitda: 9 },
    { symbol: 'HPQ', name: 'HP Inc.', marketPosition: 'PC / 列印', coreStrength: '商用 PC 市占', coreRisk: '列印市場萎縮', pe: 10, ps: 0.5, evEbitda: 7 },
  ],
  // 通訊服務
  'Telecom Services': [
    { symbol: 'T', name: 'AT&T', marketPosition: '美國電信', coreStrength: '5G + 光纖覆蓋', coreRisk: '高負債', pe: 9, ps: 1.4, evEbitda: 7 },
    { symbol: 'VZ', name: 'Verizon', marketPosition: '美國最大電信', coreStrength: '頻譜資源', coreRisk: '競爭 + 利率', pe: 10, ps: 1.5, evEbitda: 7.5 },
    { symbol: 'TMUS', name: 'T-Mobile US', marketPosition: '美國電信 #3', coreStrength: '5G 領先', coreRisk: '客戶成長趨緩', pe: 23, ps: 2.7, evEbitda: 11 },
  ],
};

/**
 * 從 industry 名稱查 fallback 同業群（大小寫不敏感）
 */
export function getIndustryPeers(industry: string | undefined): IndustryPeer[] {
  if (!industry) return [];
  const key = Object.keys(INDUSTRY_PEERS).find((k) => k.toLowerCase() === industry.toLowerCase());
  return key ? INDUSTRY_PEERS[key]! : [];
}