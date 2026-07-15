'use client';

import { useCallback, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PopularStocks } from '@/components/layout/PopularStocks';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { CardSkeleton } from '@/components/ui/Skeleton';
import type { DashboardData, FinancialYear } from '@/lib/types';

interface FetchState {
  loading: boolean;
  error: string | null;
  data: DashboardData | null;
  aiError: string | null;
  /** AI 報告正在生成中（首輪已載入、第二輪還沒回來） */
  aiLoading: boolean;
}

export default function HomePage() {
  const [state, setState] = useState<FetchState>({
    loading: false,
    error: null,
    data: null,
    aiError: null,
    aiLoading: false,
  });

  const loadStock = useCallback(async (symbol: string, isRefresh = false) => {
    // 防止 mobile Enter 鍵 / 重複點擊造成同 symbol 並行 fetch（會看到頁面渲染兩次）
    if (!isRefresh && state.loading && state.data?.overview.symbol === symbol.toUpperCase()) {
      console.log(`[page] ${symbol} already loading, skip duplicate call`);
      return;
    }
    setState((s) => ({
      loading: true,
      error: null,
      // 重整時也清空 data（避免舊 stocks 殘留的 financials.years 顯示「無資料」）
      data: null,
      aiError: isRefresh ? s.aiError : null,
      aiLoading: isRefresh ? s.aiLoading : false,
    }));

    try {
      // 平行抓取基礎資料（每個 fetch 60s timeout，避免 MOPS cold start 拖太久）
      const fetchWithTimeout = (url: string, ms = 60000) => {
        const c = new AbortController();
        const id = setTimeout(() => c.abort(), ms);
        return fetch(url, { signal: c.signal })
          .then((r) => r.json())
          .finally(() => clearTimeout(id));
      };
      // 每個 fetch 依「期望最慢的時間」給不同 timeout：
      // - overview / chart / news / competitors：通常 < 5s，給 30s
      // - financials：可能跑 MOPS 多年度 + SEC fallback（30-60s），給 60s
      // 整體最壞情況是 60s，但常見狀況下會更快
      const QUICK_TIMEOUT = 30_000;
      const SLOW_TIMEOUT = 60_000;
      // 兩階段並行：先抓 overview（必要）+ 快 API（chart/news/competitors），再分開抓 financials
      // 這樣即使 financials 卡 60s（MOPS cold start / SEC fallback），其他區塊也能先渲染
      const overviewRes = await fetchWithTimeout(`/api/stock/${encodeURIComponent(symbol)}`, QUICK_TIMEOUT).then(
        (r) => ({ status: 'fulfilled' as const, value: r }),
        (e) => ({ status: 'rejected' as const, reason: e }),
      );
      if (overviewRes.status === 'rejected' || overviewRes.value?.error) {
        const errMsg = overviewRes.status === 'rejected'
          ? '個股資料取得失敗'
          : overviewRes.value.message;
        setState({
          loading: false,
          error: errMsg,
          data: null,
          aiError: null,
          aiLoading: false,
        });
        return;
      }
      const overview = overviewRes.value.overview;

      // 並行抓剩餘 3 個（chart/news/competitors 用 QUICK_TIMEOUT，financials 用 SLOW_TIMEOUT）
      // 兩階段 fetch 設計（v0.5.2）：
      //   1) competitors 用 ?phase=industry ≤3s 只回美股 industry-fallback 5 家
      //   2) 渲染後另觸發 ?phase=twse ≤30s 補台股 Goodinfo 5 家
      // 解決 2342.TW 第一次查詢顯示「無競爭對手」（Goodinfo 30s cold start 超過 client 30s timeout）
      const [chartRes, newsRes, competitorsRes] = await Promise.allSettled([
        fetchWithTimeout(`/api/chart/${encodeURIComponent(symbol)}?range=1Y`, QUICK_TIMEOUT),
        fetchWithTimeout(`/api/news/${encodeURIComponent(symbol)}`, QUICK_TIMEOUT),
        // phase=industry 只跑 industry-fallback（≤3s），不觸發 30s 的 Goodinfo
        fetchWithTimeout(`/api/competitors/${encodeURIComponent(symbol)}?phase=industry`, QUICK_TIMEOUT),
      ]);

      const chartPoints = chartRes.status === 'fulfilled' && !chartRes.value?.error
        ? chartRes.value.chart ?? chartRes.value
        : null;
      const news = newsRes.status === 'fulfilled' && !newsRes.value?.error
        ? (newsRes.value.news ?? [])
        : [];
      const competitors = competitorsRes.status === 'fulfilled' && !competitorsRes.value?.error
        ? competitorsRes.value
        : { competitors: [], aiSummary: '' };
      // 預先宣告 financials（先用空年報，AI 報告先用空年報，後面再補）
      let financials: { symbol: string; currency: string; years: FinancialYear[] } = { symbol, currency: overview.currency, years: [] };

      // 先設定基本資料（不含 financials / AI 報告），UI 可以馬上渲染
      setState({
        loading: false,
        error: null,
        aiError: null,
        aiLoading: true, // 標記 AI 報告開始生成
        data: {
          overview,
          financials: { symbol, currency: overview.currency, years: [] }, // 先用空財報
          chart: chartPoints,
          news,
          competitors,
          aiReport: null,
          fetchedAt: new Date().toISOString(),
        },
      });

      // 立即觸發 AI 報告（v0.5.3 修正：不要等 financials 與 twse 補丁，60s timeout 內就觸發）
      // body 用第一階段的 competitors（5 美股）即可 — AI 報告需要的是「同產業對手」概念
      // 而非精確個股對標
      try {
        const aiRes = await fetch('/api/ai-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            overview: {
              symbol: overview.symbol,
              name: overview.name,
              exchange: overview.exchange,
              sector: overview.sector,
              industry: overview.industry,
              // === 從 Goodinfo 拿到的台股補充欄位（v0.3.x 新增）===
              twseIndustry: overview.twseIndustry,
              chairman: overview.chairman,
              president: overview.president,
              mainProducts: overview.mainProducts,
              address: overview.address,
              ipoDate: overview.ipoDate,
              website: overview.website,
              description: overview.description,
              marketCap: overview.marketCap,
              price: overview.price,
              eps: overview.eps,
              pe: overview.trailingPE,
              currency: overview.currency,
            },
            financials: {
              years: financials.years.map((y: FinancialYear) => ({
                year: y.year,
                revenue: y.revenue,
                grossProfit: y.grossProfit,
                netIncome: y.netIncome,
                eps: y.eps,
                freeCashFlow: y.freeCashFlow,
                totalLiabilities: y.totalLiabilities,
                totalEquity: y.totalEquity,
                grossMargin: y.grossMargin,
                netMargin: y.netMargin,
                // roe / debtToEquity 可能是 null（負股東權益），AI prompt 已處理
                roe: y.roe ?? 0,
                debtToEquity: y.debtToEquity ?? 0,
              })),
            },
            news: news.slice(0, 10).map((n: { title: string; summary: string; sentiment: string; category: string }) => ({
              title: n.title,
              summary: n.summary,
              sentiment: n.sentiment,
              category: n.category,
            })),
            competitors: competitors.competitors.map((c: { name: string; marketPosition: string; coreStrength: string; coreRisk: string }) => ({
              name: c.name,
              marketPosition: c.marketPosition,
              coreStrength: c.coreStrength,
              coreRisk: c.coreRisk,
            })),
          }),
        });

        const aiData = await aiRes.json();

        if (aiData.error) {
          setState((s) => ({ ...s, aiError: aiData.message, aiLoading: false }));
        } else if (aiData.report) {
          // 把 AI 報告的 competitiveAnalysis 整合到 competitors.aiSummary
          setState((s) => ({
            ...s,
            aiError: null,
            aiLoading: false,
            data: s.data
              ? {
                  ...s.data,
                  aiReport: aiData.report,
                  competitors: {
                    ...s.data.competitors,
                    aiSummary: aiData.report.competitiveAnalysis,
                  },
                  fetchedAt: new Date().toISOString(),
                }
              : null,
          }));
        } else {
          // 既沒 error 也沒 report — API 回怪 response。明確 setState 結束 loading 狀態，
          // 否則 Dashboard 的 conditional render 會走 null 分支，整個 AI 區塊消失
          console.warn('[ai-report] unexpected response:', aiData);
          setState((s) => ({
            ...s,
            aiError: 'AI 報告回應格式異常，請稍後重試',
            aiLoading: false,
          }));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI 分析失敗';
        setState((s) => ({ ...s, aiError: msg, aiLoading: false }));
      }

      // financials 單獨慢抓（不阻塞主要渲染與 AI 報告）。失敗 / 超時就用空財報，UI 顯示「無財報」
      try {
        const finRes = await fetchWithTimeout(`/api/financials/${encodeURIComponent(symbol)}`, SLOW_TIMEOUT);
        if (finRes && !finRes.error && finRes.financials) {
          financials = finRes.financials as { symbol: string; currency: string; years: FinancialYear[] };
        }
      } catch (e) {
        console.warn('[page] financials 超時或失敗，UI 將顯示「無財報」:', e instanceof Error ? e.message : e);
      }
      // 把 financials 補上（不重新 setState 整個 data，避免 re-render 其他區塊）
      setState((s) => s.data ? { ...s, data: { ...s.data, financials } } : s);

      // 第二階段：抓 Goodinfo 補台股同業（≤30s）。失敗 / 超時不影響主流程，UI 仍可看美股 5 家
      try {
        const twseRes = await fetchWithTimeout(`/api/competitors/${encodeURIComponent(symbol)}?phase=twse`, SLOW_TIMEOUT);
        if (twseRes && !twseRes.error && Array.isArray(twseRes.competitors) && twseRes.competitors.length > 0) {
          setState((s) => s.data ? { ...s, data: { ...s.data, competitors: twseRes } } : s);
        }
      } catch (e) {
        console.warn('[page] twse competitors 超時或失敗，UI 維持美股同業:', e instanceof Error ? e.message : e);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '載入發生錯誤';
      setState({
        loading: false,
        error: msg,
        data: null,
        aiError: null,
        aiLoading: false,
      });
    }
  }, []);

  const handleSelect = useCallback((symbol: string) => {
    loadStock(symbol);
    // 滾動到頂部讓使用者看到 loading
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [loadStock]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header onSelectStock={handleSelect} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {/* Error 顯示（保留舊資料以便參考） */}
        {state.error && !state.data && (
          <ErrorMessage
            title={state.error.includes('找不到') ? '找不到股票' : '載入失敗'}
            message={state.error}
            onRetry={() => state.data && loadStock(state.data.overview.symbol)}
          />
        )}

        {/* Loading 骨架屏（首次載入） */}
        {state.loading && !state.data && (
          <div className="space-y-5">
            <CardSkeleton />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <CardSkeleton />
              <div className="lg:col-span-2">
                <CardSkeleton />
              </div>
            </div>
            <CardSkeleton />
          </div>
        )}

        {/* Dashboard 顯示 */}
        {state.data && (
          <Dashboard
            data={state.data}
            aiError={state.aiError}
            isAiLoading={state.aiLoading}
            onRefresh={() => loadStock(state.data!.overview.symbol, true)}
          />
        )}

        {/* 歡迎頁（無資料時） */}
        {!state.loading && !state.error && !state.data && (
          <PopularStocks onSelect={handleSelect} />
        )}
      </main>

      <Footer />
    </div>
  );
}