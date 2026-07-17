# Stock_Pro Mobile AI 報告 Debug 筆記

> **目的**：電腦重開後可立即續接的完整狀態記錄
> **最後更新**：2026-07-16
> **適用版本**：Stock_Pro v0.5.3 (with pending v0.5.4 修法 A + 修法 B 改動)

---

## 1. 問題描述（user 報告）

user 用 **Android 16 Note 25 Ultra Chrome**（家裡 Wi-Fi 6，前台 + 螢幕長亮）測試 Stock_Pro，AI 報告無法呈現：

- **15+ 次桌面測試**（Chrome/Firefox）✅ 全部成功
- **6+ 次手機測試**（行動版 + 桌面版網站）❌ 全部失敗
- 失敗訊息：「AI 分析暫時無法取得」「AI 分析...」（最新看到 **"Failed to fetch"** 英文訊息）

---

## 2. 已完成的所有診斷與修法

### 修法 A（v0.5.4 part 1）— 120s Client Timeout + AbortError 翻譯

**已套用 source code**：`app/page.tsx` line 125-238

```typescript
const AI_TIMEOUT_MS = 120_000;
const aiAbort = new AbortController();
const aiTimeoutId = setTimeout(() => aiAbort.abort(), AI_TIMEOUT_MS);
aiRes = await fetch('/api/ai-report', { ..., signal: aiAbort.signal });
// catch 區塊：
if (errName === 'AbortError') {
  msg = 'AI 報告生成時間超過 120 秒，請稍候再試一次（背景資料量大時 AI relay 較慢）';
}
```

**Build 狀態**：
- ✅ Source code 已改
- ✅ TypeScript 編譯 0 errors
- ✅ 獨立 AbortController 邏輯測試 4/4 通過
- ✅ Standalone bundle 內含 `12e4` (120000ms) timeout
- ✅ Production server (PID 35708, 啟動於 2026-07-16 09:49) 跑修法 A 版本

### 修法 B（v0.5.4 part 2）— TypeError 翻譯（尚未 build 進去）

**已套用 source code**：`app/page.tsx` line 229-247

```typescript
} else if (/Failed to fetch|NetworkError|fetch failed/i.test(errMsg)) {
  msg = '手機網路連線中斷（連線超過 60 秒可能被系統或路由器切斷）。AI 報告可能已在背景完成，請重新搜尋一次以取得結果。';
}
```

**Build 狀態**：
- ✅ Source code 已改
- ❌ Build 卡死（swc hang），未編譯進 standalone
- ❌ 目前 production server (35708) 仍跑修法 A 版本，**沒有 TypeError 翻譯**

---

## 3. 根因分析鏈（已確立）

### 3.1 Server 端：完全正常
- AI relay 中轉站 56-104s 完成
- 每次都 `[ai-report-debug] ok: <symbol>, <time>ms, isMobileUA=...` 紀錄
- log 路徑：`C:/Users/user/AppData/Local/Temp/prod-with-static.log`

### 3.2 Dev server 有 30s proxy timeout（已被排除）
- Next.js 14.2.18 dev mode 內建 `proxyTimeout: 30000`（`node_modules/next/dist/server/lib/router-utils/proxy-request.js:31`）
- user 之前不小心跑 `npm run dev` → 觸發此問題
- **目前已切回 production server (35708)**，dev 30s proxy 限制不存在

### 3.3 真實問題：手機 Chrome 連線被切斷（TypeError: Failed to fetch）
- 「Failed to fetch」是瀏覽器層級 TypeError，**不是 AbortError**
- 修法 A 的 120s timeout 沒觸發，因為 fetch 在中途被切斷
- **常見原因**：
  1. 家用 Wi-Fi 6 router idle TCP connection 切斷（>60s keep-alive timeout）
  2. Android OS memory pressure 主動中止 fetch
  3. Android Chrome 切到背景（即使螢幕長亮也可能）
  4. ISP NAT 強制 reset

