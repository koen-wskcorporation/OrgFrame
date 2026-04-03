"use server";

import { z } from "zod";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { Permission } from "@/src/features/core/access";
import type { OrderPanelData, OrderPanelResult } from "@/src/features/orders/types";

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
      .schema("commerce").from("orders")
      .select(
        "id, source_order_id, source_order_no, payer_user_id, source_payment_status, order_status, order_date, total_amount, total_paid_amount, balance_amount, billing_first_name, billing_last_name, billing_address, items_json, metadata_json"
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
        .schema("commerce").from("orders")
        .select(
          "id, source_order_id, source_order_no, payer_user_id, source_payment_status, order_status, order_date, total_amount, total_paid_amount, balance_amount, billing_first_name, billing_last_name, billing_address, items_json, metadata_json"
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

    const { data: paymentsRows, error: paymentsError } = await supabase
      .schema("commerce").from("payments")
      .select(
        "id, source_payment_key, source_event_id, source_event_sequence, source_event_count, payer_user_id, player_id, registration_id, payment_status, payment_date, payment_amount, paid_registration_fee, paid_cc_fee, metadata_json"
      )
      .eq("org_id", orgContext.orgId)
      .eq("order_id", resolvedOrder.id)
      .order("payment_date", { ascending: true });

    if (paymentsError) {
      return {
        ok: false,
        error: "Unable to load order line items."
      };
    }

    const rawItems = Array.isArray(resolvedOrder.items_json) ? resolvedOrder.items_json : [];

    const data: OrderPanelData = {
      order: {
        id: resolvedOrder.id,
        sourceOrderId: resolvedOrder.source_order_id,
        sourceOrderNo: resolvedOrder.source_order_no,
        payerUserId: resolvedOrder.payer_user_id,
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
      items: rawItems.map((item) => {
        const row = asObject(item);
        return {
          id: typeof row.id === "string" ? row.id : "",
          sourceLineKey: typeof row.source_line_key === "string" ? row.source_line_key : "",
          description: typeof row.description === "string" ? row.description : null,
          sourceProgramName: typeof row.source_program_name === "string" ? row.source_program_name : null,
          sourceDivisionName: typeof row.source_division_name === "string" ? row.source_division_name : null,
          sourceTeamName: typeof row.source_team_name === "string" ? row.source_team_name : null,
          amount: asMoney(row.amount),
          amountPaid: asMoney(row.amount_paid),
          balanceAmount: asMoney(row.balance_amount),
          metadataJson: asObject(row.metadata_json)
        };
      }),
      payments: (paymentsRows ?? []).map((payment) => ({
        id: payment.id,
        sourcePaymentKey: payment.source_payment_key,
        sourceEventId: payment.source_event_id ?? null,
        sourceEventSequence:
          typeof payment.source_event_sequence === "number" ? payment.source_event_sequence : payment.source_event_sequence ? Number(payment.source_event_sequence) : null,
        sourceEventCount:
          typeof payment.source_event_count === "number" ? payment.source_event_count : payment.source_event_count ? Number(payment.source_event_count) : null,
        payerUserId: payment.payer_user_id ?? null,
        playerId: payment.player_id ?? null,
        registrationId: payment.registration_id ?? null,
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
