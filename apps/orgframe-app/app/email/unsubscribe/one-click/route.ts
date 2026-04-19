import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/src/features/messaging/tenant-email/unsubscribe";
import { addSuppression } from "@/src/features/messaging/tenant-email/suppression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 8058 one-click unsubscribe. Mail clients (Gmail, Apple Mail) POST here
// when the user clicks the "Unsubscribe" chip in the mail header. The body is
// `List-Unsubscribe=One-Click` (form-encoded); we ignore it and act on the token.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  const verified = verifyUnsubscribeToken(token);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.error }, { status: 400 });
  }

  await addSuppression({
    orgId: verified.orgId,
    email: verified.email,
    reason: "unsubscribe",
    source: "one_click_rfc8058"
  });

  return NextResponse.json({ ok: true });
}
