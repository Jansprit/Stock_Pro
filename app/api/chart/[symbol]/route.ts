import { NextRequest, NextResponse } from 'next/server';
import { getHistoricalPrices } from '@/lib/yahoo';
import type { ApiError, ChartRange } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_RANGES: ChartRange[] = ['1M', '3M', '1Y', '5Y'];

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } },
) {
  const symbol = decodeURIComponent(params.symbol).trim();
  const rangeParam = (request.nextUrl.searchParams.get('range') || '1Y').toUpperCase() as ChartRange;
  const range = VALID_RANGES.includes(rangeParam) ? rangeParam : '1Y';

  if (!symbol) {
    return NextResponse.json<ApiError>({
      error: true,
      message: '股票代碼不可為空',
    }, { status: 400 });
  }

  try {
    const points = await getHistoricalPrices(symbol, range);
    return NextResponse.json({ points, range });
  } catch (err) {
    const message = err instanceof Error ? err.message : '歷史股價取得失敗';
    return NextResponse.json<ApiError>({
      error: true,
      message,
    }, { status: 500 });
  }
}