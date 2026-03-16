"use client";

import { createContext, useCallback, useMemo, useState } from "react";
import { Alert } from "@orgframe/ui/ui/alert";
import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent } from "@orgframe/ui/ui/card";
import { Panel } from "@orgframe/ui/ui/panel";
import { useToast } from "@orgframe/ui/ui/toast";
import { getOrderPanelDataAction } from "@/modules/orders/actions";
import type { OrderPanelContextValue, OrderPanelData, OrderPanelOpenInput } from "@/modules/orders/types";

export const OrderPanelContext = createContext<OrderPanelContextValue | null>(null);

function formatMoney(value: number | null) {
  if (typeof value !== "number") {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

export function OrderPanelProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrderPanelData | null>(null);

  const openOrderPanel = useCallback(
    async (input: OrderPanelOpenInput) => {
      setOpen(true);
      setLoading(true);
      setError(null);

      const result = await getOrderPanelDataAction({
        orgSlug: input.orgSlug,
        orderId: input.orderId,
        sourceRef: input.sourceRef
      });

      setLoading(false);

      if (!result.ok) {
        setData(null);
        setError(result.error);
        toast({
          title: "Unable to open order",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setData(result.data);
    },
    [toast]
  );

  const contextValue = useMemo<OrderPanelContextValue>(
    () => ({
      openOrderPanel
    }),
    [openOrderPanel]
  );

  return (
    <OrderPanelContext.Provider value={contextValue}>
      {children}

      <Panel
        footer={
          <Button onClick={() => setOpen(false)} variant="ghost">
            Close
          </Button>
        }
        onClose={() => setOpen(false)}
        open={open}
        subtitle="Imported order ledger details"
        title={data ? `Order ${data.order.sourceOrderNo ?? data.order.sourceOrderId}` : "Order"}
      >
        {loading ? <p className="text-sm text-text-muted">Loading order details...</p> : null}

        {!loading && error ? <Alert variant="destructive">{error}</Alert> : null}

        {!loading && !error && data ? (
          <div className="space-y-4">
            <Card className="shadow-none">
              <CardContent className="grid gap-3 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Source Order ID</p>
                  <p className="font-mono text-xs text-text-muted">{data.order.sourceOrderId}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Source Order Number</p>
                  <p className="text-sm text-text">{data.order.sourceOrderNo ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Payment Status</p>
                  <p className="text-sm text-text">{data.order.sourcePaymentStatus ?? "-"}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Total</p>
                    <p className="text-sm text-text">{formatMoney(data.order.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Paid</p>
                    <p className="text-sm text-text">{formatMoney(data.order.totalPaidAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Balance</p>
                    <p className="text-sm text-text">{formatMoney(data.order.balanceAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <section className="space-y-2">
              <p className="text-sm font-semibold text-text">Line Items</p>
              {data.items.length === 0 ? <Alert variant="info">No line items found.</Alert> : null}
              {data.items.map((item) => (
                <Card className="shadow-none" key={item.id}>
                  <CardContent className="space-y-2 py-3">
                    <p className="text-sm font-medium text-text">{item.description ?? "(no description)"}</p>
                    <p className="text-xs text-text-muted">{item.sourceProgramName ?? "Program"} / {item.sourceDivisionName ?? "Division"}</p>
                    <div className="grid grid-cols-3 gap-2 text-xs text-text-muted">
                      <p>Amount: {formatMoney(item.amount)}</p>
                      <p>Paid: {formatMoney(item.amountPaid)}</p>
                      <p>Balance: {formatMoney(item.balanceAmount)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>

            <section className="space-y-2">
              <p className="text-sm font-semibold text-text">Payments</p>
              {data.payments.length === 0 ? <Alert variant="info">No payments found.</Alert> : null}
              {data.payments.map((payment) => (
                <Card className="shadow-none" key={payment.id}>
                  <CardContent className="space-y-1 py-3">
                    <p className="text-sm text-text">{payment.paymentStatus ?? "Unknown status"}</p>
                    <p className="text-xs text-text-muted">{payment.paymentDate ? new Date(payment.paymentDate).toLocaleString() : "No payment timestamp"}</p>
                    <p className="text-xs text-text-muted">Amount: {formatMoney(payment.paymentAmount)}</p>
                  </CardContent>
                </Card>
              ))}
            </section>
          </div>
        ) : null}
      </Panel>
    </OrderPanelContext.Provider>
  );
}
