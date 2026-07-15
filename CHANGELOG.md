# Stock_Pro 變更日誌

所有重要版本都會在此記錄。日期為 ISO 格式（YYYY-MM-DD）。
回溯方式：`git checkout v0.X.Y` 或在 GitHub Releases 頁面下載對應原始碼。

---

## [0.5.0] - 2026-07-15 — 重大里程碑（multiple bug fix + 動態競爭對手 + ETF 效能）

本版本累積多項獨立修正與能力升級，標記為使用者要求的重要回溯點。

### Fixed（修正）

- **Footer 版本號動態化**：Footer.tsx 改為從 `package.json` 動態讀取，避免升版忘改 Footer。
- **Settings Modal 被 Header 截斷**：Modal 改用 `createPortal` 渲染到 `document.body`，避免 sticky Header 的 stacking context 限制（修正前 overlay 只有 68px 高）。
- **HPQ 五年財務數據全錯**：
  - EPS 5 年都是 2.7 → 修正為 2.65 / 2.81 / 3.26 / 2.98 / 5.36 真實值（Alpha Vantage fallback 灌水 → SEC EDGAR 補抓）。
  - ROE / ROA 5 年都是 0% → 修正為真實值（SEC EDGAR `pickAnnualHistory` 用 `(accn, end)` 複合 key 解決 SEC 同份 10-K 一次報告 3 個年度的覆蓋問題）。
- **HPQ ROE N/A 缺說明**：表格下方加 info 區塊，說明 N/A 是負股東權益（庫藏股過度回購），不是 bug。
- **競爭對手數值空白**：competitor metrics 新增 grossMargin / netMargin / EPS / PE fallback chain（Finnhub → SEC EDGAR），讓 4 家 competitors 都有完整財務數據。
- **PFE 等不在預設表的個股無同業**：擴充 `INDUSTRY_PEERS` 從 3 個條目到 10 個（Pharmaceuticals / Biotechnology / Semiconductors / Banks—Major / Oil & Gas / Retail / Automobiles / Entertainment），`SIC_TO_INDUSTRY` 從 14 條擴充到 45 條。
- **00897.TW 等 ETF cold start >60 秒**：
  - TWSE KLine 改並行抓每月（18s → <2s）。
  - ETF 跳過 MOPS XBRL + Yahoo v10 quoteSummary + analyst targets（必回空，跑了浪費 8-10s）。
  - competitors route 對 ETF 直接早返回（ETF 無「同產業個股」概念）。
  - page.tsx 改為兩階段 fetch（chart/news/competitors 完成先 setState，financials 慢抓獨立補）。

### Changed（變更）

- `lib/sources/sec-edgar.ts` `pickAnnualHistory`：
  - 寬鬆化 frame 過濾：duration 接受 `CYxxxx` 或 undefined；instant 接受 `CYxxxxQ[1-4]I`。
  - 用 `(accn, end)` 複合 key 取代單一 `accn`（SEC 10-K 同份 accn 一次報告 3 個會計年度）。
  - Cache key 升 `sec:history:v8:`。
- `lib/sources/alpha-vantage.ts`：移除 `overviewEPS` fallback（會把單一 TTM 灌到所有 5 年），缺值讓 SEC 接手。
- `lib/sources/index.ts`：
  - 新增 SEC fill 補抓邏輯（AV 關鍵欄位為 0 時對美股自動 fetch SEC）。
  - `getCompetitorMetrics` cache key 升 `competitor:v2:`。
- `lib/types.ts`：`FinancialYear.roe / roa / debtToEquity` 改 `number | null`（負股東權益回 null 而非誤導的 0%）。
- `components/dashboard/FinancialTable.tsx`：null-safe 顯示「N/A」，表格下方加 N/A 說明 info block。
- `app/api/ai-report/route.ts`：接受 competitors 兩種結構（Array 或 `{ competitors: [...], aiSummary }`）。
- `app/page.tsx`：
  - 兩階段 fetch（先快 API → setState，financials 慢抓獨立 setState 補）。
  - 不同 API 不同 timeout（quick 30s / slow 60s / fin retry 20s）。

### Test（測試腳本）

- 用 Playwright 驗證 Modal 修正（verify-MODAL-DARK.png）。
- 用 SEC companyfacts API 模擬驗證 pickAnnualHistory 對 HPQ 真實資料的處理。

---

## [0.4.4] - 2026-07-12

（先前版本，未詳列。）