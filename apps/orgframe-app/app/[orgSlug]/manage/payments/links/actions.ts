"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createOrgPaymentLink, setOrgPaymentLinkActive, setOrgPaymentLinkSharing } from "@/src/features/billing/service";
import type { OrgPaymentLink } from "@/src/features/billing/types";
import type { SharePermission, ShareTarget } from "@/src/features/org-share/types";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { requireOrgToolEnabled } from "@/src/shared/org/requireOrgToolEnabled";

type PaymentLinksActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

const createPaymentLinkSchema = z.object({
  orgSlug: z.string().trim().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  amountDollars: z.number().min(0.5).max(1_000_000),
  successMessage: z.string().trim().max(500).optional()
});

const togglePaymentLinkSchema = z.object({
  orgSlug: z.string().trim().min(1),
  linkId: z.string().uuid(),
  isActive: z.boolean()
});

const shareTargetSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["team", "division", "program", "person", "admin", "group"]),
  label: z.string().trim().min(1),
  subtitle: z.string().trim().optional()
});

const updateSharingSchema = z.object({
  orgSlug: z.string().trim().min(1),
  linkId: z.string().uuid(),
  permission: z.enum(["view", "comment", "edit"]),
  targets: z.array(shareTargetSchema).max(200)
});

function asError(error: string): PaymentLinksActionResult<never> {
  return {
    ok: false,
    error
  };
}

function revalidatePaymentsPaths(orgSlug: string) {
  revalidatePath(`/${orgSlug}/manage/payments`);
  revalidatePath(`/${orgSlug}/manage/payments/links`);
  revalidatePath(`/${orgSlug}/manage/payments`, "layout");
}

export async function createOrgPaymentLinkAction(
  input: z.input<typeof createPaymentLinkSchema>
): Promise<PaymentLinksActionResult<{ link: OrgPaymentLink }>> {
  const parsed = createPaymentLinkSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid payment link details.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const link = await createOrgPaymentLink({
      orgId: org.orgId,
      actorUserId: org.userId,
      title: parsed.data.title,
      description: parsed.data.description?.trim() ? parsed.data.description.trim() : null,
      amountCents: Math.round(parsed.data.amountDollars * 100),
      currency: "usd",
      successMessage: parsed.data.successMessage?.trim() ? parsed.data.successMessage.trim() : null
    });

    revalidatePaymentsPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        link
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create payment link right now.");
  }
}

export async function setOrgPaymentLinkActiveAction(
  input: z.input<typeof togglePaymentLinkSchema>
): Promise<PaymentLinksActionResult<{ id: string; isActive: boolean }>> {
  const parsed = togglePaymentLinkSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid payment link status update.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const link = await setOrgPaymentLinkActive({
      orgId: org.orgId,
      linkId: parsed.data.linkId,
      isActive: parsed.data.isActive
    });

    revalidatePaymentsPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        id: link.id,
        isActive: link.isActive
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update payment link status.");
  }
}

export async function updateOrgPaymentLinkSharingAction(
  input: z.input<typeof updateSharingSchema>
): Promise<PaymentLinksActionResult<{ link: OrgPaymentLink }>> {
  const parsed = updateSharingSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid payment link sharing update.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const link = await setOrgPaymentLinkSharing({
      orgId: org.orgId,
      linkId: parsed.data.linkId,
      sharing: {
        permission: parsed.data.permission as SharePermission,
        targets: parsed.data.targets as ShareTarget[],
        updatedAt: new Date().toISOString()
      }
    });

    revalidatePaymentsPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        link
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update payment link sharing.");
  }
}
