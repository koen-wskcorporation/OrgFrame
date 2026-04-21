"use client";

import { useMemo } from "react";

export type SparklinePoint = { t: string; v: number };

type SparklineProps = {
  points: SparklinePoint[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  ariaLabel?: string;
};

export function Sparkline({
  points,
  width = 320,
  height = 72,
  stroke = "currentColor",
  fill = "currentColor",
  ariaLabel,
}: SparklineProps) {
  const { pathD, areaD, tickCount } = useMemo(() => {
    if (points.length === 0) {
      return { pathD: "", areaD: "", tickCount: 0 };
    }
    const values = points.map((p) => p.v);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const span = max - min || 1;
    const stepX = points.length > 1 ? width / (points.length - 1) : 0;

    const coords = points.map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.v - min) / span) * height;
      return { x, y };
    });

    const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const areaD = `${pathD} L${coords[coords.length - 1].x.toFixed(1)},${height} L0,${height} Z`;
    return { pathD, areaD, tickCount: points.length };
  }, [points, width, height]);

  if (tickCount === 0) {
    return (
      <div
        className="flex h-18 w-full items-center justify-center text-xs text-text-muted"
        aria-label={ariaLabel ?? "No data"}
      >
        No data
      </div>
    );
  }

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-full w-full overflow-visible"
    >
      <path d={areaD} fill={fill} opacity={0.12} />
      <path d={pathD} stroke={stroke} strokeWidth={1.5} fill="none" />
    </svg>
  );
}
