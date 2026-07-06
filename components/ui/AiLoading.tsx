'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Brain, FileText, Check } from 'lucide-react';
import { Card } from './Card';

interface AiLoadingProps {
  /** 顯示標題，例如「AI 分析報告生成中」 */
  title?: string;
  /** 顯示副標，例如「正在分析 2454.TW 聯發科」 */
  subtitle?: string;
  /** 自訂高度，預設 240px */
  height?: number;
}

const STAGES = [
  { icon: Brain, label: '讀取財報三表與新聞情緒', duration: 7000 },
  { icon: Sparkles, label: '量化模型與同業比較', duration: 8000 },
  { icon: FileText, label: '撰寫 7 維度評分與分析', duration: 8000 },
  { icon: Check, label: '校對與格式化', duration: 5000 },
];

/**
 * AI 報告生成中載入動畫
 *
 * 設計重點：
 * - 藍色液態玻璃風（backdrop-blur + 半透明邊框 + 漸層光暈）
 * - 4 階段訊息輪播（每階段 5-8 秒，符合實際 AI 生成耗時 30-60s）
 * - 進度條平滑遞增（不會突然跳 100%）
 * - 自動循環（避免使用者懷疑「卡住」）
 */
export function AiLoading({
  title = 'AI 分析報告生成中',
  subtitle = '正在擷取最新資料並計算估值模型',
  height = 240,
}: AiLoadingProps) {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);

  // 階段輪播
  useEffect(() => {
    if (stage >= STAGES.length - 1) return;
    const id = setTimeout(() => setStage((s) => s + 1), STAGES[stage].duration);
    return () => clearTimeout(id);
  }, [stage]);

  // 進度條：60 秒填滿（線性增加，到 95% 暫停避免假裝完成）
  useEffect(() => {
    const start = Date.now();
    const TOTAL = 60_000; // 60 秒填滿
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(95, (elapsed / TOTAL) * 95);
      setProgress(pct);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const currentStage = STAGES[stage];
  const CurrentIcon = currentStage.icon;

  return (
    <Card
      padding="lg"
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-400" />
          <span>{title}</span>
          <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-300">
            AI
          </span>
        </div>
      }
      subtitle={subtitle}
    >
      <div className="ai-loading" style={{ minHeight: height }}>
        {/* 液態玻璃背景層 */}
        <div className="ai-loading-bg" />
        <div className="ai-loading-glow" />

        {/* 液態波浪（SVG） */}
        <svg
          className="ai-loading-wave"
          viewBox="0 0 1200 200"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="aiWaveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#1e40af" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="aiWaveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.25" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <path
            className="ai-wave-1"
            d="M0,100 C200,140 400,60 600,100 C800,140 1000,60 1200,100 L1200,200 L0,200 Z"
            fill="url(#aiWaveGrad)"
          />
          <path
            className="ai-wave-2"
            d="M0,120 C200,80 400,160 600,120 C800,80 1000,160 1200,120 L1200,200 L0,200 Z"
            fill="url(#aiWaveGrad2)"
          />
        </svg>

        {/* 中央內容 */}
        <div className="ai-loading-content">
          {/* 階段 icon（pulse 動畫） */}
          <div className="ai-loading-icon-wrap">
            <CurrentIcon className="ai-loading-icon" />
          </div>

          {/* 階段訊息輪播 */}
          <div className="ai-loading-stages">
            {STAGES.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === stage;
              const isDone = i < stage;
              return (
                <div
                  key={i}
                  className={`ai-loading-stage ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs">{s.label}</span>
                  {isDone && <Check className="h-3 w-3 text-bull-400" />}
                </div>
              );
            })}
          </div>

          {/* 進度條 */}
          <div className="ai-loading-bar">
            <div className="ai-loading-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="ai-loading-meta">
            <span>預估剩餘約 {Math.max(0, Math.round((60 * (100 - progress)) / 100))} 秒</span>
            <span className="ai-loading-percent">{progress.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </Card>
  );
}