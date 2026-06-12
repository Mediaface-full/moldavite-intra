// Inline SVG donut chart — bez závislostí, token-driven.
// Segmenty s legendou napravo. Center label = totální nebo top hodnota.

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  data: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}

export default function Donut({
  data,
  size = 180,
  thickness = 28,
  centerLabel,
  centerSub,
}: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <p className="text-xs text-muted-foreground">Žádná data</p>
      </div>
    );
  }

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  let cumulative = 0;
  const segments = data.map((d) => {
    const pct = d.value / total;
    const dashLength = pct * circumference;
    const offset = -cumulative * circumference;
    cumulative += pct;
    return { ...d, pct, dashLength, offset };
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={thickness}
          />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${s.dashLength} ${circumference}`}
              strokeDashoffset={s.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        {(centerLabel || centerSub) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerLabel && (
              <span className="text-2xl font-bold text-foreground font-mono">{centerLabel}</span>
            )}
            {centerSub && (
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{centerSub}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-foreground truncate">{s.label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-muted-foreground text-xs font-mono">
                {Math.round(s.pct * 100)}%
              </span>
              <span className="text-foreground font-medium font-mono w-8 text-right">{s.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
