/**
 * Yahoo Finance 薄封裝（v8/chart）
 *
 * 注意：此檔案已被拆解為 lib/sources/ 下的多源聰明路由架構，
 * 原本的對外函式（searchSymbol / getStockOverview / getHistoricalPrices /
 * getFinancials / getNews）現在從 `@/lib/sources` 統一匯出。
 *
 * 為保持向後相容，這裡 re-export 全部函式。
 *
 * 舊檔案使用的 yahoo-finance2 套件因 IP-level rate-limit 已無法使用，
 * 詳見記憶檔 stock-pro-data-source-strategy.md。
 */

// 重新導出所有對外函式（從聰明路由入口）
export {
  searchSymbol,
  getStockOverview,
  getHistoricalPrices,
  getFinancials,
  getNews,
} from './sources';