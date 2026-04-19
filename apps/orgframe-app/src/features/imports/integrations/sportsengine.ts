import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ImportProfileKey } from "@/src/features/imports/contracts";

const SPORTSENGINE_OAUTH_DIALOG_BASE_URL = "https://user.sportngin.com/oauth/authorize";
const SPORTSENGINE_OAUTH_TOKEN_URL = "https://user.sportngin.com/oauth/token";

type SportsEngineOauthStatePayload = {
  orgSlug: string;
  userId: string;
  origin: string;
  iat: number;
};

export type SportsEngineOauthConfig = {
  clientId: string;
  clientSecret: string;
  stateSecret: string;
  redirectUri: string;
  scopes: string;
  apiBaseUrl: string;
  rosterEndpoint: string;
  programsEndpoint: string;
};

type SportsEngineTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function hmacSha256Hex(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function normalizePath(pathname: string) {
  const trimmed = pathname.trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function getSportsEngineOauthConfig(origin: string): SportsEngineOauthConfig {
  const clientId = (process.env.SPORTSENGINE_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.SPORTSENGINE_OAUTH_CLIENT_SECRET ?? "").trim();
  const stateSecret = (process.env.SPORTSENGINE_OAUTH_STATE_SECRET ?? clientSecret).trim();
  const redirectUri = (process.env.SPORTSENGINE_OAUTH_REDIRECT_URI ?? `${origin}/api/integrations/sportsengine/oauth/callback`).trim();
  const scopes = (process.env.SPORTSENGINE_OAUTH_SCOPES ?? "read").trim();
  const apiBaseUrl = (process.env.SPORTSENGINE_API_BASE_URL ?? "https://api.sportngin.com").trim();
  const rosterEndpoint = normalizePath(process.env.SPORTSENGINE_ROSTER_ENDPOINT ?? "/v1/rosters");
  const programsEndpoint = normalizePath(process.env.SPORTSENGINE_PROGRAMS_ENDPOINT ?? "/v1/programs");

  if (!clientId) {
    throw new Error("SPORTSENGINE_OAUTH_CLIENT_ID_NOT_CONFIGURED");
  }
  if (!clientSecret) {
    throw new Error("SPORTSENGINE_OAUTH_CLIENT_SECRET_NOT_CONFIGURED");
  }
  if (!stateSecret) {
    throw new Error("SPORTSENGINE_OAUTH_STATE_SECRET_NOT_CONFIGURED");
  }

  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri,
    scopes,
    apiBaseUrl,
    rosterEndpoint,
    programsEndpoint
  };
}

export function createSignedSportsEngineOauthState(
  payload: Omit<SportsEngineOauthStatePayload, "iat">,
  stateSecret: string
) {
  const signedPayload: SportsEngineOauthStatePayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000)
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(signedPayload));
  const signature = hmacSha256Hex(stateSecret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySignedSportsEngineOauthState(
  state: string,
  stateSecret: string,
  maxAgeSeconds = 10 * 60
): SportsEngineOauthStatePayload {
  const [encodedPayload, providedSignature] = state.split(".");
  if (!encodedPayload || !providedSignature) {
    throw new Error("INVALID_STATE");
  }

  const expectedSignature = hmacSha256Hex(stateSecret, encodedPayload);
  if (providedSignature.length !== expectedSignature.length) {
    throw new Error("INVALID_STATE_SIGNATURE");
  }
  if (!timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
    throw new Error("INVALID_STATE_SIGNATURE");
  }

  let payload: SportsEngineOauthStatePayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as SportsEngineOauthStatePayload;
  } catch {
    throw new Error("INVALID_STATE_PAYLOAD");
  }

  if (!payload.orgSlug || !payload.userId || !payload.origin || !Number.isFinite(payload.iat)) {
    throw new Error("INVALID_STATE_PAYLOAD");
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - payload.iat) > maxAgeSeconds) {
    throw new Error("STATE_EXPIRED");
  }

  return payload;
}

