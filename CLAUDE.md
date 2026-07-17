# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案本質

**Stock_Pro** — AI 驅動的股票研究儀表板（Next.js 14 App Router + TypeScript strict）。
特色：**多源聰明路由**（Yahoo v8/chart + Finnhub + Alpha Vantage + Twelve Data + TWSE/TPEx 公開端點 + SEC EDGAR + MOPS XBRL）+ **自訂 AI 中轉站**（OpenAI 相容 `/chat/completions`，預設模型 `MiniMax-M2.7`）。

目標使用者情境：研究個股（AAPL、2330.TW、00878.TW 等），一次拿到行情、5 年財報、新聞、競爭對手、AI 七維度評分報告。

## 開發指令

```bash
# 安裝（含 Playwright 必要套件）
npm install
npx playwright install chromium  # Goodinfo scraper 需要

# 開發（推薦雙擊 start.bat；命令列等同 npm run dev）
npm run dev          # 預設 port 3000；自動偵測 port 3000-3010

# Build / 啟動
npm run build        # tsc strict check + Next.js build + postbuild hook
npm start            # 跑 .next/standalone/server.js（先自動 build 若缺失）
npm run start:dev    # 等同 next start（用 .next 開發產物）

# Lint（CI 跑 lint + tsc，lint warning 不擋 PR）
npm run lint

# 一次性驗證（手寫 Playwright 腳本，非正式測試框架）
node verify-modal.js          # 範例：驗證 Modal 行為
node verify-external.js       # 驗證外部資料源整合
```

**沒有 Jest / Vitest / Playwright Test**。每個 `verify-*.js` / `diag-*.js` / `probe-*.mjs` 都是獨立一次性腳本；放在根目錄的歷史診斷檔不需清理，但新增請放 `scripts/`。

## 環境變數慣例（重要）

| 變數 | 用途 | 預設 |
|---|---|---|
| `AI_RELAY_BASE_URL` | AI 中轉站 OpenAI 相容端點 | `https://your-ai-relay.example.com` |
| `AI_RELAY_MODEL` | 模型 ID | `MiniMax-M2.7` |
| `AI_RELAY_API_KEY` | 中轉站 token（沒設 → AI 報告區塊顯示「AI 分析功能尚未啟用」） | — |
| `FINNHUB_API_KEY` | 美股報價 / 新聞 / 搜尋 / 估值 | — |
| `ALPHA_VANTAGE_API_KEY` | 美股詳細基本面、年度財報（25 次/天，**已內建 13s 節流**） | — |
| `TWELVE_DATA_API_KEY` | K 線、技術指標（800 credits/天） | — |

> **變數名刻意用 `AI_RELAY_*` 而非 `ANTHROPIC_*`**：Claude Code shell 環境會注入 `ANTHROPIC_BASE_URL=http://127.0.0.1:15721`，會優先於 `.env.local` 把我們的中轉站導到本地 proxy。修改時**不要**改回 `ANTHROPIC_*`。

## 高層次架構

### 路由 → API → 資料源 三層

```
app/page.tsx (client)
  ├─ /api/stock/[symbol]        → 個股總覽（Yahoo v8/chart 主，台股走 TWSE MIS）
  ├─ /api/chart/[symbol]        → 歷史股價（Yahoo v8/chart）
  ├─ /api/news/[symbol]         → 新聞（Finnhub）
  ├─ /api/competitors/[symbol]  → 競爭對手（兩階段：?phase=industry 速回，?phase=twse 慢補）
  ├─ /api/financials/[symbol]   → 5 年財報（Alpha Vantage 主，SEC EDGAR fallback）
  ├─ /api/search                → 股票搜尋（Finnhub 主，Twelve Data 備援）
  └─ /api/ai-report (POST)      → AI 七維度報告（中轉站 /v1/chat/completions）
```

### 聰明路由統一入口

**`lib/sources/index.ts`** 是唯一對外介面。所有 API route 都從這裡 import，**不直接**呼叫 `lib/sources/yahoo.ts` 等單一來源。

- 退避重試 `withRetry`：429 / 5xx / 網路錯誤自動指數退避（1s → 2s → 4s → 8s），最多 3 次
- 記憶體快取 `lib/cache.ts`：報價/財報 1 小時、新聞 15 分鐘、competitors 30 分鐘
- 台股（`*.TW` / `*.TWO`）**自動優先走 TWSE/TPEx**，不浪費 Alpha Vantage 25 次/天額度
- 美股關鍵欄位缺值時自動 fetch SEC EDGAR 補抓（`sec-edgar.ts` `pickAnnualHistory` 用 `(accn, end)` 複合 key 處理 SEC 10-K 同份一次報 3 個年度）

### AI 報告兩階段 fetch（v0.5.3 設計）

