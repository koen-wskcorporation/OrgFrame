import { NextResponse } from "next/server";
import { createOptionalSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { parseFacebookMessengerWebhookPayload, verifyFacebookWebhookSignature } from "@/src/features/communications/integrations/facebook";
import { normalizeDisplayName } from "@/src/features/communications/normalization";
import { resolveDirection, resolveFacebookIdentityLabelForWebhook, resolveInboundIdentity } from "@/src/features/communications/service";

export const runtime = "nodejs";

function getVerifyToken() {
  return (process.env.FACEBOOK_MESSENGER_WEBHOOK_VERIFY_TOKEN ?? process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN ?? "").trim();
}

function getAppSecret() {
  return (process.env.FACEBOOK_APP_SECRET ?? "").trim();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  if (mode !== "subscribe") {
    return NextResponse.json({ ok: false, error: "unsupported_mode" }, { status: 400 });
  }

  const expectedToken = getVerifyToken();
  if (!expectedToken) {
    return NextResponse.json({ ok: false, error: "webhook_verify_token_not_configured" }, { status: 500 });
  }

  if (token !== expectedToken) {
    return NextResponse.json({ ok: false, error: "invalid_verify_token" }, { status: 401 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: {
      "content-type": "text/plain"
    }
  });
}

export async function POST(request: Request) {
  const appSecret = getAppSecret();
  if (!appSecret) {
    return NextResponse.json({ ok: false, error: "facebook_app_secret_not_configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyFacebookWebhookSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const records = parseFacebookMessengerWebhookPayload(payload);
  if (records.length === 0) {
    return NextResponse.json({ ok: true, data: { processed: 0 } });
  }

  const supabase = createOptionalSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "service_role_not_configured" }, { status: 500 });
  }

  let processed = 0;
  const skipped: Array<{ reason: string; pageId: string; externalIdentityId: string }> = [];

  for (const record of records) {
    const identityContext = await resolveFacebookIdentityLabelForWebhook({
      pageId: record.pageId,
      externalIdentityId: record.externalIdentityId,
      client: supabase
    });

    if (!identityContext.orgId) {
      skipped.push({
        reason: "page_not_connected",
        pageId: record.pageId,
        externalIdentityId: record.externalIdentityId
      });
      continue;
    }

    await resolveInboundIdentity({
      orgId: identityContext.orgId,
      channelType: "facebook_messenger",
      externalIdentityId: record.externalIdentityId,
      externalThreadId: record.externalThreadId,
      externalMessageId: record.externalMessageId,
      direction: resolveDirection(record.direction),
      bodyText: record.bodyText,
      bodyHtml: null,
      senderLabel: identityContext.identityDisplayLabel ?? record.senderLabel,
      sentAt: record.sentAtIso,
      identityExternalUsername: null,
      identityDisplayLabel: identityContext.identityDisplayLabel ?? record.identityDisplayLabel,
      identityNormalizedValue: null,
      identityIsVerified: true,
      identityMetadata: {
        pageId: record.pageId,
        provider: "facebook_messenger",
        ...record.metadata
      },
      messageMetadata: {
        pageId: record.pageId,
        provider: "facebook_messenger",
        ...record.metadata
      },
      hints: {
        displayName: normalizeDisplayName(identityContext.identityDisplayLabel),
        metadata: {
          pageId: record.pageId
        }
      },
      client: supabase
    });

    processed += 1;
  }

  return NextResponse.json({
    ok: true,
    data: {
      processed,
      skipped
    }
  });
}
