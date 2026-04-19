import "server-only";

import { createSupabaseServiceRoleClient } from "@/src/shared/data-api/server";

export type SuppressionReason = "unsubscribe" | "bounce" | "spam_report" | "manual" | "invalid";

export async function isSuppressed(orgId: string, email: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema("messaging")
    .from("suppressions")
    .select("id")
    .eq("org_id", orgId)
    .eq("email_lower", email.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check suppression: ${error.message}`);
  }

  return !!data;
}

export async function addSuppression(input: {
  orgId: string;
  email: string;
  reason: SuppressionReason;
  source?: string;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema("messaging")
    .from("suppressions")
    .upsert(
      {
        org_id: input.orgId,
        email_lower: input.email.trim().toLowerCase(),
        reason: input.reason,
        source: input.source ?? null
      },
      { onConflict: "org_id,email_lower", ignoreDuplicates: true }
    );

  if (error) {
    throw new Error(`Failed to add suppression: ${error.message}`);
  }
}

export async function removeSuppression(orgId: string, email: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema("messaging")
    .from("suppressions")
    .delete()
    .eq("org_id", orgId)
    .eq("email_lower", email.trim().toLowerCase());

  if (error) {
    throw new Error(`Failed to remove suppression: ${error.message}`);
  }
}
