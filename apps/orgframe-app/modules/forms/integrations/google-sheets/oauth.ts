import { createHmac, timingSafeEqual } from "node:crypto";

const GOOGLE_OAUTH_DIALOG_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file"
] as const;

type GoogleSheetsOauthStatePayload = {
  orgSlug: string;
  formId: string;
  userId: string;
  origin: string;
  iat: number;
};

export type GoogleSheetsOauthConfig = {
  clientId: string;
  clientSecret: string;
  stateSecret: string;
  redirectUri: string;
  scopes: string;
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

export function getGoogleSheetsOauthConfig(origin: string): GoogleSheetsOauthConfig {
  const clientId = (process.env.GOOGLE_SHEETS_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_SHEETS_OAUTH_CLIENT_SECRET ?? "").trim();
  const stateSecret = (process.env.GOOGLE_SHEETS_OAUTH_STATE_SECRET ?? clientSecret).trim();
  const redirectUri = (process.env.GOOGLE_SHEETS_OAUTH_REDIRECT_URI ?? `${origin}/api/integrations/google-sheets/oauth/callback`).trim();

  if (!clientId) {
    throw new Error("GOOGLE_SHEETS_OAUTH_CLIENT_ID_NOT_CONFIGURED");
  }
  if (!clientSecret) {
    throw new Error("GOOGLE_SHEETS_OAUTH_CLIENT_SECRET_NOT_CONFIGURED");
  }
  if (!stateSecret) {
    throw new Error("GOOGLE_SHEETS_OAUTH_STATE_SECRET_NOT_CONFIGURED");
  }

  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri,
    scopes: GOOGLE_SHEETS_OAUTH_SCOPES.join(" ")
  };
}

export function createSignedGoogleSheetsOauthState(
  payload: Omit<GoogleSheetsOauthStatePayload, "iat">,
  stateSecret: string
) {
  const signedPayload: GoogleSheetsOauthStatePayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000)
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(signedPayload));
  const signature = hmacSha256Hex(stateSecret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySignedGoogleSheetsOauthState(
  state: string,
  stateSecret: string,
  maxAgeSeconds = 10 * 60
): GoogleSheetsOauthStatePayload {
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

  let payload: GoogleSheetsOauthStatePayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as GoogleSheetsOauthStatePayload;
  } catch {
    throw new Error("INVALID_STATE_PAYLOAD");
  }

  if (!payload.orgSlug || !payload.formId || !payload.userId || !payload.origin || !Number.isFinite(payload.iat)) {
    throw new Error("INVALID_STATE_PAYLOAD");
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - payload.iat) > maxAgeSeconds) {
    throw new Error("STATE_EXPIRED");
  }

  return payload;
}

export function buildGoogleSheetsOauthDialogUrl(config: GoogleSheetsOauthConfig, state: string) {
  const url = new URL(GOOGLE_OAUTH_DIALOG_BASE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  return url;
}

export async function exchangeGoogleSheetsCodeForUserToken(input: {
  config: GoogleSheetsOauthConfig;
  code: string;
}) {
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      redirect_uri: input.config.redirectUri,
      grant_type: "authorization_code"
    })
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "GOOGLE_TOKEN_EXCHANGE_FAILED");
  }

  return {
    accessToken: payload.access_token,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null,
    tokenType: payload.token_type ?? "Bearer",
    scope: payload.scope ?? ""
  };
}
