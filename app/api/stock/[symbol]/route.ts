import { NextRequest, NextResponse } from 'next/server';
import { getStockOverview } from '@/lib/yahoo';
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
    const overview = await getStockOverview(symbol);
    return NextResponse.json({ overview });
  } catch (err) {
    const message = err instanceof Error ? err.message : '個股資料取得失敗';

    if (message === 'STOCK_NOT_FOUND') {
      return NextResponse.json<ApiError>({
        error: true,
        code: 'STOCK_NOT_FOUND',
        message: '找不到符合的股票，請確認股票代碼或公司名稱是否正確。',
      }, { status: 404 });
    }

    return NextResponse.json<ApiError>({
      error: true,
      message,
    }, { status: 500 });
  }
}