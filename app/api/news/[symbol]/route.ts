import { NextRequest, NextResponse } from 'next/server';
import { getNews } from '@/lib/yahoo';
import { fetchGoodinfoNews, isAvailable as goodinfoAvailable } from '@/lib/sources/goodinfo';
import { fetchAnueNews, isAvailable as anueAvailable } from '@/lib/sources/anue';
import type { ApiError, NewsItem } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: { symbol: string } },
) {
  const symbol = decodeURIComponent(params.symbol).trim();

  if (!symbol) {
    return NextResponse.json<ApiError>({
      error: true,
      message: '股票代碼不可為空',
    }, { status: 400 });
  }

  try {
    // 三源並行抓（Yahoo Finance 國際 + Goodinfo 台股 + Anue 鉅亨台股）
    const [yahooNews, goodinfoNews, anueNews] = await Promise.allSettled([
      getNews(symbol),
      goodinfoAvailable() && /\.(TW|TWO)$/i.test(symbol)
        ? fetchGoodinfoNews(symbol, 6)
        : Promise.resolve([]),
      anueAvailable() && /\.(TW|TWO)$/i.test(symbol)
        ? fetchAnueNews(symbol, 6)
        : Promise.resolve([]),
    ]);

    const news: NewsItem[] = [];

    // Yahoo 是主來源（標 source = Yahoo）
    if (yahooNews.status === 'fulfilled') {
      for (const n of yahooNews.value) {
        news.push({
          title: n.title,
          publisher: n.publisher,
          link: n.link,
          publishDate: n.publishDate,
          summary: n.summary,
          category: n.category,
          sentiment: n.sentiment,
          impact: n.impact ?? '',
        });
      }
    }

    // Goodinfo 內嵌新聞作為補充（標 source = Goodinfo）
    if (goodinfoNews.status === 'fulfilled') {
      for (const n of goodinfoNews.value) {
        news.push({
          title: n.title,
          publisher: n.source,
          link: n.link,
          publishDate: n.publishedAt ?? '',
          summary: '',
          category: 'industry',
          sentiment: 'neutral',
          impact: '',
        });
      }
    }

    // 鉅亨網作為備援（標 source = Anue）
    if (anueNews.status === 'fulfilled') {
      for (const n of anueNews.value) {
        news.push({
          title: n.title,
          publisher: n.source,
          link: n.url,
          publishDate: '',
          summary: n.summary ?? '',
          category: 'industry',
          sentiment: 'neutral',
          impact: '',
        });
      }
    }

    // 去重標題（同樣標題可能 Yahoo/Anue 都抓到）
    const seen = new Set<string>();
    const dedup = news.filter((n) => {
      const k = n.title.toLowerCase().slice(0, 40);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return NextResponse.json({ news: dedup });
  } catch (err) {
    const message = err instanceof Error ? err.message : '新聞資料取得失敗';
    return NextResponse.json<ApiError>({
      error: true,
      message,
    }, { status: 500 });
  }
}
