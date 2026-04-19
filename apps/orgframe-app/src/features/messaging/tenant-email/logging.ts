import "server-only";

import { createSupabaseServiceRoleClient } from "@/src/shared/data-api/server";

export type SendStatus = "queued" | "sent" | "failed" | "suppressed" | "quota_exceeded";

export type RecordSendInput = {
  orgId: string;
  identityId: string | null;
  contactId?: string | null;
  toEmail: string;
  fromEmail: string;
  subject: string;
  templateKey?: string;
  category?: string;
  status: SendStatus;
  sendgridMessageId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

export async function recordSend(input: RecordSendInput): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema("messaging")
    .from("sends")
    .insert({
      org_id: input.orgId,
      identity_id: input.identityId,
      contact_id: input.contactId ?? null,
      to_email: input.toEmail.trim().toLowerCase(),
      from_email: input.fromEmail,
      subject: input.subject,
      template_key: input.templateKey ?? null,
      category: input.category ?? null,
      status: input.status,
      sendgrid_message_id: input.sendgridMessageId ?? null,
      error: input.error ?? null,
      metadata: input.metadata ?? {}
    })
    .select("id")
    .single();

  if (error) {
    // Logging failure should not break the send path — surface via console.
    // eslint-disable-next-line no-console
    console.error("[messaging] failed to record send", error.message);
    return null;
  }
  return data?.id ?? null;
}
