'use client';

import { useEffect } from 'react';
import { X, Database, ExternalLink, Info, Github } from 'lucide-react';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 各資料源狀態（純說明用，無互動）
 */
const DATA_SOURCES = [
  {
    name: 'Yahoo Finance',
    type: '即時報價 / K線 / 基本面',
    required: true,
    note: 'v8/finance/chart 已驗證可用，無需 API key',
    docsUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL',
  },
  {
    name: 'Finnhub',
    type: '美股即時報價、新聞、搜尋',
    quota: '免費 60 次/分鐘',
    required: false,
    docsUrl: 'https://finnhub.io/register',
  },
  {
    name: 'Alpha Vantage',
    type: '詳細基本面、年度財報',
    quota: '免費 25 次/天',
    required: false,
    docsUrl: 'https://www.alphavantage.co/support/#api-key',
  },
  {
    name: 'Twelve Data',
    type: 'K 線、技術指標、報價',
    quota: '免費 800 credits/天',
    required: false,
    docsUrl: 'https://twelvedata.com/register',
  },
  {
    name: 'TWSE / TPEx 公開端點',
    type: '台股即時報價、估值月報',
    quota: '免費無限制',
    required: true,
    note: '政府公開資料，無需 key',
    docsUrl: 'https://www.twse.com.tw/',
  },
  {
    name: 'MOPS XBRL',
    type: '台股個股財報',
    quota: '免費無限制',
    required: true,
    note: '政府公開資料',
    docsUrl: 'https://mopsov.twse.com.tw/server-java/t57sb01',
  },
  {
    name: 'Goodinfo.tw',
    type: '台股個股基本資料、同業列表',
    quota: '需用 Playwright 爬 JS challenge',
    required: true,
    note: '無官方 API',
    docsUrl: 'https://goodinfo.tw/tw/',
  },
  {
    name: 'FRED',
    type: '10 年期美債殖利率 (rf)',
    quota: '免費 120 次/分鐘',
    required: false,
    docsUrl: 'https://fred.stlouisfed.org/docs/api/api_key.html',
  },
  {
    name: 'SEC EDGAR',
    type: '美股精確財報（DPS / EBITDA）',
    quota: '免費 10 次/秒（須填 User-Agent）',
    required: true,
    docsUrl: 'https://www.sec.gov/edgar/sec-api-documentation',
  },
  {
    name: 'AI 中轉站（OpenAI 相容）',
    type: 'AI 報告生成',
    quota: '依中轉站配額',
    required: false,
    note: '未設定時，AI 報告區塊顯示「尚未啟用」，其他功能照用',
    docsUrl: null,
  },
];

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  // ESC 關閉
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-lg"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="設定與資料源說明"
    >
      <div
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col rounded-xl border border-edge bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — 固定高度 */}
        <div className="flex items-center justify-between rounded-t-xl border-b border-edge bg-card px-6 py-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-brand-500" />
            <h2 className="text-lg font-bold text-fg">資料源與架構</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            aria-label="關閉"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — flex-1 + min-h-0 + overflow-y-auto 是唯一可滾動區。
    min-h-0 是 flexbox scroll 必加的（否則內容過長會把容器撐開） */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-card p-6">
          <div className="space-y-6">
          {/* 設計說明 */}
          <section className="rounded-lg border border-info/40 bg-info/5 p-4 text-sm">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <div className="space-y-1 text-fg-muted">
                <p>
                  Stock_Pro 是 <strong>純前端 + server proxy</strong> 架構：
                  所有 API Key 只存在 server 環境變數（.env.local），
                  你的瀏覽器永遠不會看到 key。
                </p>
                <p>
                  Demo 用量取決於 server 端預設配額（Finnhub 60/min、Alpha Vantage 25/day 等）。
                  想提高額度：自行 host 一份 instance 並填入自己的 API key。
                </p>
              </div>
            </div>
          </section>

          {/* 資料源表格 */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-fg">使用的資料源（{DATA_SOURCES.length} 個）</h3>
            <div className="overflow-hidden rounded-lg border border-edge">
              <table className="w-full text-sm">
                <thead className="bg-sunken text-xs uppercase text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left">名稱</th>
                    <th className="px-3 py-2 text-left">用途</th>
                    <th className="px-3 py-2 text-left">配額</th>
                    <th className="px-3 py-2 text-center">必要</th>
                    <th className="px-3 py-2 text-right">連結</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {DATA_SOURCES.map((src) => (
                    <tr key={src.name} className="text-fg">
                      <td className="px-3 py-2 font-medium">{src.name}</td>
                      <td className="px-3 py-2 text-fg-muted">{src.type}</td>
                      <td className="px-3 py-2 text-xs text-fg-muted">{src.quota ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {src.required ? (
                          <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs text-brand-500">✓</span>
                        ) : (
                          <span className="text-xs text-fg-subtle">選填</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {src.docsUrl ? (
                          <a
                            href={src.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-xs text-brand-500 hover:underline"
                          >
                            docs
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-fg-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 自架說明 */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-fg">想用自己的 API Key？</h3>
            <div className="rounded-lg border border-edge bg-sunken p-4 text-sm text-fg-muted">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Clone repo：<code className="rounded bg-app px-1.5 py-0.5 font-mono text-xs">git clone https://github.com/Jansprit/Stock_Pro.git</code>
                </li>
                <li>
                  複製環境變數範本：<code className="rounded bg-app px-1.5 py-0.5 font-mono text-xs">cp .env.local.example .env.local</code>
                </li>
                <li>
                  編輯 <code className="rounded bg-app px-1.5 py-0.5 font-mono text-xs">.env.local</code> 填入你自己的 key
                </li>
                <li>
                  Docker 啟動：<code className="rounded bg-app px-1.5 py-0.5 font-mono text-xs">docker build -t stock-pro . && docker run -p 3000:3000 --env-file .env.local stock-pro</code>
                </li>
              </ol>
              <p className="mt-3 text-xs">
                完整部署文件見 <a href="https://github.com/Jansprit/Stock_Pro/blob/main/README.md" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-brand-500 hover:underline">README.md <ExternalLink className="h-3 w-3" /></a>
              </p>
            </div>
          </section>

          {/* 設計理念 */}
          <section className="rounded-lg border border-edge bg-sunken p-4 text-xs text-fg-muted">
            <h3 className="mb-2 text-sm font-semibold text-fg">為什麼不做登入？</h3>
            <ul className="space-y-1 list-disc pl-5">
              <li>登入會引入個資法 / 帳號安全 / CSRF 等複雜度，對 DEMO 性質的公開研究專案是浪費</li>
              <li>API Key 永遠在前端程式碼就會被找到，無論怎麼加密都一樣 — 後端代理是唯一正解</li>
              <li>Stock_Pro 採用業界標準的 server proxy 架構：Key 在 server，前端只看見自己的查詢</li>
              <li>想要自己的 key + 自訂額度？ → 5 分鐘自架一份（上方步驟）</li>
            </ul>
          </section>
          </div>
        </div>

        {/* Footer — 非 sticky，固定在 body 末尾，使用者滾到最底才看到 */}
        <div className="flex items-center justify-between rounded-b-xl border-t border-edge bg-card px-6 py-3">
          <a
            href="https://github.com/Jansprit/Stock_Pro"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            onClick={onClose}
            className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}