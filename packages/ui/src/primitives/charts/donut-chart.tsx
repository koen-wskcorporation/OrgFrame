"use client";

import { useMemo } from "react";

export type DonutSegment = { label: string; value: number };

type DonutChartProps = {
  segments: DonutSegment[];
  size?: number;
  ariaLabel?: string;
  valueFormatter?: (value: number) => string;
};

const PALETTE = [
  "rgb(59 130 246)",
  "rgb(16 185 129)",
  "rgb(249 115 22)",
  "rgb(168 85 247)",
  "rgb(234 179 8)",
  "rgb(236 72 153)",
  "rgb(20 184 166)",
  "rgb(100 116 139)",
];

function polar(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = polar(cx, cy, rOuter, startAngle);
  const outerEnd = polar(cx, cy, rOuter, endAngle);
  const innerStart = polar(cx, cy, rInner, endAngle);
  const innerEnd = polar(cx, cy, rInner, startAngle);
  return [
    `M${outerStart.x.toFixed(1)},${outerStart.y.toFixed(1)}`,
    `A${rOuter},${rOuter} 0 ${largeArc} 1 ${outerEnd.x.toFixed(1)},${outerEnd.y.toFixed(1)}`,
    `L${innerStart.x.toFixed(1)},${innerStart.y.toFixed(1)}`,
    `A${rInner},${rInner} 0 ${largeArc} 0 ${innerEnd.x.toFixed(1)},${innerEnd.y.toFixed(1)}`,
    "Z",
  ].join(" ");
}

export function DonutChart({
  segments,
  size = 200,
  ariaLabel,
  valueFormatter = (v) => String(v),
}: DonutChartProps) {
  const { arcs, total } = useMemo(() => {
    const filtered = segments.filter((s) => s.value > 0);
    const total = filtered.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) return { arcs: [], total: 0 };
    const cx = size / 2;
    const cy = size / 2;
    const rOuter = size / 2 - 2;
    const rInner = rOuter * 0.6;
    let angle = -Math.PI / 2;
    const arcs = filtered.map((s, i) => {
      const sliceAngle = (s.value / total) * Math.PI * 2;
      const nextAngle = angle + sliceAngle;
      const path = arcPath(cx, cy, rOuter, rInner, angle, nextAngle);
      angle = nextAngle;
      return {
        label: s.label,
        value: s.value,
        path,
        color: PALETTE[i % PALETTE.length],
      };
    });
    return { arcs, total };
  }, [segments, size]);

  if (total === 0) {
    return (
      <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-text-muted">
        No data
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {arcs.map((a, i) => (
          <path key={i} d={a.path} fill={a.color} />
        ))}
        <text
          x={size / 2}
          y={size / 2 - 6}
          textAnchor="middle"
          fontSize={18}
          fill="currentColor"
          fontWeight={600}
        >
          {valueFormatter(total)}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 14}
          textAnchor="middle"
          fontSize={10}
          fill="currentColor"
          opacity={0.6}
        >
          Total
        </text>
      </svg>
      <ul className="space-y-1 text-sm">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
            <span className="text-text">{a.label}</span>
            <span className="text-text-muted">{valueFormatter(a.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
