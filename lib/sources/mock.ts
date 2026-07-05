/**
 * 本地種子資料 — 當所有 API 都失敗時的最後回退
 *
 * 這個檔案**不是**設計來給真實投資決策使用 — 只是讓 UI 在完全沒有網路
 * 或所有 API 都 rate-limit 時不會全空白。
 *
 * 注意：當外部 API 部分欄位缺失時（例如 Finnhub 對台股 profile 不付費，
 * Alpha Vantage 達 daily limit），這個 mock 也會被當作 fallback 補上
 * sector / industry / description 等元資料。
 */

import type { SearchResult, StockOverview, PricePoint } from '../types';

const MOCK_SEED: Record<string, Partial<StockOverview>> = {
  // === 美股科技 / 半導體 / 電動車 ===
  AAPL: { name: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics' },
  MSFT: { name: 'Microsoft Corporation', sector: 'Technology', industry: 'Software' },
  GOOGL: { name: 'Alphabet Inc.', sector: 'Communication Services', industry: 'Internet Content' },
  NVDA: { name: 'NVIDIA Corporation', sector: 'Technology', industry: 'Semiconductors' },
  AMD: { name: 'Advanced Micro Devices', sector: 'Technology', industry: 'Semiconductors' },
  AMZN: { name: 'Amazon.com Inc.', sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  META: { name: 'Meta Platforms Inc.', sector: 'Communication Services', industry: 'Social Media' },
  TSLA: { name: 'Tesla Inc.', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  JPM: { name: 'JPMorgan Chase & Co.', sector: 'Financial Services', industry: 'Banks' },
  JNJ: { name: 'Johnson & Johnson', sector: 'Healthcare', industry: 'Pharmaceutical' },
  LLY: { name: 'Eli Lilly and Company', sector: 'Healthcare', industry: 'Pharmaceutical' },

  // === 台股（Finnhub 對台股 profile 不付費，這裡補公司基本資料） ===
  // 注意：beta 是估值模型（WACC = rf + β × ERP）的必要輸入。
  // 這裡手填合理預設值，使用者可在 .env.local 透過 SEC/Finnhub 覆蓋。
  '2330.TW': {
    name: '台積電',
    sector: 'Technology',
    industry: 'Semiconductors',
    country: 'TW',
    description:
      '台灣積體電路製造股份有限公司（TSMC）是全球最大的專業積體電路代工廠，提供先進製程晶圓製造服務，客戶涵蓋全球主要半導體設計公司。',
    website: 'https://www.tsmc.com',
    headquarters: '新竹科學園區，台灣',
    founded: '1987',
    beta: 1.10, // 半導體龍頭，略大於大盤
  },
  '2454.TW': {
    name: '聯發科',
    sector: 'Technology',
    industry: 'Semiconductors',
    country: 'TW',
    description: '聯發科技股份有限公司是全球領先的無晶圓廠半導體公司，專注於智慧型手機、物聯網、智慧家庭等晶片設計。',
    website: 'https://www.mediatek.com',
    headquarters: '新竹科學園區，台灣',
    founded: '1997',
    beta: 1.25, // IC 設計，波動較大
  },
  '2308.TW': {
    name: '台達電',
    sector: 'Technology',
    industry: 'Electronic Components',
    country: 'TW',
    description: '台達電子工業股份有限公司是全球電源管理與散熱解決方案領導廠商，產品涵蓋工業自動化、資料中心、電動車充電等。',
    website: 'https://www.deltaww.com',
    headquarters: '桃園市，台灣',
    founded: '1971',
    beta: 1.05, // 電源/工業，穩定
  },
  '2317.TW': {
    name: '鴻海',
    sector: 'Technology',
    industry: 'Contract Manufacturing',
    country: 'TW',
    description: '鴻海精密工業股份有限公司（富士康）是全球最大的電子代工服務（EMS）廠商，主要客戶涵蓋 Apple、NVIDIA、Microsoft 等。',
    website: 'https://www.honhai.com',
    headquarters: '新北市，台灣',
    founded: '1974',
    beta: 0.95, // 代工毛利穩定
  },
  '2603.TW': {
    name: '長榮海運',
    sector: 'Industrials',
    industry: 'Marine Shipping',
    country: 'TW',
    description: '長榮海運股份有限公司是台灣最大的貨櫃航運公司之一，全球航線網絡完整。',
    website: 'https://www.evergreen-marine.com',
    headquarters: '台北市，台灣',
    founded: '1968',
    beta: 1.35, // 航運景氣循環
  },
  '2303.TW': {
    name: '聯電',
    sector: 'Technology',
    industry: 'Semiconductors',
    country: 'TW',
    description: '聯華電子股份有限公司為全球前十大晶圓代工廠，聚焦成熟製程，服務車用、物聯網等應用。',
    website: 'https://www.umc.com',
    headquarters: '新竹科學園區，台灣',
    founded: '1980',
    beta: 1.30, // 晶圓代工
  },
  '2382.TW': {
    name: '廣達',
    sector: 'Technology',
    industry: 'Computer Hardware',
    country: 'TW',
    description: '廣達電腦股份有限公司是全球最大的筆記型電腦與伺服器代工廠，近年 AI 伺服器業務高速成長。',
    website: 'https://www.quantatw.com',
    headquarters: '桃園市，台灣',
    founded: '1988',
    beta: 1.15, // AI 伺服器題材，波動中高
  },
  '2881.TW': {
    name: '富邦金',
    sector: 'Financial Services',
    industry: 'Banks',
    country: 'TW',
    description: '富邦金融控股股份有限公司是台灣第二大金控，旗下擁有富邦人壽、富邦銀行、富邦證券等子公司。',
    website: 'https://www.fubon.com',
    headquarters: '台北市，台灣',
    founded: '2001',
    beta: 0.85, // 金融穩定
  },
  '2882.TW': {
    name: '國泰金',
    sector: 'Financial Services',
    industry: 'Insurance',
    country: 'TW',
    description: '國泰金融控股股份有限公司是台灣資產規模最大的金控公司，旗下國泰人壽為台灣壽險龍頭。',
    website: 'https://www.cathayholdings.com.tw',
    headquarters: '台北市，台灣',
    founded: '2001',
    beta: 0.90,
  },
  '2884.TW': {
    name: '玉山金',
    sector: 'Financial Services',
    industry: 'Banks',
    country: 'TW',
    description: '玉山金融控股股份有限公司以玉山商業銀行為主體，是台灣消金品牌力最強的銀行之一。',
    website: 'https://www.esunbank.com.tw',
    headquarters: '台北市，台灣',
    founded: '2002',
    beta: 0.80,
  },
  '6488.TWO': {
    name: '環球晶',
    sector: 'Technology',
    industry: 'Semiconductors',
    country: 'TW',
    description: '環球晶圓股份有限公司為全球第三大半導體矽晶圓製造商，產品涵蓋 3 吋至 12 吋矽晶圓。',
    website: 'https://www.sas-globalwafers.com',
    headquarters: '新竹科學園區，台灣',
    founded: '2011',
    beta: 1.40, // 矽晶圓景氣循環
  },

  // === 台股 ETF（顯示用 sector/industry）===
  '00918.TW': {
    name: 'UOB 台灣高股息精選 30 ETF（原名稱：高息恢復）',
    sector: 'Financial Services',
    industry: 'ETF',
    country: 'TW',
    description: '統一台灣高息精選 30 ETF，追蹤台灣高股息指數。',
    website: 'https://www.yuantaetfs.com',
    headquarters: '台北市，台灣',
  },
  '0050.TW': {
    name: '元大台灣卓越 50 ETF',
    sector: 'Financial Services',
    industry: 'ETF',
    country: 'TW',
    description: '追蹤台灣 50 指數（台股最大市值前 50 檔）。',
    website: 'https://www.yuantaetfs.com',
    headquarters: '台北市，台灣',
  },
  '0056.TW': {
    name: '元大高股息 ETF',
    sector: 'Financial Services',
    industry: 'ETF',
    country: 'TW',
    description: '追蹤台灣高股息指數。',
    website: 'https://www.yuantaetfs.com',
    headquarters: '台北市，台灣',
  },
  '00878.TW': {
    name: '國泰永續高股息 ETF',
    sector: 'Financial Services',
    industry: 'ETF',
    country: 'TW',
    description: '追蹤 MSCI 台灣 ESG 永續高股息指數。',
    website: 'https://www.cathaysite.com.tw',
    headquarters: '台北市，台灣',
  },

  // === 其他常用台股（即便 API 都掛了，UI 也有公司基本資料可顯示）===
  '1101.TW': {
    name: '台泥',
    sector: 'Basic Materials',
    industry: 'Cement & Concrete',
    country: 'TW',
    description: '台灣水泥股份有限公司是台灣水泥與預拌混凝土龍頭，近年積極轉型布局儲能與新能源。',
    website: 'https://www.taiwancement.com',
    headquarters: '台北市，台灣',
    founded: '1946',
  },
  '2609.TW': {
    name: '陽明海運',
    sector: 'Industrials',
    industry: 'Marine Shipping',
    country: 'TW',
    description: '陽明海運股份有限公司為台灣主要貨櫃航運公司之一，主要經營亞洲與美洲航線。',
    website: 'https://www.yangming.com',
    headquarters: '台北市，台灣',
    founded: '1972',
  },
  '6669.TW': {
    name: '緯穎',
    sector: 'Technology',
    industry: 'Computer Hardware',
    country: 'TW',
    description: '緯穎服務股份有限公司專注雲端資料中心伺服器代工，主要客戶為全球超大規模雲端服務商（hyperscaler）。',
    website: 'https://www.wiwynn.com',
    headquarters: '新北市，台灣',
    founded: '2012',
    beta: 1.20, // AI 伺服器題材
  },

  // === 主動型 ETF（00400A~00499A 系列是台灣近期推出之主動型 ETF）===
  '00405A.TW': {
    name: '主動富邦台灣龍耀',
    sector: 'Financial Services',
    industry: 'Active ETF',
    country: 'TW',
    description: '富邦投信發行之主動型 ETF，由基金經理人主動選股、不追蹤指數，聚焦台股優質標的。於 2026 年 5 月 25 日掛牌上市。',
    website: 'https://www.fubon.com',
    headquarters: '台北市，台灣',
    founded: '2026',
  },
  '00400A.TW': {
    name: '主動國泰動能高息',
    sector: 'Financial Services',
    industry: 'Active ETF',
    country: 'TW',
    description: '國泰投信發行之主動型高息 ETF，由基金經理人主動選股、聚焦高股息標的。',
    website: 'https://www.cathaysite.com.tw',
    headquarters: '台北市，台灣',
    founded: '2026',
  },
  '00401A.TW': {
    name: '主動摩根台灣鑫收',
    sector: 'Financial Services',
    industry: 'Active ETF',
    country: 'TW',
    description: '摩根投信發行之主動型 ETF，聚焦台股收益型標的。',
    website: 'https://www.jpmorgan.com.tw',
    headquarters: '台北市，台灣',
    founded: '2026',
  },
};

/**
 * 從 mock seed 找 stock overview
 * 回傳最小可用的物件（price=0 表示無報價資料）
 */
export function getMockOverview(symbol: string): StockOverview | null {
  const sym = symbol.toUpperCase();
  let seed: Partial<StockOverview> | undefined = MOCK_SEED[sym];

  // 一般 ETF / 新上市股票 fallback：台股 ETF 編號固定為 4-6 位純數字、且結尾 .TW
  // 對尚未建立 seed 但屬於 ETF 系列的 symbol，給予「台股 ETF」通用描述
  if (!seed && /^\d{4,6}\.TW$/.test(sym)) {
    const rawNum = sym.replace(/\.TW$/, '');
    if (rawNum.startsWith('00')) {
      // 0050/0056/00878/00918/00400~00499 等都是 ETF
      seed = {
        name: `台股 ETF ${rawNum}`,
        sector: 'Financial Services',
        industry: 'ETF',
        country: 'TW',
        description: `台灣證券交易所掛牌之 ETF（證券代號 ${rawNum}）。詳細投資策略與成分股請參考發行人公告。`,
        website: 'https://www.twse.com.tw',
        headquarters: '台北市，台灣',
        founded: '',
      };
    } else if (rawNum.startsWith('02')) {
      // 02xxx 是上市 ETF
      seed = {
        name: `台股 ETF ${rawNum}`,
        sector: 'Financial Services',
        industry: 'ETF',
        country: 'TW',
        description: `台灣證券交易所掛牌之 ETF（證券代號 ${rawNum}）。`,
        website: 'https://www.twse.com.tw',
        headquarters: '台北市，台灣',
        founded: '',
      };
    }
  }

  if (!seed) return null;

  return {
    symbol: sym,
    name: seed.name ?? sym,
    exchange: '',
    currency: sym.endsWith('.TW') ? 'TWD' : 'USD',
    price: 0,
    change: 0,
    changePercent: 0,
    previousClose: 0,
    open: 0,
    dayHigh: 0,
    dayLow: 0,
    volume: 0,
    // 保留 seed 內的所有元資料欄位（description / website / country / founded / headquarters）
    sector: seed.sector,
    industry: seed.industry,
    description: seed.description ?? '',
    website: seed.website ?? '',
    country: seed.country ?? '',
    employees: seed.employees,
    founded: seed.founded ?? '',
    headquarters: seed.headquarters ?? '',
    ceo: '',
  };
}

/**
 * 從 mock seed 找搜尋結果
 */
export function getMockSearch(query: string): SearchResult[] {
  const q = query.toLowerCase();
  return Object.entries(MOCK_SEED)
    .filter(([sym, seed]) =>
      sym.toLowerCase().includes(q) || (seed.name?.toLowerCase().includes(q) ?? false)
    )
    .slice(0, 10)
    .map(([sym, seed]) => ({
      symbol: sym,
      name: seed.name ?? sym,
      exchange: sym.endsWith('.TW') ? 'TAI' : '',
      type: 'Equity',
      currency: sym.endsWith('.TW') ? 'TWD' : 'USD',
    }));
}

/**
 * 給定 symbol 是否在 mock seed 內
 */
export function isKnownSymbol(symbol: string): boolean {
  return symbol.toUpperCase() in MOCK_SEED;
}

/**
 * 空 K 線（只在完全沒資料時塞這個）
 */
export function getEmptyChart(): PricePoint[] {
  return [];
}

/**
 * 空財報
 */
export function getEmptyFinancials(symbol: string) {
  return {
    symbol: symbol.toUpperCase(),
    currency: '',
    years: [],
  };
}