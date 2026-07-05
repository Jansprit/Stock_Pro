import { NextRequest, NextResponse } from 'next/server';
import { searchSymbol } from '@/lib/yahoo';
import type { ApiError } from '@/lib/types';

// 強制 dynamic，避免快取舊資料
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (!q) {
    return NextResponse.json<ApiError>({
      error: true,
      message: '請輸入股票代碼或公司名稱',
    }, { status: 400 });
  }

  try {
    const results = await searchSymbol(q);
    if (results.length === 0) {
      return NextResponse.json<ApiError>({
        error: true,
        message: '找不到符合的股票，請確認股票代碼或公司名稱是否正確。',
      }, { status: 404 });
    }
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : '搜尋發生錯誤';
    return NextResponse.json<ApiError>({
      error: true,
      message,
    }, { status: 500 });
  }
}