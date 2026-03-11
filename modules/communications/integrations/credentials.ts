import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const KEY_ENV_NAMES = ["COMM_CHANNEL_CREDENTIALS_SECRET", "INBOX_CHANNEL_CREDENTIALS_SECRET"] as const;

type EncryptedTokenPayload = {
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

function getRawSecret() {
  for (const envName of KEY_ENV_NAMES) {
    const value = (process.env[envName] ?? "").trim();
    if (value) {
      return value;
    }
  }

  throw new Error("Missing channel credentials secret. Set COMM_CHANNEL_CREDENTIALS_SECRET.");
}

function getEncryptionKey() {
  const rawSecret = getRawSecret();
  return createHash("sha256").update(rawSecret).digest();
}

export function maskToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const tail = trimmed.slice(-4);
  return `****${tail}`;
}

export function encryptAccessToken(accessToken: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload: EncryptedTokenPayload = {
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };

  return JSON.stringify(payload);
}

export function decryptAccessToken(encrypted: string) {
  let payload: EncryptedTokenPayload;
  try {
    payload = JSON.parse(encrypted) as EncryptedTokenPayload;
  } catch {
    throw new Error("Invalid encrypted access token payload.");
  }

  if (payload.alg !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted access token payload.");
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  const decrypted = Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
