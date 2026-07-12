# Security Policy

## 支援版本（Supported Versions）

我們積極維護以下版本的安全更新：

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| < 0.3   | :x:                |

## 報告漏洞（Reporting a Vulnerability）

**請勿在 GitHub Issue 公開漏洞細節。**

請透過以下任一管道私下回報：

1. **Email**：`security@stock-pro.example.com`（如有設定）
2. **GitHub Security Advisory**：[建立 private security advisory](https://github.com/Jansprit/Stock_Pro/security/advisories/new)

請在報告中包含：
- 漏洞描述與影響範圍
- 重現步驟（PoC 程式碼或截圖）
- 發現環境（commit hash、瀏覽器、Node.js 版本）
- 您的聯絡方式

## 我們的回應時間

| 階段 | 時限 |
|------|------|
| 確認收到 | 3 個工作天 |
| 初步評估 | 7 個工作天 |
| 修復 release | 30 天（critical 漏洞優先） |

## 已知的安全設計選擇

以下是**故意的設計選擇**，不是漏洞：

1. **公開資料源**：所有股票資料來自 Yahoo Finance / Goodinfo / TWSE 等公開 API，
   本平台不儲存任何使用者個資、API key 或交易資料。
2. **in-memory cache**：報價 / 新聞快取只存在 process memory，重啟即清空。
   故意不做 persistent cache，避免資料外洩風險。
3. **No database**：本平台無資料庫，沒有 SQL injection 風險表面。
4. **API key 來源**：使用者需自備 FINNHUB / ALPHA_VANTAGE / TWELVE_DATA / FRED 等 key，
   透過 `.env.local` 注入，**絕不 commit 到 git**（`.gitignore` 已排除）。
5. **Playwright headless Chromium**：用於爬 JS-protected 公開網站（Goodinfo.tw），
   限制使用範圍為 `goodinfo.tw` 與 Yahoo Finance 公開頁面。

## 部署安全建議

部署本平台時請務必：

- [ ] **不要 commit `.env.local`** — 已被 `.gitignore` 排除，但請確認 `git ls-files | grep env`
      只回 `.env.local.example`
- [ ] **使用 HTTPS**（Cloudflare / Caddy / nginx 反向代理）
- [ ] **設 rate limit**（避免被當作 open proxy 濫用爬蟲資源）
- [ ] **不要把 Playwright Chromium 暴露到公網**
- [ ] **定期 rotate API key**
- [ ] **設定 GitHub Secret Scanning + Push Protection**
      （Settings → Code security and analysis）

## 漏洞獎金

本專案為研究 / 個人作品，**不提供漏洞獎金**。但會在 release notes 致謝回報者。