import { createSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { generateNonce, openPayload, sealPayload, type SealedPayload } from "./encryption";

const HANDOFF_TTL_SECONDS = 60;

type HandoffSession = {
  accessToken: string;
  refreshToken: string;
};

type MintArgs = {
  session: HandoffSession;
  targetOrigin: string;
  nextPath: string;
  userId?: string | null;
};

type MintResult = {
  nonce: string;
  url: string;
};

function buildHandoffUrl(targetOrigin: string, nonce: string, nextPath: string): string {
  const url = new URL("/auth/handoff", targetOrigin);
  url.searchParams.set("token", nonce);
  if (nextPath && nextPath !== "/") {
    url.searchParams.set("next", nextPath);
  }
  return url.toString();
}

export async function mintHandoffToken(args: MintArgs): Promise<MintResult> {
  const nonce = generateNonce();
  const sealed: SealedPayload = sealPayload(JSON.stringify(args.session));
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000).toISOString();

  const client = createSupabaseServiceRoleClient();
  const { error } = await client.from("auth_handoff_tokens").insert({
    nonce,
    target_origin: args.targetOrigin,
    next_path: args.nextPath || "/",
    encrypted_payload: `\\x${sealed.ciphertext.toString("hex")}`,
    iv: `\\x${sealed.iv.toString("hex")}`,
    auth_tag: `\\x${sealed.authTag.toString("hex")}`,
    user_id: args.userId ?? null,
    expires_at: expiresAt
  });

  if (error) {
    throw new Error(`Failed to mint handoff token: ${error.message}`);
  }

  return {
    nonce,
    url: buildHandoffUrl(args.targetOrigin, nonce, args.nextPath)
  };
}

type ConsumeResult = {
  session: HandoffSession;
  nextPath: string;
};

function decodeByteaField(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    return Buffer.from(hex, "hex");
  }

  if (value && typeof value === "object" && "type" in value && (value as { type: string }).type === "Buffer") {
    return Buffer.from((value as unknown as { data: number[] }).data);
  }

  throw new Error("Unsupported bytea encoding");
}

export async function consumeHandoffToken(nonce: string, expectedOrigin: string): Promise<ConsumeResult> {
  const client = createSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("auth_handoff_tokens")
    .update({ consumed_at: nowIso })
    .eq("nonce", nonce)
    .is("consumed_at", null)
    .gt("expires_at", nowIso)
    .select("target_origin, next_path, encrypted_payload, iv, auth_tag")
    .single();

  if (error || !data) {
    throw new Error("handoff_token_invalid");
  }

  if (data.target_origin !== expectedOrigin) {
    throw new Error("handoff_origin_mismatch");
  }

  const ciphertext = decodeByteaField(data.encrypted_payload);
  const iv = decodeByteaField(data.iv);
  const authTag = decodeByteaField(data.auth_tag);

  const plaintext = openPayload({ ciphertext, iv, authTag });
  const session = JSON.parse(plaintext) as HandoffSession;

  return {
    session,
    nextPath: data.next_path || "/"
  };
}

export async function revokeHandoffTokensForUser(userId: string): Promise<void> {
  const client = createSupabaseServiceRoleClient();
  await client.from("auth_handoff_tokens").delete().eq("user_id", userId).is("consumed_at", null);
}
