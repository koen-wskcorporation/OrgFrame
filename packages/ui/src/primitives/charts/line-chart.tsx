"use client";

import { useMemo } from "react";

export type LineChartPoint = { t: string; v: number };

type LineChartProps = {
  points: LineChartPoint[];
  height?: number;
  ariaLabel?: string;
  yFormatter?: (value: number) => string;
  xFormatter?: (value: string) => string;
};

const VIEW_WIDTH = 600;
const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 28;
const MARGIN_LEFT = 36;
const MARGIN_RIGHT = 12;

export function LineChart({
  points,
  height = 220,
  ariaLabel,
  yFormatter = (v) => String(v),
  xFormatter = (t) => t,
}: LineChartProps) {
  const { path, areaPath, xTicks, yTicks, hasData } = useMemo(() => {
    if (points.length === 0) {
      return { path: "", areaPath: "", xTicks: [], yTicks: [], hasData: false };
    }
    const innerW = VIEW_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    const innerH = height - MARGIN_TOP - MARGIN_BOTTOM;
    const values = points.map((p) => p.v);
    const minV = Math.min(0, ...values);
    const maxV = Math.max(1, ...values);
    const span = maxV - minV || 1;
    const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

    const coords = points.map((p, i) => ({
      x: MARGIN_LEFT + i * stepX,
      y: MARGIN_TOP + innerH - ((p.v - minV) / span) * innerH,
    }));

    const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const baseY = MARGIN_TOP + innerH;
    const areaPath = `${path} L${coords[coords.length - 1].x.toFixed(1)},${baseY} L${coords[0].x.toFixed(1)},${baseY} Z`;

    const xTickCount = Math.min(points.length, 6);
    const xTickStep = Math.max(1, Math.floor(points.length / xTickCount));
    const xTicks = points
      .map((p, i) => ({ i, p }))
      .filter(({ i }) => i % xTickStep === 0)
      .map(({ i, p }) => ({ x: coords[i].x, label: xFormatter(p.t) }));

    const yTicks = [0, 0.5, 1].map((f) => ({
      y: MARGIN_TOP + innerH - f * innerH,
      label: yFormatter(Math.round(minV + f * span)),
    }));

    return { path, areaPath, xTicks, yTicks, hasData: true };
  }, [points, height, xFormatter, yFormatter]);

  if (!hasData) {
    return (
      <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-text-muted">
        No data in range
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
      {yTicks.map((tick, i) => (
        <g key={`y-${i}`}>
          <line
            x1={MARGIN_LEFT}
            x2={VIEW_WIDTH - MARGIN_RIGHT}
            y1={tick.y}
            y2={tick.y}
            stroke="currentColor"
            strokeOpacity={0.1}
          />
          <text
            x={MARGIN_LEFT - 6}
            y={tick.y + 3}
            fontSize={10}
            textAnchor="end"
            fill="currentColor"
            opacity={0.6}
          >
            {tick.label}
          </text>
        </g>
      ))}
      {xTicks.map((tick, i) => (
        <text
          key={`x-${i}`}
          x={tick.x}
          y={height - 8}
          fontSize={10}
          textAnchor="middle"
          fill="currentColor"
          opacity={0.6}
        >
          {tick.label}
        </text>
      ))}
      <path d={areaPath} fill="currentColor" opacity={0.15} />
      <path d={path} stroke="currentColor" strokeWidth={2} fill="none" />
    </svg>
  );
}
