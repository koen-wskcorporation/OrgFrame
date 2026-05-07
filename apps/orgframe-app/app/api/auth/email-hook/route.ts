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

// Supabase Send Email Hook expects errors in this exact shape so the inner
// `message` bubbles back to the client instead of the generic
// "Unexpected status code returned from hook: <code>". See
// https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
function hookError(httpCode: number, message: string) {
  return NextResponse.json(
    { error: { http_code: httpCode, message } },
    { status: httpCode }
  );
}

export async function POST(request: Request) {
  const secret = getWebhookSecret();
  if (!secret) {
    console.error("[auth/email-hook] SUPABASE_AUTH_EMAIL_HOOK_SECRET is not set");
    return hookError(500, "Email hook secret is not configured on the server.");
  }

  if (!process.env.SENDGRID_API_KEY?.trim()) {
    console.error("[auth/email-hook] SENDGRID_API_KEY is not set");
    return hookError(500, "SENDGRID_API_KEY is not configured on the server.");
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
    const message = error instanceof Error ? error.message : "invalid signature";
    console.error("[auth/email-hook] signature verification failed", message);
    return hookError(401, `Webhook signature verification failed: ${message}`);
  }

  const result = await handleSupabaseEmailHook(payload);
  if (!result.ok) {
    console.error("[auth/email-hook] send failed", {
      error: result.error,
      action: payload.email_data.email_action_type,
      user: payload.user.id
    });
    return hookError(500, result.error ?? "Failed to send email via SendGrid.");
  }

  return NextResponse.json({});
}

// Health probe: hit GET /api/auth/email-hook in a browser to verify the
// endpoint is reachable and the env wiring is correct without triggering a
// real auth event. Does not reveal secret values, only their presence.
export async function GET() {
  const status = {
    ok: true,
    sendgridApiKeyConfigured: Boolean(process.env.SENDGRID_API_KEY?.trim()),
    sendgridFromEmailConfigured: Boolean(process.env.SENDGRID_FROM_EMAIL?.trim()),
    hookSecretConfigured: Boolean(process.env.SUPABASE_AUTH_EMAIL_HOOK_SECRET?.trim())
  };
  return NextResponse.json(status);
}
