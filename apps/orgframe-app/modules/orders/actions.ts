"use server";

import { z } from "zod";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { Permission } from "@/modules/core/access";
import type { OrderPanelData, OrderPanelResult } from "@/modules/orders/types";

const lookupOrderPanelSchema = z
  .object({
    orgSlug: z.string().trim().min(1),
    orderId: z.string().uuid().optional(),
    sourceRef: z.string().trim().min(1).max(200).optional()
  })
  .refine((value) => Boolean(value.orderId || value.sourceRef), {
    message: "Provide orderId or sourceRef."
  });

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function hasOrderPanelAccess(permissions: Permission[]) {
  return can(permissions, "forms.read") || can(permissions, "forms.write") || can(permissions, "org.manage.read");
}

export async function getOrderPanelDataAction(input: z.input<typeof lookupOrderPanelSchema>): Promise<OrderPanelResult> {
  const parsed = lookupOrderPanelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid order lookup request."
    };
  }

  try {
    const payload = parsed.data;
    const orgContext = await getOrgAuthContext(payload.orgSlug);

    if (!hasOrderPanelAccess(orgContext.membershipPermissions)) {
      return {
        ok: false,
        error: "You do not have permission to view orders."
      };
    }

    const supabase = await createSupabaseServer();

    const orderQuery = supabase
      .from("org_orders")
      .select(
        "id, source_order_id, source_order_no, source_payment_status, order_status, order_date, total_amount, total_paid_amount, balance_amount, billing_first_name, billing_last_name, billing_address, metadata_json"
      )
      .eq("org_id", orgContext.orgId)
      .limit(1);

    const { data: orderRow, error: orderError } = payload.orderId
      ? await orderQuery.eq("id", payload.orderId).maybeSingle()
      : await orderQuery.eq("source_order_id", payload.sourceRef ?? "").maybeSingle();

    if (orderError) {
      return {
        ok: false,
        error: "Unable to load order details right now."
      };
    }

    let resolvedOrder = orderRow;

    if (!resolvedOrder && payload.sourceRef) {
      const { data: fallbackRow, error: fallbackError } = await supabase
        .from("org_orders")
        .select(
          "id, source_order_id, source_order_no, source_payment_status, order_status, order_date, total_amount, total_paid_amount, balance_amount, billing_first_name, billing_last_name, billing_address, metadata_json"
        )
        .eq("org_id", orgContext.orgId)
        .eq("source_order_no", payload.sourceRef)
        .limit(1)
        .maybeSingle();

      if (fallbackError) {
        return {
          ok: false,
          error: "Unable to load order details right now."
        };
      }

      resolvedOrder = fallbackRow;
    }

    if (!resolvedOrder?.id) {
      return {
        ok: false,
        error: "Order not found."
      };
    }

    const [itemsResult, paymentsResult] = await Promise.all([
      supabase
        .from("org_order_items")
        .select(
          "id, source_line_key, description, source_program_name, source_division_name, source_team_name, amount, amount_paid, balance_amount, metadata_json"
        )
        .eq("org_id", orgContext.orgId)
        .eq("order_id", resolvedOrder.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("org_order_payments")
        .select("id, source_payment_key, payment_status, payment_date, payment_amount, paid_registration_fee, paid_cc_fee, metadata_json")
        .eq("org_id", orgContext.orgId)
        .eq("order_id", resolvedOrder.id)
        .order("payment_date", { ascending: true })
    ]);

    if (itemsResult.error || paymentsResult.error) {
      return {
        ok: false,
        error: "Unable to load order line items."
      };
    }

    const data: OrderPanelData = {
      order: {
        id: resolvedOrder.id,
        sourceOrderId: resolvedOrder.source_order_id,
        sourceOrderNo: resolvedOrder.source_order_no,
        sourcePaymentStatus: resolvedOrder.source_payment_status,
        orderStatus: resolvedOrder.order_status,
        orderDate: resolvedOrder.order_date,
        totalAmount: asMoney(resolvedOrder.total_amount),
        totalPaidAmount: asMoney(resolvedOrder.total_paid_amount),
        balanceAmount: asMoney(resolvedOrder.balance_amount),
        billingFirstName: resolvedOrder.billing_first_name,
        billingLastName: resolvedOrder.billing_last_name,
        billingAddress: resolvedOrder.billing_address,
        metadataJson: asObject(resolvedOrder.metadata_json)
      },
      items: (itemsResult.data ?? []).map((item) => ({
        id: item.id,
        sourceLineKey: item.source_line_key,
        description: item.description,
        sourceProgramName: item.source_program_name,
        sourceDivisionName: item.source_division_name,
        sourceTeamName: item.source_team_name,
        amount: asMoney(item.amount),
        amountPaid: asMoney(item.amount_paid),
        balanceAmount: asMoney(item.balance_amount),
        metadataJson: asObject(item.metadata_json)
      })),
      payments: (paymentsResult.data ?? []).map((payment) => ({
        id: payment.id,
        sourcePaymentKey: payment.source_payment_key,
        paymentStatus: payment.payment_status,
        paymentDate: payment.payment_date,
        paymentAmount: asMoney(payment.payment_amount),
        paidRegistrationFee: asMoney(payment.paid_registration_fee),
        paidCcFee: asMoney(payment.paid_cc_fee),
        metadataJson: asObject(payment.metadata_json)
      }))
    };

    return {
      ok: true,
      data
    };
  } catch {
    return {
      ok: false,
      error: "Unable to load order details right now."
    };
  }
}
