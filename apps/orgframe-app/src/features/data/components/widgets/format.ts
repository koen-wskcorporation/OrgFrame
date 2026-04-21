const numberFmt = new Intl.NumberFormat("en-US");
const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const percentFmt = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMetricValue(value: number, format: "number" | "currency" | "percent" | undefined): string {
  if (!Number.isFinite(value)) return "—";
  if (format === "currency") return currencyFmt.format(value);
  if (format === "percent") return percentFmt.format(value);
  if (Math.abs(value) >= 10000) return compactFmt.format(value);
  return numberFmt.format(value);
}

export function formatNumberCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return compactFmt.format(value);
  return numberFmt.format(value);
}

export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
