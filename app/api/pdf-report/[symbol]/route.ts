import { NextRequest, NextResponse } from 'next/server';
import { ALL_SECTION_KEYS } from '@/lib/print-sections';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120; // 2 分鐘上限（Playwright 渲染）

const SECTION_SET = new Set<string>(ALL_SECTION_KEYS);

interface RouteParams {
  params: { symbol: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const symbol = decodeURIComponent(params.symbol).trim();
  if (!symbol) {
    return NextResponse.json({ error: true, message: '股票代碼不可為空' }, { status: 400 });
  }

  // 解析 sections 參數
  const sectionsParam = request.nextUrl.searchParams.get('sections') ?? '';
  const sections = sectionsParam.split(',').map((s) => s.trim()).filter((s) => SECTION_SET.has(s));
  if (sections.length === 0) {
    return NextResponse.json({ error: true, message: '請至少選擇一個區塊' }, { status: 400 });
  }

  // 決定 base URL（給 Playwright 訪問內部頁面）
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || process.env.VERCEL_URL
    || `http://localhost:${process.env.PORT ?? 3000}`;
  const printUrl = `${baseUrl.replace(/\/$/, '')}/print/${encodeURIComponent(symbol)}?sections=${sections.join(',')}`;

  let browser: BrowserType | null = null;
  try {
    // 動態 import 避免 webpack 嘗試解析 playwright 依賴（chromium-bidi）
    const { chromium } = await import(/* webpackIgnore: true */ 'playwright-core');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // A4 直式 viewport
    await page.setViewportSize({ width: 794, height: 1123 }); // A4 @ 96dpi

    await page.goto(printUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // 等所有 client 元件 hydration（chart 渲染 + AI 報告生成）
    // AI 報告生成可能花 30-60s，所以不依賴 networkidle
    await page.waitForTimeout(8000);

    // === Layer 3：JS 雙保險（測量位置 + 主動插入分頁）===
    await runPageBreakGuard(page);

    // === 產生 PDF ===
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${symbol}_research_report_${new Date().toISOString().slice(0, 10)}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[pdf-report] failed:', err);
    return NextResponse.json(
      { error: true, message: err instanceof Error ? err.message : 'PDF 生成失敗' },
      { status: 500 },
    );
  } finally {
    await browser?.close().catch(() => {});
  }
}

/**
 * Layer 3 雙保險 JS：
 *  - 測量每個 [data-pdf-block] 的位置
 *  - 若元素頂部到目前頁底空間 < 元素高度，主動插入 break-before: page
 *  - 處理孤兒標題（標題在頁底最後 50px）
 */
type Page = import(/* webpackIgnore: true */ 'playwright-core').Page;
type BrowserType = import(/* webpackIgnore: true */ 'playwright-core').Browser;

async function runPageBreakGuard(page: Page) {
  await page.evaluate(() => {
    const A4_HEIGHT_PX = 1123; // A4 @ 96dpi
    const MARGIN_PX = 96; // 12mm = ~45px * 2 (上下) ≈ 96
    const USABLE_HEIGHT = A4_HEIGHT_PX - MARGIN_PX * 2;
    const TOP_OFFSET = MARGIN_PX;

    // === 規則 1：處理 data-pdf-block 跨頁 ===
    const blocks = Array.from(document.querySelectorAll('[data-pdf-block]')) as HTMLElement[];
    let forcedBreaks = 0;

    for (const el of blocks) {
      // 跳過 .pdf-cover / .pdf-footer / .pdf-page（這些由 CSS 處理）
      if (el.classList.contains('pdf-cover') || el.classList.contains('pdf-footer')) continue;

      const rect = el.getBoundingClientRect();
      // 元素頂部到目前頁底的距離（rect.top 已經是相對於 viewport）
      const topInPage = rect.top - TOP_OFFSET;
      const distToPageBottom = USABLE_HEIGHT - topInPage;

      // 若元素頂部到頁底空間 < 元素高度的 1/3，主動分頁（避免孤兒元素）
      if (distToPageBottom < rect.height / 3 && distToPageBottom > 0) {
        el.style.setProperty('break-before', 'page');
        el.style.setProperty('page-break-before', 'always');
        forcedBreaks++;
      }
    }

    // === 規則 2：孤兒標題防護 ===
    const headings = Array.from(document.querySelectorAll('h2, h3, h4, .pdf-section-header')) as HTMLElement[];
    for (const h of headings) {
      const hRect = h.getBoundingClientRect();
      const topInPage = hRect.top - TOP_OFFSET;
      const distToPageBottom = USABLE_HEIGHT - topInPage;

      // 標題在頁底最後 80px 內，且下一個元素會被推到下一頁
      if (distToPageBottom < 80) {
        const next = h.nextElementSibling as HTMLElement | null;
        if (next) {
          // 強制整組換頁
          h.style.setProperty('break-after', 'page');
          h.style.setProperty('page-break-after', 'always');
        }
      }
    }

    // === 規則 3：表格列完整性防護 ===
    // （CSS 已處理 thead 重複與 tr 不分頁，這裡只保險）
    const tables = Array.from(document.querySelectorAll('table')) as HTMLElement[];
    for (const table of tables) {
      table.style.setProperty('break-inside', 'auto');
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach((row) => {
        (row as HTMLElement).style.setProperty('break-inside', 'avoid');
      });
    }

    console.log(`[pdf-guard] forced ${forcedBreaks} page breaks`);
  });
}