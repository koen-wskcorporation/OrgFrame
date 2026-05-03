export type RangeKey = "7d" | "30d" | "90d" | "ytd" | "365d";

export const defaultRangeKey: RangeKey = "30d";

export const rangeOptions: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "ytd", label: "Year to date" },
  { key: "365d", label: "Last 12 months" },
];

export function normalizeRangeKey(raw: string | undefined | null): RangeKey {
  if (!raw) return defaultRangeKey;
  if (rangeOptions.some((o) => o.key === raw)) return raw as RangeKey;
  return defaultRangeKey;
}

export function resolveRange(range: RangeKey, now: Date = new Date()): { start: string; end: string } {
  const end = now.toISOString().slice(0, 10);
  let days = 30;
  if (range === "7d") days = 7;
  else if (range === "30d") days = 30;
  else if (range === "90d") days = 90;
  else if (range === "365d") days = 365;
  else if (range === "ytd") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
    return { start, end };
  }
  const startMs = now.getTime() - (days - 1) * 24 * 60 * 60 * 1000;
  const start = new Date(startMs).toISOString().slice(0, 10);
  return { start, end };
}
