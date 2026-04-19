import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type UnsubscribeTokenPayload = {
  orgId: string;
  email: string;
  issuedAt: number;
};

const MAX_TOKEN_AGE_MS = 1000 * 60 * 60 * 24 * 365 * 2; // 2 years

function getSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("EMAIL_UNSUBSCRIBE_SECRET not set or too short (min 32 chars)");
  }
  return secret;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function signPayload(payloadB64: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(payloadB64).digest();
  return base64UrlEncode(mac);
}

export function signUnsubscribeToken(input: { orgId: string; email: string }): string {
  const payload: UnsubscribeTokenPayload = {
    orgId: input.orgId,
    email: input.email.trim().toLowerCase(),
    issuedAt: Date.now()
  };
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = signPayload(payloadB64, getSecret());
  return `${payloadB64}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): { ok: true; orgId: string; email: string } | { ok: false; error: string } {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, error: "malformed_token" };
  }

  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) {
    return { ok: false, error: "malformed_token" };
  }

  const secret = getSecret();
  const expected = signPayload(payloadB64, secret);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, error: "invalid_signature" };
  }

  let payload: UnsubscribeTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, error: "invalid_payload" };
  }

  if (!payload.orgId || !payload.email || typeof payload.issuedAt !== "number") {
    return { ok: false, error: "invalid_payload" };
  }

  if (Date.now() - payload.issuedAt > MAX_TOKEN_AGE_MS) {
    return { ok: false, error: "token_expired" };
  }

  return { ok: true, orgId: payload.orgId, email: payload.email };
}

export function buildUnsubscribeUrl(input: { orgId: string; email: string; appOrigin: string }): string {
  const token = signUnsubscribeToken({ orgId: input.orgId, email: input.email });
  return `${input.appOrigin.replace(/\/$/, "")}/email/unsubscribe?t=${encodeURIComponent(token)}`;
}
