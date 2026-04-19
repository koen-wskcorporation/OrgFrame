import "server-only";

import { createPublicKey, verify as verifySignature } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { addSuppression } from "./suppression";

type SendGridEvent = {
  email: string;
  timestamp: number;
  event: string;
  sg_event_id: string;
  sg_message_id: string;
  reason?: string;
  type?: string;
  // customArgs flatten into the event envelope
  org_id?: string;
  contact_id?: string;
  template_key?: string;
};

export function verifyEventWebhookSignature(input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}): boolean {
  const publicKeyPem = process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY?.trim();
  if (!publicKeyPem || !input.signature || !input.timestamp) {
    return false;
  }

  try {
    // SendGrid ships the public key as a base64 DER-encoded ECDSA key. Accept
    // either a raw base64 key or a PEM block.
    const keyPem = publicKeyPem.includes("BEGIN PUBLIC KEY")
      ? publicKeyPem
      : `-----BEGIN PUBLIC KEY-----\n${publicKeyPem}\n-----END PUBLIC KEY-----`;

    const key = createPublicKey({ key: keyPem, format: "pem" });
    const signed = Buffer.from(input.timestamp + input.rawBody, "utf8");
    const sig = Buffer.from(input.signature, "base64");
    return verifySignature("sha256", signed, key, sig);
  } catch {
    return false;
  }
}

export async function ingestEvents(events: SendGridEvent[]): Promise<{ ingested: number }> {
  if (!Array.isArray(events) || events.length === 0) {
    return { ingested: 0 };
  }

  const supabase = createSupabaseServiceRoleClient();

  // Look up send_id from sendgrid_message_id for correlation. Messages may not
  // exist in our sends table (e.g., platform auth emails, pre-migration sends).
  const messageIds = Array.from(
    new Set(events.map((e) => e.sg_message_id).filter((id): id is string => typeof id === "string" && id.length > 0))
  );

  const sendIdByMessageId = new Map<string, string>();
  if (messageIds.length > 0) {
    const { data } = await supabase
      .schema("messaging")
      .from("sends")
      .select("id, sendgrid_message_id")
      .in("sendgrid_message_id", messageIds);

    for (const row of data ?? []) {
      if (row.sendgrid_message_id) {
        sendIdByMessageId.set(row.sendgrid_message_id, row.id);
      }
    }
  }

  const rows = events.map((event) => ({
    org_id: event.org_id ?? null,
    send_id: event.sg_message_id ? sendIdByMessageId.get(event.sg_message_id) ?? null : null,
    sg_event_id: event.sg_event_id,
    sg_message_id: event.sg_message_id ?? null,
    event_type: event.event,
    email: event.email ?? null,
    occurred_at: new Date((event.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
    raw: event
  }));

  const { error } = await supabase
    .schema("messaging")
    .from("events")
    .upsert(rows, { onConflict: "sg_event_id", ignoreDuplicates: true });

  if (error) {
    throw new Error(`Failed to insert events: ${error.message}`);
  }

  // Auto-suppress on hard bounces and spam reports so we stop mailing the address.
  for (const event of events) {
    if (!event.org_id || !event.email) continue;
    if (event.event === "bounce" && event.type === "bounce") {
      await addSuppression({ orgId: event.org_id, email: event.email, reason: "bounce", source: "sendgrid_event" }).catch(() => undefined);
    } else if (event.event === "spamreport") {
      await addSuppression({ orgId: event.org_id, email: event.email, reason: "spam_report", source: "sendgrid_event" }).catch(() => undefined);
    } else if (event.event === "dropped" && event.reason?.toLowerCase().includes("invalid")) {
      await addSuppression({ orgId: event.org_id, email: event.email, reason: "invalid", source: "sendgrid_event" }).catch(() => undefined);
    }
  }

  return { ingested: rows.length };
}
