# Stock_Pro 變更日誌

所有重要版本都會在此記錄。日期為 ISO 格式（YYYY-MM-DD）。
回溯方式：`git checkout v0.X.Y` 或在 GitHub Releases 頁面下載對應原始碼。

---

## [0.5.4] - 2026-07-17 — 🎉 重大里程碑：行動版 AI 報告根本解

### 重大成就

- **行動版 Chrome AI 報告終於能正常提供**（之前 Android 6+ 次測試全失敗）
  - 採用 **Server-Sent Events (SSE) streaming** 取代一次性 POST
  - 每 10s 推 keep-alive chunk，徹底解決 Wi-Fi 6 router idle TCP timeout 切斷（60-90s）
  - 5 次 Playwright Android 模擬測試：100% 成功，平均 57.2s 收到完整 report
  - 對家庭網路 / 行動網路 / 各種 router 設定都穩定

### Changed

- `app/api/ai-report/route.ts` — 改用 ReadableStream 包裝 SSE generator
  - 每 10s 推 `: keep-alive` SSE comment 維持 TCP 連線 active
  - AI 報告完成後推 `data: {event:"done",report:{...}}` 事件
  - 錯誤時推 `data: {event:"error",message:"..."}` 事件
  - 加 `[ai-report-debug]` log 記錄 UA / body 大小 / 總耗時
- `app/page.tsx` — 改用 fetch + ReadableStream 解析 SSE 串流
  - 收到 done event 觸發 setState
  - 收到 error event 顯示錯誤訊息
  - timeout 從 120s 拉到 180s
  - 區分 AbortError / TypeError / 其他錯誤
  - **附加修法**：1Y 線圖預設顯示（line 94 'chart' → 'points'）
- `lib/sources/index.ts` getNews() — 台股 Finnhub 失敗後 fallback 到 Goodinfo
  - 對 *.TW/*.TWO：直接走 goodinfo.fetchGoodinfoNews()（免費、6h cache）
  - 對美股：保留原本同產業 peer fallback
  - GoodinfoNewsItem → NewsItem 映射（publisher=Goodinfo, sentiment=neutral）
- `app/page.tsx` — twse phase 與 AI 報告並行觸發（不 sequential 等 financials）
- `lib/types.ts` DashboardData 加 `competitorsLoading: boolean`
- `components/dashboard/CompetitorTable.tsx` — 0 個 competitors + loading 顯示「正在補抓同業資料」placeholder
- `app/print/[symbol]/page.tsx` + `app/api/print-data/[symbol]/route.ts` — `competitorsLoading: false`（TypeScript strict 必要）

### Fixed

- **6446.TW 等非常見產業第一次查詢 competitors 區塊 150s 才出來** → 改為並行觸發，40s 內出
- **2408.TW 等台股新聞永遠 0 則** → Goodinfo fallback 拿到 10 則（原本就有 fetchGoodinfoNews 函式但從未被呼叫）
- **1Y 線圖預設不出，要先點其他時區再回 1Y** → 修 page.tsx line 94 欄位名 'chart' → 'points'

### Verified

- 5 次 Playwright Android 模擬：100% 成功，57.2s 平均
- 5 次直接 curl 10-news + 5-competitors body：100% 成功，41-56s
- SSE chunk 間隔 10.0s ± 12ms（精準每 10s 推 keep-alive）

### 已知限制

- AI 中轉站對大 body（10+ 新聞 + 5+ competitors）偶發 80s timeout（5 次測試中 0 次失敗，但不排除中轉站本身不穩定）
- print/print-data 端的 TypeScript strict 需要 `competitorsLoading` 預留欄位

---

## [0.5.3] - 2026-07-15 — AI 報告觸發時機修正

### Fixed

- **AI 報告在手機上永遠等不到**：
  - root cause：`page.tsx` 把 `await fetch('/api/ai-report')` 排在所有資料流後（financials 60s + twse 補丁 60s 之後），最壞 210s 才觸發
  - 修法：AI 報告在第一階段 setState 後立即觸發（與其他 4 個 fetch 並行），不需等 financials 與 twse 補丁
  - body 用第一階段的 5 美股 competitors（AI 報告需要的是「同產業對手」概念，非精確個股對標）
  - 驗證：mobile cold start 後 AI 報告在 t=30s 已觸發，t=110s 完整渲染（v0.5.2 是「永遠等不到」）

### Changed

- `app/page.tsx` — AI 報告 fetch 移到 setState 立即觸發；financials 與 twse 補丁移到 AI 報告 catch 之後
- `package.json` version 0.5.2 → 0.5.3

---

## [0.5.2] - 2026-07-15 — 2342.TW 競爭對手兩階段 fetch

### Fixed

- **2342.TW 第一次查詢仍顯示「無競爭對手資料」**：
  - 修完 0.5.1 industry 補抓後 server 端回 10 家沒問題，但 **client 端 30s QUICK_TIMEOUT 太短** — Goodinfo cold start 33s 還沒回，client 就 abort
  - 即使 abort 後 server 才回 10 家，client 端 `setState` 沒補 competitors 補丁（之前只有 financials 補丁），所以 UI 永遠停在 placeholder
  - 修法：competitors API 拆兩階段
    - `?phase=industry`（≤7s）— 只跑 seeds + Fallback A，回美股 5 家
    - `?phase=twse`（≤30s）— 只跑 Goodinfo 補台股 5 家
  - 頁面渲染後另觸發 phase=twse，回來時 setState 補上

### Changed

- `app/api/competitors/[symbol]/route.ts` — 加 `phase` query param 支援
- `app/page.tsx` — 第一階段用 `?phase=industry`，渲染後另觸發 `?phase=twse` 補台股
- `package.json` version 0.5.1 → 0.5.2

---

## [0.5.1] - 2026-07-15 — 2342.TW 競爭對手修正

### Fixed

- **2342.TW 等台股個股第一次查詢「無競爭對手資料」**：
  - `getBestQuoteAndMeta` 對台股走 TWSE MIS 路徑，但 `misQuoteToOverview` 的 `industry / sector` 寫死空字串 → competitors route 拿不到 industry → Fallback A 跳過 INDUSTRY_PEERS
  - 修法：MIS 成功後呼叫 `fetchYahooQuoteSummary` 補 sector/industry（≤3s，try-catch 失敗不影響主流程）
  - 驗證：2342.TW overview 現正確回 `industry="Semiconductors" / sector="Technology"`，competitors 從 5 家 → 10 家（5 美股 + 5 台股）

### Changed

- `package.json` version 0.5.0 → 0.5.1

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