export function buildSportsEngineOauthDialogUrl(config: SportsEngineOauthConfig, state: string) {
  const url = new URL(SPORTSENGINE_OAUTH_DIALOG_BASE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", state);
  return url;
}

async function exchangeToken(requestBody: URLSearchParams) {
  const response = await fetch(SPORTSENGINE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: requestBody
  });

  const payload = (await response.json().catch(() => ({}))) as SportsEngineTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "SPORTSENGINE_TOKEN_EXCHANGE_FAILED");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    tokenType: payload.token_type ?? "Bearer",
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null,
    scope: payload.scope ?? ""
  };
}

export async function exchangeSportsEngineCodeForToken(input: {
  config: SportsEngineOauthConfig;
  code: string;
}) {
  return exchangeToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      redirect_uri: input.config.redirectUri
    })
  );
}

export async function refreshSportsEngineToken(input: {
  config: SportsEngineOauthConfig;
  refreshToken: string;
}) {
  return exchangeToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret
    })
  );
}

function getRawSecret() {
  const keys = ["SPORTSENGINE_CREDENTIALS_SECRET", "COMM_CHANNEL_CREDENTIALS_SECRET"] as const;
  for (const key of keys) {
    const value = (process.env[key] ?? "").trim();
    if (value) {
      return value;
    }
  }
  throw new Error("Missing SportsEngine credentials secret. Set SPORTSENGINE_CREDENTIALS_SECRET.");
}

function getEncryptionKey() {
  const rawSecret = getRawSecret();
  return createHash("sha256").update(rawSecret).digest();
}

export function encryptSportsEngineToken(value: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  });
}

export function decryptSportsEngineToken(encrypted: string) {
  let payload: { alg: string; iv: string; tag: string; data: string };
  try {
    payload = JSON.parse(encrypted) as { alg: string; iv: string; tag: string; data: string };
  } catch {
    throw new Error("Invalid encrypted SportsEngine token payload.");
  }

  if (payload.alg !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted SportsEngine token payload.");
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function pickFirst(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringifyValue(input[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeSportsEnginePeople(items: Array<Record<string, unknown>>) {
  return items.map((item) => ({
    display_name: pickFirst(item, ["display_name", "full_name", "name", "player_name"]),
    user_email: pickFirst(item, ["user_email", "email", "guardian_email", "parent_email"]),
    jersey_number: pickFirst(item, ["jersey_number", "jersey", "number"]),
    phone: pickFirst(item, ["phone", "phone_number", "mobile"]),
    birth_date: pickFirst(item, ["birth_date", "dob", "date_of_birth"]),
    team_name: pickFirst(item, ["team_name", "team", "team_title"])
  }));
}

function normalizeSportsEnginePrograms(items: Array<Record<string, unknown>>) {
  return items.map((item) => ({
    program_name: pickFirst(item, ["program_name", "program", "program_title"]),
    division_name: pickFirst(item, ["division_name", "division"]),
    team_name: pickFirst(item, ["team_name", "team"]),
    age_group: pickFirst(item, ["age_group", "age", "age_bracket"]),
    season_label: pickFirst(item, ["season_label", "season"]),
    status: pickFirst(item, ["status", "state"])
  }));
}

export async function fetchSportsEngineDataset(input: {
  config: SportsEngineOauthConfig;
  accessToken: string;
  profileKey: ImportProfileKey;
}): Promise<Array<Record<string, unknown>>> {
  const endpoint = input.profileKey === "program_structure" ? input.config.programsEndpoint : input.config.rosterEndpoint;
  const url = new URL(endpoint, input.config.apiBaseUrl);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(stringifyValue(payload.error_description) || stringifyValue(payload.error) || "SPORTSENGINE_FETCH_FAILED");
  }

  const rawItems = Array.isArray(payload.items)
    ? (payload.items as Array<Record<string, unknown>>)
    : Array.isArray(payload.data)
      ? (payload.data as Array<Record<string, unknown>>)
      : Array.isArray(payload.results)
        ? (payload.results as Array<Record<string, unknown>>)
        : [];

  if (input.profileKey === "program_structure") {
    return normalizeSportsEnginePrograms(rawItems);
  }
  return normalizeSportsEnginePeople(rawItems);
}
