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
      const [overviewRes, financialsRes, chartRes, newsRes, competitorsRes] = await Promise.allSettled([
        fetchWithTimeout(`/api/stock/${encodeURIComponent(symbol)}`),
        fetchWithTimeout(`/api/financials/${encodeURIComponent(symbol)}`),
        fetchWithTimeout(`/api/chart/${encodeURIComponent(symbol)}?range=1Y`),
        fetchWithTimeout(`/api/news/${encodeURIComponent(symbol)}`),
        fetchWithTimeout(`/api/competitors/${encodeURIComponent(symbol)}`),
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
          aiLoading: false,
        });
        return;
      }

      const overview = overviewRes.value.overview;

      // 處理 financials：若 API 失敗或超時，嘗試重試一次（30s 內）
      let financials = { symbol, currency: overview.currency, years: [] };
      const isFinFailed = financialsRes.status !== 'fulfilled' || financialsRes.value?.error;
      if (isFinFailed) {
        console.warn('[page] financials 初次失敗，重試一次...');
        try {
          const retry = await fetchWithTimeout(`/api/financials/${encodeURIComponent(symbol)}`);
          if (retry && !retry.error && retry.financials) {
            financials = retry.financials;
          }
        } catch (e) {
          console.warn('[page] financials 重試也失敗:', e instanceof Error ? e.message : e);
        }
      } else {
        financials = financialsRes.value.financials;
      }

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
        aiLoading: true, // 標記 AI 報告開始生成
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
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI 分析失敗';
        setState((s) => ({ ...s, aiError: msg, aiLoading: false }));
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