import { NextRequest, NextResponse } from 'next/server';
import { getFinancials, getStockOverview } from '@/lib/yahoo';
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
    const [financials, overview] = await Promise.all([
      getFinancials(symbol),
      getStockOverview(symbol).catch(() => null), // 失敗不阻塞，回傳空字串即可
    ]);

    const data = {
      ...financials,
      currency: overview?.currency ?? 'USD',
    };

    return NextResponse.json({ financials: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '財報資料取得失敗';
    return NextResponse.json<ApiError>({
      error: true,
      message,
    }, { status: 500 });
  }
}