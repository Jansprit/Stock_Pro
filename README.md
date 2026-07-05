# AI Stock Research Dashboard

> 智慧化股票研究分析平台 — 輸入股票代碼或公司名稱，整合 **多源股票資料（Yahoo Finance / Finnhub / Alpha Vantage / Twelve Data / TWSE 公開端點）聰明路由** 與 **AI 中轉站** 分析，產出結構完整的股票研究報告。

![Tech Stack](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8) ![Recharts](https://img.shields.io/badge/Recharts-2-ff7300) ![Sources](https://img.shields.io/badge/Data-5--source%20routing-22c55e) ![License](https://img.shields.io/badge/License-MIT-yellow) ![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF)

## ✨ 功能特色

- 🔍 **智慧搜尋**：股票代碼（AAPL、2330.TW）或公司名稱（Apple、台積電）；自動補 `.TW` / `.TWO` 後綴
- 📊 **即時總覽**：現價、漲跌、市值、本益比、EPS、52 週區間
- 📈 **股價走勢圖**：1M / 3M / 1Y / 5Y 區間切換
- 💰 **財務圖表**：營收、淨利、EPS、毛利率、現金流 5 種趨勢圖
- 📋 **財務數據表**：獲利 / 成長 / 安全 三區塊切換分析
- 📰 **新聞摘要**：最新 10 則新聞，含情緒判斷（正面/負面/中性）
- 🏆 **競爭對手比較**：自動列出主要對手，含 AI 總結
- 🤖 **AI 研究報告**：
  - 7 維度評分（成長 / 獲利 / 財務安全 / 競爭 / 估值 / 新聞 / 長期潛力）
  - 投資亮點與風險分析（短期/中期/長期）
  - 完整研究報告（摺疊式展開）
- 📱 **響應式設計**：桌機、平板、手機皆適用
- 🌑 **深色主題**：金融科技專業風格

## 🛠 Tech Stack

| 用途 | 技術 |
|------|------|
| 框架 | Next.js 14 (App Router) + TypeScript |
| 樣式 | Tailwind CSS 3 |
| 圖表 | Recharts |
| 股票資料 | **多源聰明路由**（Yahoo v8/chart + Finnhub + Alpha Vantage + Twelve Data + TWSE/TPEx 公開端點） |
| AI | 自訂中轉站 `OpenAI 相容 /chat/completions`（模型 `MiniMax-M2.7`） |
| Icons | lucide-react |
| 日期 | date-fns |

## 🧭 資料源聰明路由（Multi-source Smart Routing）

為什麼不只用一家 API？Yahoo Finance 走非官方爬蟲，2026-07-04 實測本機 IP 觸發 429 全端點失效；其他各家各有免費額度上限（Alpha Vantage 25 次/天、Twelve Data 800 credits/天、Finnhub 60 次/分鐘）。台股方面則優先走 TWSE / TPEx 公開端點，無需 API key 且無明確 rate limit。本專案採用**依用途分流 + 多源備援 + 本地快取**：

| 用途 | 主源 | 備援 1 | 備援 2 | 終端 fallback |
|------|------|--------|--------|--------------|
| 即時報價 + K 線（美股/全球） | Yahoo v8/chart | Finnhub | Twelve Data | mock seed |
| 即時報價 + K 線（台股 `*.TW` / `*.TWO`） | TWSE MIS + STOCK_DAY / TPEx | Yahoo v8/chart | Twelve Data | mock seed |
| 估值 / 基本面（美股） | Alpha Vantage OVERVIEW | Finnhub profile + metric | — | mock seed |
| 詳細財報（三表） | Alpha Vantage | — | — | 空陣列 |
| 公司新聞 | Finnhub | — | — | 空陣列 |
| 股票搜尋 | Finnhub | Twelve Data | mock seed | — |

### 速率與節流策略
- **退避重試**：429 / 5xx / 網路錯誤自動指數退避（1s → 2s → 4s → 8s），最多 3 次
- **節流間隔**：Alpha Vantage 強制每 13 秒一次（避免觸發 5 次/分鐘上限）
- **記憶體快取**：報價/財報 1 小時、新聞 15 分鐘、競爭對手 30 分鐘
- **軟錯誤偵測**：Alpha Vantage 額度耗盡會回 `Note/Information` JSON 欄位，特別處理

## 🚀 快速開始

### 1. 安裝相依套件

```bash
cd "D:/Claude Code Work Space/Stock_Pro"
npm install
```

### 2. 設定環境變數

```bash
cp .env.local.example .env.local
```

編輯 `.env.local`，至少填入：

```env
# ===== AI 報告（中轉站 OpenAI 相容 /v1/chat/completions）=====
# 變數名刻意避開 ANTHROPIC_*，因為 Claude Code shell 環境會注入
# ANTHROPIC_BASE_URL=http://127.0.0.1:15721 把它導到本地 proxy
AI_RELAY_BASE_URL=https://your-ai-relay.example.com
AI_RELAY_MODEL=MiniMax-M2.7
AI_RELAY_API_KEY=your-relay-token

# ===== 股票資料源（聰明路由）=====
# Yahoo Finance 自動走 v8/finance/chart（已驗證可用），無需 key

# Finnhub — 美股即時報價、新聞、搜尋、估值指標（60 次/分鐘）
FINNHUB_API_KEY=your-finnhub-key

# Alpha Vantage — 詳細基本面、年度財報（25 次/天，嚴格節流）
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key

# Twelve Data — K 線、技術指標、報價（800 credits/天）
TWELVE_DATA_API_KEY=your-twelve-data-key
```

> 💡 **AI 模型走自訂中轉站（OpenAI 相容 `/chat/completions`）**：
> - 預設 `AI_RELAY_BASE_URL=https://your-ai-relay.example.com`
> - 預設 `AI_RELAY_MODEL=MiniMax-M2.7`
> - 沒有 API key 也可以運行股票圖表；AI 報告區塊會顯示「AI 分析功能尚未啟用」。

> 🔑 註冊取得免費 key：
> - Finnhub：https://finnhub.io/register
> - Alpha Vantage：https://www.alphavantage.co/support/#api-key
> - Twelve Data：https://twelvedata.com/register

### 3. 啟動開發伺服器

**方式 A：雙擊啟動（推薦）**
```
雙擊 start.bat
```
會在背景啟動 dev server、輸出日誌到 `logs\dev.log`、自動偵測 port 並開瀏覽器。
關閉時雙擊 `stop.bat`。如需桌面捷徑，雙擊 `create-desktop-shortcut.bat`。

**方式 B：命令列**
```bash
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)

### 4. 建構生產版本

```bash
npm run build
npm run start
```

## 📁 專案結構

```
stock-pro/
├── app/
│   ├── api/           # API Routes（後端代理）
│   │   ├── stock/[symbol]/        # 個股總覽
│   │   ├── financials/[symbol]/   # 3-5 年財報
│   │   ├── chart/[symbol]/        # 歷史股價
│   │   ├── news/[symbol]/         # 最新新聞
│   │   ├── competitors/[symbol]/  # 競爭對手
│   │   ├── search/                # 股票搜尋
│   │   └── ai-report/             # Claude AI 報告（POST）
│   ├── layout.tsx     # 根 layout
│   ├── page.tsx       # 主頁
│   └── globals.css    # 全域樣式
├── components/
│   ├── layout/        # Header / Footer / PopularStocks
│   ├── search/        # SearchBar
│   ├── dashboard/     # 所有 Dashboard 子元件
│   └── ui/            # 基礎 UI 元件
├── lib/
│   ├── sources/       # 多源資料適配器
│   │   ├── index.ts           # 聰明路由統一入口
│   │   ├── yahoo.ts           # Yahoo v8/chart
│   │   ├── finnhub.ts         # Finnhub（報價/profile/metric/search/news）
│   │   ├── alpha-vantage.ts   # Alpha Vantage（含 13s 節流）
│   │   ├── twelve-data.ts     # Twelve Data（台股 symbol 自動加 .TW）
│   │   ├── twse.ts            # TWSE / TPEx 公開端點（台股原生，無需 key）
│   │   └── mock.ts            # 本地種子（台股 + 美股 + ETF）
│   ├── yahoo.ts        # 向後相容 re-export（從 sources/ 統一出口）
│   ├── claude.ts       # OpenAI 相容中轉站呼叫 + JSON 容錯解析
│   ├── prompts.ts      # AI Prompt 範本
│   ├── competitors.ts  # 競爭對手對照表
│   ├── types.ts        # 共用型別
│   ├── format.ts       # 格式化工具
│   └── cache.ts        # 記憶體快取
├── scripts/            # 一次性 probe / 維護腳本
├── start.bat / stop.bat
└── README.md
```

## 🔌 API 端點

| 端點 | 用途 | 主源 |
|------|------|------|
| `GET /api/search?q=AAPL` | 股票搜尋 | Finnhub |
| `GET /api/stock/[symbol]` | 個股總覽 | Yahoo v8/chart |
| `GET /api/financials/[symbol]` | 3-5 年財報 | Alpha Vantage |
| `GET /api/chart/[symbol]?range=1Y` | 歷史股價 | Yahoo v8/chart |
| `GET /api/news/[symbol]` | 最新新聞 | Finnhub |
| `GET /api/competitors/[symbol]` | 競爭對手 | Yahoo + Finnhub |
| `POST /api/ai-report` | Claude AI 報告 | 中轉站 |

> 路徑 `[symbol]` 接受帶或不帶 `.TW` 後綴；純數字（如 `0050`）會自動嘗試 `.TW` / `.TWO`。

## ⚠️ 重要限制

### 資料源
- **TWSE / TPEx 公開端點**（台股原生權威）：即時報價（5 秒延遲）、月歷史 K 線、本益比/殖利率等估值欄位；無需 API key，無明確 rate limit，建議節流 5 秒 3 req
- **Yahoo Finance**：非官方端點，依賴 IP 寬頻；高頻併發或區網 NAT 共享可能觸發 429（已內建備援）
- **Alpha Vantage**：免費版 25 次/天嚴格上限，已內建 13 秒節流與軟錯誤偵測
- **Finnhub**：免費 60 次/分鐘，適合美股即時監控；台股 profile 需付費（已用 mock seed 補）
- **Twelve Data**：以 credits 計，免費 800/天；台股 symbol 自動加 `.TW`
- **所有資料源皆內建快取**，避免重複打 API

### Claude / AI 中轉站
- 需中轉站 API key（`AI_RELAY_API_KEY`）
- 預設模型 `MiniMax-M2.7`，透過 OpenAI 相容 `/chat/completions` 介面呼叫
- 可在 `.env.local` 改 `AI_RELAY_BASE_URL` 或 `AI_RELAY_MODEL` 切換端點與模型
- 環境變數刻意用 `AI_RELAY_*` 而非 `ANTHROPIC_*`，避免被 Claude Code shell 注入覆蓋

### 免責聲明
> 本平台提供之內容僅作為研究與資訊整理參考，不構成任何投資建議。
> 投資有風險，請自行判斷並諮詢專業人士。

## 🎯 預先支援的股票（已內建 mock seed）

- 美股科技：`AAPL`、`MSFT`、`GOOGL`、`NVDA`、`AMD`、`AMZN`、`META`
- 電動車：`TSLA`
- 半導體：`2330.TW`（台積電）、`2454.TW`（聯發科）、`2308.TW`（台達電）、`2317.TW`（鴻海）
- 航運：`2603.TW`（長榮海運）
- 金融：`JPM`
- 醫療：`JNJ`、`LLY`
- 台股 ETF：`0050.TW`、`0056.TW`、`00878.TW`、`00918.TW`

其他股票也可搜尋，外部 API 拿不到基本資料時會用通用方式呈現。

## 📜 License

MIT — 詳見 [LICENSE](./LICENSE)

---

Built with ❤️ using Next.js + **多源聰明路由** + 自訂 AI 中轉站