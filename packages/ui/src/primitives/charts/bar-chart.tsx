"use client";

import { useMemo } from "react";

export type BarChartBar = { label: string; value: number };

type BarChartProps = {
  bars: BarChartBar[];
  height?: number;
  ariaLabel?: string;
  valueFormatter?: (value: number) => string;
};

const VIEW_WIDTH = 600;
const MARGIN_TOP = 12;
const MARGIN_BOTTOM = 32;
const MARGIN_LEFT = 36;
const MARGIN_RIGHT = 12;

export function BarChart({
  bars,
  height = 220,
  ariaLabel,
  valueFormatter = (v) => String(v),
}: BarChartProps) {
  const { renderedBars, maxV, hasData } = useMemo(() => {
    if (bars.length === 0) return { renderedBars: [], maxV: 0, hasData: false };
    const innerW = VIEW_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    const innerH = height - MARGIN_TOP - MARGIN_BOTTOM;
    const maxV = Math.max(1, ...bars.map((b) => b.value));
    const gap = 6;
    const bw = (innerW - gap * (bars.length - 1)) / bars.length;

    return {
      renderedBars: bars.map((b, i) => {
        const barH = (b.value / maxV) * innerH;
        const x = MARGIN_LEFT + i * (bw + gap);
        return {
          label: b.label,
          value: b.value,
          x,
          y: MARGIN_TOP + innerH - barH,
          width: bw,
          height: barH,
        };
      }),
      maxV,
      hasData: true,
    };
  }, [bars, height]);

  if (!hasData) {
    return (
      <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-text-muted">
        No data
      </div>
    );
  }

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      className="h-full w-full text-accent"
    >
      <text
        x={MARGIN_LEFT - 6}
        y={MARGIN_TOP + 10}
        fontSize={10}
        textAnchor="end"
        fill="currentColor"
        opacity={0.6}
      >
        {valueFormatter(maxV)}
      </text>
      <text
        x={MARGIN_LEFT - 6}
        y={height - MARGIN_BOTTOM + 4}
        fontSize={10}
        textAnchor="end"
        fill="currentColor"
        opacity={0.6}
      >
        0
      </text>
      {renderedBars.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.width} height={Math.max(1, b.height)} fill="currentColor" opacity={0.85} rx={3} />
          <text
            x={b.x + b.width / 2}
            y={height - 16}
            fontSize={10}
            textAnchor="middle"
            fill="currentColor"
            opacity={0.75}
          >
            {b.label.length > 12 ? `${b.label.slice(0, 12)}…` : b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
