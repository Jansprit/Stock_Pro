/**
 * 鉅亨網（Anue）新聞擷取器
 *
 * 用途：取得 2351.TW 等台股的台灣產業新聞作為備援來源
 *
 * 搜尋 URL: https://www.cnyes.com/search/all?keyword=2351
 *
 * 頁面結構：
 *   - 新聞條目 <a href="https://news.cnyes.com/news/..." class="jsx-xxx">標題</a>
 *   - 摘要 <p class="...">新聞摘要</p>
 *   - 時間 <span>YYYY-MM-DD HH:mm</span>
 *
 * 快取：4 小時
 *
 * 重要：cnyes.com 對大量爬取會 block，需要 user-agent + 隨機 delay
 */

import { cached } from '../cache';
import { fetchWithTimeout } from './_utils';

export interface AnueNewsItem {
  title: string;
  summary?: string;
  url: string;
  publishedAt?: string;   // ISO string if parseable
  source: 'Anue';
}

export async function fetchAnueNews(
  symbol: string,
  limit = 8,
): Promise<AnueNewsItem[]> {
  // 鉅亨網可以接受美股代號（AAPL）或台股（2351.TW）
  const query = symbol.replace(/\.(TW|TWO)$/i, '');
  const url = `https://www.cnyes.com/search/all?keyword=${encodeURIComponent(query)}`;

  return cached(`anue:news:${query}`, 4 * 60 * 60 * 1000, async () => {
    const html = await fetchWithTimeout(url, {
      headers: {
        'Accept-Language': 'zh-TW,zh;q=0.9',
        Referer: 'https://www.cnyes.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    }, { timeout: 15000 });
    return parseAnueSearchHtml(html, limit);
  });
}

function parseAnueSearchHtml(html: string, limit: number): AnueNewsItem[] {
  const out: AnueNewsItem[] = [];
  // 方法：匹配 news.cnyes.com 的新聞條目
  // 例: <a class="jsx-xxx news-title" href="/news/id/abc123">標題</a>
  // 例外：title 屬性
  const re = /<a[^>]+href=["'](https?:\/\/news\.cnyes\.com\/news\/[^"']+)["'][^>]*>(?:<[^>]+>)*([^<]{6,120})(?:\s*<)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const title = stripTags(m[2]).trim();
    if (title.length < 8) continue;
    // 過濾非新聞 URL
    if (!/\/news\//.test(m[1])) continue;
    out.push({
      title,
      url: decodeHtmlEntities(m[1]),
      source: 'Anue',
    });
  }

  // fallback 從 JSON 結構抓
  if (out.length === 0) {
    const jsonRe = /"newsTitle"\s*:\s*"([^"]+)"/g;
    while ((m = jsonRe.exec(html)) !== null && out.length < limit) {
      out.push({
        title: m[1].trim(),
        url: 'https://news.cnyes.com/',
        source: 'Anue',
      });
    }
  }

  return out;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 解碼 HTML entities — 主要給 URL 用，stripTags 會順便 strip 空白 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function isAvailable(): boolean {
  return true;
}
