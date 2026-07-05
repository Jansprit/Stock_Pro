import { NextRequest, NextResponse } from 'next/server';
import { getNews } from '@/lib/yahoo';
import type { ApiError } from '@/lib/types';

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
    const news = await getNews(symbol);
    return NextResponse.json({ news });
  } catch (err) {
    const message = err instanceof Error ? err.message : '新聞資料取得失敗';
    return NextResponse.json<ApiError>({
      error: true,
      message,
    }, { status: 500 });
  }
}