`app/page.tsx` 不再等 financials 與 twse competitors 都回來才觸 AI：

1. **第一階段**（≤30s）：overview + chart + news + competitors `?phase=industry` → `setState` 立即渲染 + **同步觸發** AI 報告（120s timeout）
2. **第二階段**（≤60s）：financials 補上 → 補 setState
3. **第三階段**（≤30s）：competitors `?phase=twse` 補台股 Goodinfo 5 家

AI 報告 fetch 必須有 **explicit AbortController 120s timeout**（mobile Chrome ~60-90s 後會 zombie），錯誤分流：
- `AbortError` → "AI 報告生成時間超過 120 秒"
- `TypeError: Failed to fetch` → "手機網路連線中斷（連線超過 60 秒可能被系統或路由器切斷）"

### 競爭對手策略（v0.5.2）

`lib/competitors.ts` `INDUSTRY_PEERS` + `SIC_TO_INDUSTRY` 對照表覆蓋 10 個產業、45 條 SIC；動態 fallback chain：Finnhub metric → SEC EDGAR → mock seed。ETF 跳過（無同業概念）。

## Build / Deploy 流水線

`npm run build` 觸發鏈：`next build` → `postbuild: node scripts/copy-standalone-assets.mjs`（把 `.next/static` 與 `public/` 複製進 `.next/standalone`，否則 standalone server 雖啟動但頁面 JS 不 hydrate）→ 產出 `.next/standalone/server.js`。

`npm start` 走 `prestart: node scripts/ensure-standalone.mjs`：缺 standalone 自動 build（避免 user 直接 clone → start 噴 MODULE_NOT_FOUND）。

Dockerfile（`node:20-bookworm-slim`）：
- 多階段（deps / builder / runner），含 Playwright Chromium 與 system libs
- `output: 'standalone'`（image ~200MB 而非 ~1GB）
- Non-root `nextjs` user (uid 1001) + `dumb-init` 處理 signal
- HEALTHCHECK 內建 curl `/api/search?q=AAPL`

## CI/CD

`.github/workflows/`：

- **`ci.yml`**（push main / PR）：lint → tsc strict → build → smoke test（curl `/` + `/api/stock/AAPL`）→ CodeQL security scan。最小權限 + concurrency cancel。
- **`release.yml`**（push `v*.*.*` tag）：build → 打包 `.next/standalone` zip → 上傳 GitHub Release（用 `softprops/action-gh-release@v2`）。

**不支援 Vercel**（Playwright 需持久 Chromium binary，serverless 無法持久化）。自架 VPS + Docker Compose 是推薦路徑。

## 慣例 / 注意事項

- **TypeScript strict** 全開（`tsconfig.json` `strict: true`）；build 會順帶跑型別檢查
- **路徑別名** `@/*` 對應 `./`（tsconfig + Next.js 自動支援）
- **Server Components / Client Components**：`app/page.tsx` 與 `components/dashboard/Dashboard.tsx` 等需要 hooks / state 的元件以 `'use client'` 開頭；其餘保持 server component
- **快取 key 升版慣例**：改 `lib/sources/*.ts` 的抓取邏輯時，把 cache key prefix 也升級（`sec:history:v8:`、`competitor:v2:` …），避免用戶卡在舊資料
- **`next.config.js`** 把 `env: {}` 設空 — 不暴露任何 build-time env 到 client bundle（防 API key 外洩），需 client 用的變數要 `NEXT_PUBLIC_*` 開頭
- **Playwright 在 server runtime 用**：`serverComponentsExternalPackages: ['playwright-core', 'playwright']`（不被 webpack 打包）
- **Footer 版本號**從 `package.json` 動態讀取，升版後不用手改 Footer
- **歷史診斷檔**（`diag-*.js` / `probe-*.mjs` / `verify-*.js`）散落在根目錄 — 是除錯過程的考古紀錄，**不要主動刪除**

## 預期延伸點

新增資料源：在 `lib/sources/` 加新檔（`fred.ts` / `anue.ts` / `goodinfo.ts` 已示範此模式）→ 在 `index.ts` 統一出口加 wrapper → 在對應 API route 呼叫。

新增 API route：在 `app/api/[name]/[symbol]/route.ts`（動態參數）或 `app/api/[name]/route.ts`（靜態），handler 從 `lib/sources/index.ts` 拿資料。

新增 dashboard 區塊：`components/dashboard/` 加新元件，在 `Dashboard.tsx` 組裝。資料從 `lib/types.ts` 的 `DashboardData` 擴充。

## 不在這個 repo

- Stock_Pro 沒有資料庫（純 stateless API + 記憶體快取）
- 沒有 auth（單機 demo 用）
- 沒有 SSR 持久化（next start 即可重啟清空所有快取）