### 3.4 swc build 卡死問題（必須先解決才能 build 修法 B）
- 觸發時機：執行 `node node_modules/next/dist/bin/next build`
- 卡在「Compiling」、「Collecting build traces」階段，CPU=0、memory 不變
- 已知根因：
  1. **Windows Defender 即時掃描 swc child process**（最常見）
  2. **殭屍 node.exe 鎖住 .next/standalone**（Device or resource busy）
  3. **D: drive + C: cache 跨磁碟路徑 bug** [Issue #67541](https://github.com/vercel/next.js/issues/67541)
- npm cache 已改到 D: drive：`D:\Claude Code Work Space\.npm-cache`

---

## 4. 當前環境狀態（重開後第一件事：確認這些）

### 4.1 Process 清單
| PID | 啟動時間 | 角色 |
|---|---|---|
| 35708 | 2026-07-16 09:49 | **Production server** (修法 A 版本) |
| 55480, 20696, 34708 | 2026-07-12 03:01 | 殭屍 npx check-stock.mts（**重開會自動清掉**） |

### 4.2 檔案位置
- **Source code**：`D:\Claude Code Work Space\Stock_Pro\app\page.tsx`（已含修法 A + B）
- **Standalone bundle**：`D:\Claude Code Work Space\Stock_Pro\.next\standalone\`
- **Production server 啟動指令**：
  ```bash
  cd "D:/Claude Code Work Space/Stock_Pro/.next/standalone"
  nohup node server.js > /tmp/prod-with-static.log 2>&1 &
  ```
- **Server log**：`C:\Users\user\AppData\Local\Temp\prod-with-static.log`

### 4.3 外部 URL
- `http://jansprit.myds.me:16886/`（家用 router port forward → 192.168.150.126:3000）

---

## 5. 重開機後的標準作業流程

### Step 1：確認環境
```bash
# 確認 port 3000 沒被佔
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Format-Table"

# 確認 production server 沒在跑
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'CommandLine like \"%standalone%server.js%\"' | Format-Table"
```

### Step 2：嘗試 build 修法 B（先試 5 分鐘 swc）
```bash
cd "D:/Claude Code Work Space/Stock_Pro"
node node_modules/next/dist/bin/next build > /tmp/build-fixB.log 2>&1 &
BUILD_PID=$!
sleep 60
# 看是否完成
ls ".next/standalone/.next/static/chunks/app/" 2>&1 | head -3
# 如果完成，繼續 Step 3
# 如果 swc 卡住，繼續 Step 2a
```

### Step 2a：swc 卡住時的 3 個選項

**選項 A — 重 build 時關閉 Defender 暫時掃描**：
```powershell
# 開啟 PowerShell (Admin)
Add-MpPreference -ExclusionPath "D:\Claude Code Work Space\Stock_Pro"
```
然後重 build

**選項 B — 改 swc cache 到 D: drive**（改 `next.config.js`）：
```js
// 加在 nextConfig 內
experimental: { swcTraceProfiling: false, forceSwcTransforms: false }
```
或直接刪 `.next/cache/swc` 重 build（第一次會比較慢）

**選項 C — 跳過 swc 改用 babel**：
```bash
# 在 package.json devDependencies 已有 babel-loader（如果有）
# 改 next.config.js:
webpack: (config) => { config.unshift({ loader: 'babel-loader' }); return config; }
```

### Step 3：Build 成功後複製 static + 重啟
```bash
cd "D:/Claude Code Work Space/Stock_Pro"
node scripts/copy-standalone-assets.mjs

# 殺掉舊 server
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'CommandLine like \"%standalone%server.js%\"' | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }"

# 啟動新 server
cd .next/standalone
nohup node server.js > /tmp/prod-with-static.log 2>&1 &
```

### Step 4：驗證
```bash
# 確認 static chunks 可 serve
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/_next/static/chunks/app/page-ffeafc4951bf76e3.js"
# 期望：200

# Playwright 外部 URL 驗證
cd "D:/Claude Code Work Space/Stock_Pro"
node verify-external.js
# 期望：Console errors 0 個，截圖 verify-external-1.png 顯示完整 dashboard
```

---

## 6. 重要的 Playwright 驗證腳本

| 腳本 | 用途 |
|---|---|
| `verify-external.js` | 連外部 URL jansprit.myds.me:16886 驗證頁面渲染 |
| `verify-mobile-ai.js` | 模擬 Android Chrome 跑 2330.TW，等 110s 看 AI 報告是否生成 |
| `verify-fixA.js` | 獨立測試 AbortController 邏輯（4 個 timeout 場景） |

腳本路徑：`D:\Claude Code Work Space\Stock_Pro\verify-*.js`

---

## 7. 待辦工作事項

### 短期（重開機後立即）
- [ ] **A. 重 build 修法 B**（TypeError 翻譯）— 讓 user 手機看到「連線中斷」中文訊息而非 "Failed to fetch"
- [ ] **B. 驗證**：請 user 用 mobile Chrome 測 2337.TW，確認訊息變中文
- [ ] **C. 如 swc 仍卡死**：執行 Step 2a 的選項 A（Defender exclusion）

### 中期（找到好的修法之後）
- [ ] **D. 實作修法 C — SSE streaming**：把 `/api/ai-report` 改成 Server-Sent Events，每 10s 推 keep-alive chunk，避免 router idle timeout 切斷。client 改用 `EventSource` 訂閱。
  - 優點：徹底解決 60s+ router idle 問題
  - 缺點：需改 route.ts + page.tsx client，重 build 一次
- [ ] **E. 修法 D — keep-alive heartbeat**：在 fetch 過程中每 15s 對某個 endpoint GET 一次（no-op），讓 router 以為還在 active
  - 優點：不用改 server 架構
  - 缺點：浪費頻寬，仍有風險

### 長期（結構性改善）
- [ ] **F. 升 Next.js 到 15.x** — 解決 Issue #67541 跨磁碟路徑 bug
- [ ] **G. CI/CD pipeline** — 把 build 放到 GitHub Actions（Linux），本地只跑 dev，避免 swc 卡死問題
- [ ] **H. swc cache 改 D: drive** — 在 `next.config.js` 明確指定 swc 暫存路徑

---

## 8. 已知問題清單（knowledge base）

### Next.js 14.2.18 swc hang on Windows D: drive
- 來源：https://github.com/vercel/next.js/issues/67541
- 解法：npm cache 在 D: drive + 不殺殭屍 process
- 仍未完全解決，建議升版

### Next.js dev mode 30s proxyTimeout
- 位置：`node_modules/next/dist/server/lib/router-utils/proxy-request.js:31`
- 觸發：只在 dev mode，production 不影響
- 修法：避免用 `npm run dev` 跑 production 用途

### Android Chrome TypeError: Failed to fetch 觸發條件
- 60-90s 之後的長時間 fetch
- 與 Wi-Fi 6 router idle timeout 相關（家用最常見）
- 即使螢幕長亮也無法避免（OS-level connection management）

### Standalone 必須手動複製 static
- 位置：`scripts/copy-standalone-assets.mjs`
- 觸發：build 後自動（透過 `npm run build` 的 `postbuild` hook）
- 跳過條件：手動跑 `node node_modules/next/dist/bin/next build`（無 hook）
- 解法：build 完手動跑 `node scripts/copy-standalone-assets.mjs`

---

## 9. 重要指令速查

```bash
# 看 server 還活嗎
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/

# 看 server 完整 log
cat "C:/Users/user/AppData/Local/Temp/prod-with-static.log"

# 看最近 30 筆 ai-report 紀錄
grep "ai-report" "C:/Users/user/AppData/Local/Temp/prod-with-static.log" | tail -30

# 殺 server
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'CommandLine like \"%standalone%server.js%\"' | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }"

# 啟動 server
cd "D:/Claude Code Work Space/Stock_Pro/.next/standalone"
nohup node server.js > /tmp/prod-with-static.log 2>&1 &

# 驗證外部 URL
cd "D:/Claude Code Work Space/Stock_Pro"
node verify-external.js

# 驗證 mobile AI（等 110s）
node verify-mobile-ai.js
```

---

## 10. 對 user 講話的腳本

重開後第一則訊息建議：

> "電腦重開後請依序：
> 1. 確認有網路（Ping 192.168.150.126 應該通）
> 2. 把以下指令貼到 bash 跑（背景啟動 production server）：
>    ```
>    cd "D:/Claude Code Work Space/Stock_Pro/.next/standalone"
>    nohup node server.js > /tmp/prod-with-static.log 2>&1 &
>    ```
> 3. 確認 http://localhost:3000/ 有 200
> 4. 然後我會繼續幫您 build 修法 B + 處理 swc 卡死問題"
