'use client';

import { useCallback, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PopularStocks } from '@/components/layout/PopularStocks';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { CardSkeleton } from '@/components/ui/Skeleton';
import type { DashboardData } from '@/lib/types';

interface FetchState {
  loading: boolean;
  error: string | null;
  data: DashboardData | null;
  aiError: string | null;
}

export default function HomePage() {
  const [state, setState] = useState<FetchState>({
    loading: false,
    error: null,
    data: null,
    aiError: null,
  });

  const loadStock = useCallback(async (symbol: string, isRefresh = false) => {
    setState((s) => ({
      loading: true,
      error: null,
      data: isRefresh ? s.data : null, // 重整時保留舊資料，UX 較佳
      aiError: isRefresh ? s.aiError : null,
    }));

    try {
      // 平行抓取基礎資料
      const [overviewRes, financialsRes, chartRes, newsRes, competitorsRes] = await Promise.allSettled([
        fetch(`/api/stock/${encodeURIComponent(symbol)}`).then((r) => r.json()),
        fetch(`/api/financials/${encodeURIComponent(symbol)}`).then((r) => r.json()),
        fetch(`/api/chart/${encodeURIComponent(symbol)}?range=1Y`).then((r) => r.json()),
        fetch(`/api/news/${encodeURIComponent(symbol)}`).then((r) => r.json()),
        fetch(`/api/competitors/${encodeURIComponent(symbol)}`).then((r) => r.json()),
      ]);

      // 檢查 overview（必要欄位）
      if (overviewRes.status === 'rejected' || overviewRes.value?.error) {
        const errMsg = overviewRes.status === 'rejected'
          ? '個股資料取得失敗'
          : overviewRes.value.message;
        setState({
          loading: false,
          error: errMsg,
          data: null,
          aiError: null,
        });
        return;
      }

      const overview = overviewRes.value.overview;

      const financials = financialsRes.status === 'fulfilled' && !financialsRes.value.error
        ? financialsRes.value.financials
        : { symbol, currency: overview.currency, years: [] };

      const chartPoints = chartRes.status === 'fulfilled' && !chartRes.value.error
        ? chartRes.value.points
        : [];

      const news = newsRes.status === 'fulfilled' && !newsRes.value.error
        ? newsRes.value.news
        : [];

      const competitors = competitorsRes.status === 'fulfilled' && !competitorsRes.value.error
        ? competitorsRes.value
        : { competitors: [], aiSummary: '' };

      // 先設定基本資料（不含 AI 報告），UI 可以馬上渲染
      setState({
        loading: false,
        error: null,
        aiError: null,
        data: {
          overview,
          financials,
          chart: chartPoints,
          news,
          competitors,
          aiReport: null,
          fetchedAt: new Date().toISOString(),
        },
      });

      // 再呼叫 AI 報告（非阻塞，但載入指示）
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
              description: overview.description,
              marketCap: overview.marketCap,
              price: overview.price,
              eps: overview.eps,
              pe: overview.trailingPE,
              currency: overview.currency,
            },
            financials: {
              years: financials.years.map((y: { year: number; revenue: number; grossProfit: number; netIncome: number; eps: number; freeCashFlow: number; totalLiabilities: number; totalEquity: number; grossMargin: number; netMargin: number; roe: number; debtToEquity: number }) => ({
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
                roe: y.roe,
                debtToEquity: y.debtToEquity,
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
          setState((s) => ({ ...s, aiError: aiData.message }));
        } else if (aiData.report) {
          // 把 AI 報告的 competitiveAnalysis 整合到 competitors.aiSummary
          setState((s) => ({
            ...s,
            aiError: null,
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
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI 分析失敗';
        setState((s) => ({ ...s, aiError: msg }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '載入發生錯誤';
      setState({
        loading: false,
        error: msg,
        data: null,
        aiError: null,
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