import { Github, ShieldAlert } from 'lucide-react';

const REPO_URL = 'https://github.com/Jansprit/Stock_Pro';
const APP_VERSION = '0.3.9';

export function Footer() {
  const releaseUrl = `${REPO_URL}/releases/tag/v${APP_VERSION}`;
  return (
    <footer className="mt-12 border-t border-edge bg-app">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">免責聲明</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              本平台提供之內容僅作為研究與資訊整理參考，不構成任何投資建議。
              投資有風險，請自行判斷並諮詢專業人士。
              所有資料來自第三方（Yahoo Finance）與 AI 模型生成，可能存在延遲或錯誤，使用前請務必自行核實。
            </p>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-fg-subtle">
          © AI Stock Research Dashboard · Powered by Yahoo Finance &amp; Claude AI
          {' · '}
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-fg-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
            title="在 GitHub 查看本版本原始碼"
          >
            <Github className="h-3 w-3" aria-hidden="true" />
            v{APP_VERSION}
          </a>
          {' · '}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 transition-colors hover:text-fg hover:underline"
            title="GitHub repo"
          >
            GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
