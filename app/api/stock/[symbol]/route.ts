import { NextRequest, NextResponse } from 'next/server';
import { getStockOverview } from '@/lib/yahoo';
import { fetchGoodinfoCompany, isAvailable as goodinfoAvailable } from '@/lib/sources/goodinfo';
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

    // 補充：台股限定，從 Goodinfo 拿 chairman / 產業別 / IPO 等欄位
    if (goodinfoAvailable() && /\.(TW|TWO)$/i.test(symbol)) {
      try {
        const companyInfo = await fetchGoodinfoCompany(symbol);
        if (companyInfo) {
          if (companyInfo.chairman) overview.chairman = companyInfo.chairman;
          if (companyInfo.twseIndustry) overview.twseIndustry = companyInfo.twseIndustry;
          if (companyInfo.ipoDate) overview.ipoDate = companyInfo.ipoDate;
          if (companyInfo.mainProducts) overview.mainProducts = companyInfo.mainProducts;
          if (companyInfo.address) overview.address = companyInfo.address;
          if (companyInfo.employeeCount !== undefined) overview.employeeCount = companyInfo.employeeCount;
          if (companyInfo.president) overview.president = companyInfo.president;
          if (companyInfo.spokesperson) overview.spokesperson = companyInfo.spokesperson;
        }
      } catch (e) {
        console.warn('[stock] goodinfo fallback skipped:', e instanceof Error ? e.message : e);
      }
    }

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
