import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { handleSupabaseEmailHook, type SupabaseEmailHookPayload } from "@/src/shared/email/hook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getWebhookSecret(): string | null {
  const raw = process.env.SUPABASE_AUTH_EMAIL_HOOK_SECRET?.trim();
  if (!raw) return null;
  // Supabase gives the secret as "v1,whsec_..." — standardwebhooks wants just the base64 body after "whsec_".
  return raw.replace(/^v1,/, "").replace(/^whsec_/, "");
}

export async function POST(request: Request) {
  const secret = getWebhookSecret();
  if (!secret) {
    console.error("[auth/email-hook] SUPABASE_AUTH_EMAIL_HOOK_SECRET not set");
    return NextResponse.json({ ok: false, error: "hook_secret_not_configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let payload: SupabaseEmailHookPayload;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, headers) as SupabaseEmailHookPayload;
  } catch (error) {
    console.error("[auth/email-hook] signature verification failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const result = await handleSupabaseEmailHook(payload);
  if (!result.ok) {
    console.error("[auth/email-hook] send failed", {
      error: result.error,
      action: payload.email_data.email_action_type,
      user: payload.user.id
    });
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, skipped: result.skipped ?? false });
}
