# Stock_Pro Session Lessons — Reusable Skills

這些 skill 是從 Stock_Pro v0.5.3 → v0.5.4 debug 過程中提煉出來的可複用經驗。每個 skill 都可以被搬到 `~/.claude/skills/` 成為全域 skill。

## 目錄

### 1. [nextjs-windows-build](./nextjs-windows-build/SKILL.md)
**Next.js 在 Windows 編譯卡死的根本解** — 當 `next build` 在 D: drive 卡在 "Compiling" 階段不動、CPU/RAM 都不變時，手動把 swc binary 從 `node_modules` 複製到 `.next/cache/swc/plugins/`。

適用時機：
- `next build` 卡在 "Compiling" 或 "Collecting build traces" 階段超過 5 分鐘
- `.next/cache/swc/plugins/v7_windows_x86_64_*/` 是空目錄
- 專案在 D: drive 或其他非系統槽

### 2. [api-key-deploy](./api-key-deploy/SKILL.md)
**生產部署 env 注入安全模式** — 如何在 PowerShell 5.1 (Windows 預設) 用 `[System.Diagnostics.Process]` 注入 API key 而不寫到任何檔案、不出現在 command line、不污染 user env。

適用時機：
- 要啟動 production server 注入多個 API key
- 不能用 bash inline（會被擋 / 會留 transcript）
- 不能用 `Start-Process -Environment`（PowerShell 5.1 不支援）
- 不能寫 .cmd 內 set KEY=VAL（會變 file 內容）

### 3. [sse-streaming-anti-idle](./sse-streaming-anti-idle/SKILL.md)
**SSE 取代一次性 fetch 解決 TCP idle 切斷** — Wi-Fi 6 router / mobile NAT 60-90s 沒看到 TCP activity 就會切斷連線，造成 fetch hung 或 "Failed to fetch"。Server-Sent Events 每 10s 推 keep-alive chunk 解決。

適用時機：
- 行動版 Chrome 用戶回報 "Failed to fetch" / fetch hung / TypeError
- Server log 顯示工作完成但 client 從未收到結果
- Desktop 正常但 Android / iOS 失敗
- 增加 timeout 完全沒用

### 4. [playwright-mobile-diag](./playwright-mobile-diag/SKILL.md)
**Playwright 行動版 Chrome 模擬診斷 SOP** — 如何用 headless Chromium 模擬 Android 行動裝置、什麼能模擬什麼不能、怎麼寫 diagnostic script 找出「PC 正常但 Android 失敗」的問題。

適用時機：
- Bug 只在 Android Chrome / iOS Safari 出現，PC 正常
- 需要驗證 mobile-specific 行為（viewport、touch、UA、Client Hints）
- 想驗證 SSE / streaming 在 mobile 環境的行為
- 但要知道 headless mobile 不會觸發 NAT idle timeout（要看 server-side log）

## 起源故事：Stock_Pro v0.5.3 → v0.5.4

Stock_Pro 是 Next.js 14 + 多源股票資料 API + AI 中轉站的儀表板。在 v0.5.3 release 後，user 用 Android 16 Note 25 Ultra Chrome 測試 AI 報告功能，6+ 次全失敗。

DEBUG_NOTES.md 記錄了完整 12 天診斷歷程，最終發現：
- Server 端 AI 報告 56-104s 完成
- 但 response 從未到 client（fetch hung 110s 無 error 也無 response）
- Root cause：Wi-Fi 6 router 60-90s idle TCP timeout 切斷連線

修法分階段：
1. v0.5.4 SSE streaming：每 10s 推 keep-alive chunk → 徹底解
2. 同時修了 1Y 線圖 bug、台股新聞 Goodinfo fallback、competitor 並行觸發
3. 過程中踩了 swc build 卡死、API key 暴露在命令列、PowerShell 5.1 限制等坑

這 4 個 skill 從那段經驗提煉，每個都附上**具體症狀 → 診斷 → 修法 → gotcha** 的完整流程。

## 如何使用

如果你是 Claude Code 在新 session 開 Stock_Pro 專案，這些 skill 已經在 `scripts/skills/`。如果想讓其他專案也能用到，把對應的 `SKILL.md` 複製到 `~/.claude/skills/<name>/SKILL.md`。

Claude Code 的 skills 機制會在相關 trigger 時自動載入 — 例如看到 "next build 卡住" 就會觸發 `nextjs-windows-build`，看到 "API key" 就會觸發 `api-key-deploy`。

## 完整記錄

`../DEBUG_NOTES.md` — Stock_Pro 這個專案特有的 debug 筆記
`../../CLAUDE.md` — Stock_Pro 專案指南
