import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data-center/registry/types";
import { bucketDaily, emptySnapshot, groupBy, previousRange, tryLoad } from "@/src/features/data-center/sources/shared";

function sumAmount(values: unknown[]): number {
  let total = 0;
  for (const v of values) {
    if (typeof v === "number") total += v;
    else if (typeof v === "string") {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) total += n;
    }
  }
  return total;
}

function inRange(order: Record<string, unknown>, start: string, end: string): boolean {
  const d = (order.order_date as string | null) ?? (order.created_at as string | null) ?? "";
  if (!d) return false;
  const day = d.slice(0, 10);
  return day >= start && day <= end;
}

export const ordersDataSource: DataSourceDefinition = {
  key: "orders",
  label: "Orders",
  description: "Order volume and revenue.",
  icon: "credit-card",
  kind: "tool",
  permissions: ["org.manage.read"],
  metrics: [
    { key: "orders_in_range", label: "Orders in range", goodDirection: "up" },
    { key: "revenue_in_range", label: "Revenue in range", format: "currency", goodDirection: "up" },
    { key: "total_orders", label: "All-time orders" },
    { key: "outstanding_balance", label: "Outstanding balance", format: "currency", goodDirection: "down" },
  ],
  series: [{ key: "orders_daily", label: "Orders over time", kind: "line" }],
  breakdowns: [{ key: "order_status", label: "By status" }],
  tables: [
    {
      key: "orders_list",
      label: "Orders",
      defaultSortKey: "orderDate",
      defaultSortDirection: "desc",
      columns: [
        { key: "sourceOrderNo", label: "Order #", type: "text" },
        { key: "payerName", label: "Payer", type: "text" },
        { key: "orderStatus", label: "Status", type: "status" },
        { key: "totalAmount", label: "Total", type: "number" },
        { key: "balanceAmount", label: "Balance", type: "number" },
        { key: "orderDate", label: "Date", type: "date" },
      ],
    },
  ],
  dashboards: [
    {
      key: "overview",
      label: "Overview",
      widgets: [
        { kind: "metric", metricKey: "orders_in_range" },
        { kind: "metric", metricKey: "revenue_in_range" },
        { kind: "metric", metricKey: "total_orders" },
        { kind: "metric", metricKey: "outstanding_balance" },
        { kind: "timeseries", seriesKey: "orders_daily", spanColumns: 2 },
        { kind: "breakdown", breakdownKey: "order_status" },
        { kind: "table", tableKey: "orders_list", spanColumns: 3, maxRows: 25 },
      ],
    },
  ],
  async loader(ctx) {
    return tryLoad(async () => {
      const supabase = await createSupabaseServer();
      const snap = emptySnapshot();

      const { data: orders } = await supabase
        .schema("commerce").from("orders")
        .select("id, source_order_no, order_status, order_date, total_amount, total_paid_amount, balance_amount, billing_first_name, billing_last_name, created_at")
        .eq("org_id", ctx.orgId);
      const list = orders ?? [];

      const inR = list.filter((o) => inRange(o, ctx.rangeStart, ctx.rangeEnd));
      const prev = previousRange(ctx);
      const inPrev = list.filter((o) => inRange(o, prev.start, prev.end));

      snap.metrics.total_orders = { value: list.length };
      snap.metrics.orders_in_range = { value: inR.length, previous: inPrev.length };
      snap.metrics.revenue_in_range = {
        value: sumAmount(inR.map((o) => o.total_paid_amount as unknown)),
        previous: sumAmount(inPrev.map((o) => o.total_paid_amount as unknown)),
      };
      snap.metrics.outstanding_balance = { value: sumAmount(list.map((o) => o.balance_amount as unknown)) };

      snap.series.orders_daily = {
        points: bucketDaily(
          inR.map((o) => ((o.order_date as string) ?? (o.created_at as string)) ?? ""),
          ctx
        ),
      };

      snap.breakdowns.order_status = {
        segments: groupBy(list, (o) => ((o.order_status as string) || "unknown") as string),
      };

      snap.tables.orders_list = {
        total: list.length,
        rows: list.map((o) => ({
          id: o.id,
          sourceOrderNo: o.source_order_no,
          payerName: [o.billing_first_name, o.billing_last_name].filter(Boolean).join(" "),
          orderStatus: o.order_status,
          totalAmount: Number(o.total_amount ?? 0),
          balanceAmount: Number(o.balance_amount ?? 0),
          orderDate: o.order_date ?? o.created_at,
        })),
      };

      return snap;
    }, emptySnapshot());
  },
};
