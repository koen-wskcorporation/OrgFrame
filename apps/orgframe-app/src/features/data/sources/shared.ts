import type { DataSourceLoadCtx, DataSourceSnapshot } from "@/src/features/data/registry/types";

export function emptySnapshot(): DataSourceSnapshot {
  return { metrics: {}, series: {}, breakdowns: {}, tables: {} };
}

/** Parse ISO date as UTC start-of-day. */
export function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Get previous-range (same length immediately before range). */
export function previousRange(ctx: DataSourceLoadCtx): { start: string; end: string } {
  const start = parseDate(ctx.rangeStart);
  const end = parseDate(ctx.rangeEnd);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { start: prevStart.toISOString().slice(0, 10), end: prevEnd.toISOString().slice(0, 10) };
}

/** Build daily series from a list of timestamps (ISO). Zero-fills missing days. */
export function bucketDaily(timestamps: string[], ctx: DataSourceLoadCtx): { t: string; v: number }[] {
  const start = parseDate(ctx.rangeStart);
  const end = parseDate(ctx.rangeEnd);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const buckets = new Map<string, number>();
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const ts of timestamps) {
    const day = ts.slice(0, 10);
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([t, v]) => ({ t, v }));
}

/** Count rows in range from a timestamp string array (inclusive). */
export function countInRange(timestamps: string[], startIso: string, endIso: string): number {
  const start = parseDate(startIso).getTime();
  const end = parseDate(endIso).getTime() + 24 * 60 * 60 * 1000 - 1;
  let count = 0;
  for (const ts of timestamps) {
    const t = new Date(ts).getTime();
    if (t >= start && t <= end) count++;
  }
  return count;
}

/** Group values by a key, returning sorted descending by count. */
export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): { label: K; value: number }[] {
  const map = new Map<K, number>();
  for (const item of items) {
    const k = key(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export async function tryLoad<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn("[data-center] loader error:", err);
    return fallback;
  }
}
