import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function resolveKey(): Buffer {
  const explicit = process.env.AUTH_HANDOFF_ENC_KEY;
  if (explicit) {
    const trimmed = explicit.trim();
    try {
      const buf = Buffer.from(trimmed, "base64");
      if (buf.length === 32) {
        return buf;
      }
    } catch {
      // fall through
    }
  }

  const seed = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.AUTH_COOKIE_DOMAIN ?? "orgframe-handoff-default-seed";
  return createHash("sha256").update(seed).digest();
}

export type SealedPayload = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
};

export function sealPayload(plaintext: string): SealedPayload {
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export function openPayload(sealed: SealedPayload): string {
  const key = resolveKey();
  const decipher = createDecipheriv(ALGORITHM, key, sealed.iv);
  decipher.setAuthTag(sealed.authTag);
  const plaintext = Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export function generateNonce(): string {
  return randomBytes(32).toString("base64url");
}
