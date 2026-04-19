import { NextResponse } from "next/server";
import { ingestEvents, verifyEventWebhookSignature } from "@/src/features/messaging/tenant-email/event-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNATURE_HEADER = "x-twilio-email-event-webhook-signature";
const TIMESTAMP_HEADER = "x-twilio-email-event-webhook-timestamp";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);
  const timestamp = request.headers.get(TIMESTAMP_HEADER);

  if (!verifyEventWebhookSignature({ rawBody, signature, timestamp })) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let events: unknown;
  try {
    events = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(events)) {
    return NextResponse.json({ ok: false, error: "expected_array" }, { status: 400 });
  }

  try {
    const result = await ingestEvents(events as Parameters<typeof ingestEvents>[0]);
    return NextResponse.json({ ok: true, ingested: result.ingested });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
