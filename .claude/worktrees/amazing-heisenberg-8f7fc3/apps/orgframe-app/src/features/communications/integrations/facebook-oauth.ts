import { createHmac, timingSafeEqual } from "node:crypto";

const FACEBOOK_DIALOG_BASE_URL = "https://www.facebook.com/v22.0/dialog/oauth";
const FACEBOOK_GRAPH_TOKEN_URL = "https://graph.facebook.com/v22.0/oauth/access_token";
const FACEBOOK_GRAPH_ME_ACCOUNTS_URL = "https://graph.facebook.com/v22.0/me/accounts";
const FACEBOOK_SCOPES = ["pages_show_list", "pages_manage_metadata", "pages_messaging"] as const;

type FacebookOauthStatePayload = {
  orgSlug: string;
  userId: string;
  origin: string;
  iat: number;
};

export type FacebookOauthPage = {
  id: string;
  name: string;
  accessToken: string;
};

export type FacebookOauthConfig = {
  appId: string;
  appSecret: string;
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

export function getFacebookOauthConfig(origin: string): FacebookOauthConfig {
  const appId = (process.env.FACEBOOK_APP_ID ?? "").trim();
  const appSecret = (process.env.FACEBOOK_APP_SECRET ?? "").trim();
  const stateSecret = (process.env.FACEBOOK_OAUTH_STATE_SECRET ?? process.env.COMM_CHANNEL_CREDENTIALS_SECRET ?? appSecret).trim();
  const redirectUri = (process.env.FACEBOOK_OAUTH_REDIRECT_URI ?? `${origin}/api/integrations/facebook/oauth/callback`).trim();

  if (!appId) {
    throw new Error("FACEBOOK_APP_ID_NOT_CONFIGURED");
  }
  if (!appSecret) {
    throw new Error("FACEBOOK_APP_SECRET_NOT_CONFIGURED");
  }
  if (!stateSecret) {
    throw new Error("FACEBOOK_OAUTH_STATE_SECRET_NOT_CONFIGURED");
  }

  return {
    appId,
    appSecret,
    stateSecret,
    redirectUri,
    scopes: FACEBOOK_SCOPES.join(",")
  };
}

export function createSignedFacebookOauthState(payload: Omit<FacebookOauthStatePayload, "iat">, stateSecret: string) {
  const signedPayload: FacebookOauthStatePayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000)
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(signedPayload));
  const signature = hmacSha256Hex(stateSecret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySignedFacebookOauthState(state: string, stateSecret: string, maxAgeSeconds = 10 * 60): FacebookOauthStatePayload {
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

  let payload: FacebookOauthStatePayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as FacebookOauthStatePayload;
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

export function buildFacebookOauthDialogUrl(config: FacebookOauthConfig, state: string) {
  const url = new URL(FACEBOOK_DIALOG_BASE_URL);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("display", "popup");
  url.searchParams.set("scope", config.scopes);
  return url;
}

export async function exchangeFacebookCodeForUserToken(input: {
  config: FacebookOauthConfig;
  code: string;
}) {
  const url = new URL(FACEBOOK_GRAPH_TOKEN_URL);
  url.searchParams.set("client_id", input.config.appId);
  url.searchParams.set("client_secret", input.config.appSecret);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("code", input.code);

  const response = await fetch(url, { method: "GET" });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error?.message ?? "FACEBOOK_TOKEN_EXCHANGE_FAILED");
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type ?? "bearer",
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null
  };
}

export async function listFacebookPagesForUserToken(input: {
  userAccessToken: string;
}): Promise<FacebookOauthPage[]> {
  const url = new URL(FACEBOOK_GRAPH_ME_ACCOUNTS_URL);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", input.userAccessToken);

  const response = await fetch(url, { method: "GET" });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "FACEBOOK_PAGES_LOOKUP_FAILED");
  }

  const pages: FacebookOauthPage[] = [];
  for (const row of payload.data ?? []) {
    const id = String(row.id ?? "").trim();
    const name = String(row.name ?? "").trim();
    const accessToken = String(row.access_token ?? "").trim();

    if (!id || !accessToken) {
      continue;
    }

    pages.push({
      id,
      name: name || `Page ${id}`,
      accessToken
    });
  }

  return pages;
}
