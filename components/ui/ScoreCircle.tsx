interface ScoreCircleProps {
  score: number;
  label: string;
  size?: number;
  strokeWidth?: number;
}

function scoreColor(score: number): { ring: string; text: string } {
  if (score >= 80) return { ring: 'stroke-bull-500', text: 'text-bull-400' };
  if (score >= 65) return { ring: 'stroke-brand-500', text: 'text-brand-400' };
  if (score >= 50) return { ring: 'stroke-amber-500', text: 'text-amber-400' };
  return { ring: 'stroke-bear-500', text: 'text-bear-400' };
}

export function ScoreCircle({
  score,
  label,
  size = 72,
  strokeWidth = 6,
}: ScoreCircleProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const colors = scoreColor(clamped);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            className="fill-none stroke-slate-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={`fill-none ${colors.ring} transition-all duration-700 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-base font-bold ${colors.text}`}>{clamped}</span>
        </div>
      </div>
      <span className="text-center text-xs text-slate-400">{label}</span>
    </div>
  );
}