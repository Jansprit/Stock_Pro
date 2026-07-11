import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Stock Research Dashboard',
  description: '智慧化股票研究分析平台 - 整合 Yahoo Finance 即時資料與 Claude AI 分析',
  keywords: ['股票分析', 'AI', '研究報告', '財報', '投資'],
};

// 防 FOUC：head 內嵌同步腳本，DOM 渲染前就套用 dark class
// 比放在 body 底部更快，避免使用者看到「閃一下」的預設主題
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('stock-pro:theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      {/* 主題背景：用語意化 utility class，自動跟隨 html.dark 切換 */}
      <body className="min-h-screen bg-app text-fg transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
