import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createOptionalSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { resolveOrgIdFromSlug } from "@/src/features/communications/db/queries";
import { normalizeDisplayName, normalizeEmail, normalizePhone } from "@/src/features/communications/normalization";
import { resolveDirection, resolveInboundIdentity } from "@/src/features/communications/service";
import type { CommChannelType } from "@/src/features/communications/types";

export const runtime = "nodejs";

const inboundSchema = z
  .object({
    orgId: z.string().uuid().optional(),
    orgSlug: z.string().trim().min(1).optional(),
    channelType: z.enum(["email", "sms", "facebook_messenger", "website_chat", "instagram", "whatsapp", "other"] satisfies CommChannelType[]),
    externalIdentityId: z.string().trim().min(1),
    externalThreadId: z.string().trim().min(1).optional(),
    externalMessageId: z.string().trim().min(1).optional(),
    direction: z.string().trim().optional(),
    bodyText: z.string().default(""),
    bodyHtml: z.string().optional(),
    senderLabel: z.string().trim().optional(),
    sentAt: z.string().datetime().optional(),
    identity: z
      .object({
        externalUsername: z.string().trim().optional(),
        displayLabel: z.string().trim().optional(),
        normalizedValue: z.string().trim().optional(),
        isVerified: z.boolean().optional(),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
      .optional(),
    hints: z
      .object({
        email: z.string().trim().optional(),
        phone: z.string().trim().optional(),
        displayName: z.string().trim().optional(),
        authUserId: z.string().uuid().optional(),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .refine((value) => Boolean(value.orgId || value.orgSlug), {
    message: "orgId or orgSlug is required",
    path: ["orgId"]
  });

function verifyHmac(rawBody: string, signatureHeader: string, timestampHeader: string, secret: string) {
  const timestamp = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 5 * 60) {
    return false;
  }

  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "").trim();

  if (!provided || provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function isAuthorized(request: Request, rawBody: string) {
  const bearerToken = (process.env.INBOX_INGEST_BEARER_TOKEN ?? "").trim();
  const hmacSecret = (process.env.INBOX_INGEST_HMAC_SECRET ?? "").trim();

  if (!bearerToken && !hmacSecret) {
    return {
      ok: false,
      reason: "not_configured"
    };
  }

  if (bearerToken) {
    const authHeader = request.headers.get("authorization") ?? "";
    if (authHeader === `Bearer ${bearerToken}`) {
      return {
        ok: true,
        reason: "bearer"
      };
    }
  }

  if (hmacSecret) {
    const signatureHeader = request.headers.get("x-orgframe-signature") ?? "";
    const timestampHeader = request.headers.get("x-orgframe-timestamp") ?? "";
    if (verifyHmac(rawBody, signatureHeader, timestampHeader, hmacSecret)) {
      return {
        ok: true,
        reason: "hmac"
      };
    }
  }

  return {
    ok: false,
    reason: "unauthorized"
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const auth = isAuthorized(request, rawBody);

  if (!auth.ok) {
    const status = auth.reason === "not_configured" ? 500 : 401;
    return NextResponse.json(
      {
        ok: false,
        error: auth.reason === "not_configured" ? "inbox_ingest_not_configured" : "unauthorized"
      },
      { status }
    );
  }

  let payload: z.infer<typeof inboundSchema>;
  try {
    payload = inboundSchema.parse(rawBody ? JSON.parse(rawBody) : {});
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_payload"
      },
      { status: 400 }
    );
  }

  const supabase = createOptionalSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: "service_role_not_configured"
      },
      { status: 500 }
    );
  }

  const orgId = payload.orgId ?? (payload.orgSlug ? await resolveOrgIdFromSlug(payload.orgSlug, supabase) : null);
  if (!orgId) {
    return NextResponse.json(
      {
        ok: false,
        error: "org_not_found"
      },
      { status: 404 }
    );
  }

  try {
    const result = await resolveInboundIdentity({
      orgId,
      channelType: payload.channelType,
      externalIdentityId: payload.externalIdentityId,
      externalThreadId: payload.externalThreadId ?? null,
      externalMessageId: payload.externalMessageId ?? null,
      direction: resolveDirection(payload.direction),
      bodyText: payload.bodyText,
      bodyHtml: payload.bodyHtml ?? null,
      senderLabel: payload.senderLabel ?? payload.identity?.displayLabel ?? null,
      sentAt: payload.sentAt ?? new Date().toISOString(),
      identityExternalUsername: payload.identity?.externalUsername ?? null,
      identityDisplayLabel: payload.identity?.displayLabel ?? null,
      identityNormalizedValue: payload.identity?.normalizedValue ?? normalizeEmail(payload.hints?.email) ?? normalizePhone(payload.hints?.phone),
      identityIsVerified: payload.identity?.isVerified ?? false,
      identityMetadata: payload.identity?.metadata ?? {},
      messageMetadata: payload.metadata ?? {},
      hints: {
        email: normalizeEmail(payload.hints?.email),
        phone: normalizePhone(payload.hints?.phone),
        displayName: normalizeDisplayName(payload.hints?.displayName),
        authUserId: payload.hints?.authUserId ?? null,
        metadata: payload.hints?.metadata ?? {}
      },
      client: supabase
    });

    return NextResponse.json({
      ok: true,
      data: {
        conversationId: result.conversation.id,
        identityId: result.identity.id,
        contactId: result.contact?.id ?? null,
        messageId: result.message.id,
        resolutionStatus: result.conversation.resolutionStatus,
        autoLinked: result.autoLinked,
        suggestionCount: result.suggestions.length
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "inbound_ingest_failed"
      },
      { status: 500 }
    );
  }
}
