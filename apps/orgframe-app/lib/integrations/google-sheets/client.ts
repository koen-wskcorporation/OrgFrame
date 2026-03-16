import { createSign } from "node:crypto";

type GoogleSheetsServiceAccountConfig = {
  clientEmail: string;
  privateKey: string;
};

type GoogleAccessToken = {
  accessToken: string;
  expiresAtUnix: number;
};

type GoogleSheetsAuthMode = "service_account_key" | "gcp_metadata" | "vercel_oidc";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_METADATA_TOKEN_ENDPOINT = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts";
const GOOGLE_STS_TOKEN_ENDPOINT = "https://sts.googleapis.com/v1/token";
const GOOGLE_IAM_CREDENTIALS_ENDPOINT = "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts";
const GOOGLE_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DEFAULT_SCOPES = [GOOGLE_SHEETS_SCOPE, GOOGLE_DRIVE_SCOPE];
const METADATA_TIMEOUT_MS = 4000;

const cachedTokensByKey = new Map<string, GoogleAccessToken>();

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function parsePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function hasServiceAccountKeyConfig(): boolean {
  return Boolean(
    readEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL") &&
      readEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY") &&
      readEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_CLIENT_ID")
  );
}

function hasVercelOidcConfig(): boolean {
  return Boolean(
    readEnv("GCP_PROJECT_NUMBER") &&
      readEnv("GCP_SERVICE_ACCOUNT_EMAIL") &&
      readEnv("GCP_WORKLOAD_IDENTITY_POOL_ID") &&
      readEnv("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID")
  );
}

function getConfiguredAuthMode(): GoogleSheetsAuthMode | null {
  const authMode = readEnv("GOOGLE_SHEETS_AUTH_MODE").toLowerCase();
  if (authMode === "service_account_key") {
    return hasServiceAccountKeyConfig() ? "service_account_key" : null;
  }

  if (authMode === "gcp_metadata") {
    return "gcp_metadata";
  }

  if (authMode === "vercel_oidc") {
    return hasVercelOidcConfig() ? "vercel_oidc" : null;
  }

  if (hasServiceAccountKeyConfig()) {
    return "service_account_key";
  }

  if (hasVercelOidcConfig()) {
    return "vercel_oidc";
  }

  if (parseBoolean(readEnv("GOOGLE_SHEETS_KEYLESS"))) {
    return "gcp_metadata";
  }

  return null;
}

function normalizeScopes(scopes: string[]): string[] {
  return Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean))).sort();
}

function getTokenCacheKey(mode: GoogleSheetsAuthMode, scopes: string[]): string {
  return `${mode}:${scopes.join(" ")}`;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createSignedJwt(config: GoogleSheetsServiceAccountConfig, scopes: string[]): string {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const claims = {
    iss: config.clientEmail,
    scope: scopes.join(" "),
    aud: GOOGLE_TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();

  const signature = signer
    .sign(config.privateKey)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${signingInput}.${signature}`;
}

function getServiceAccountConfig(): GoogleSheetsServiceAccountConfig {
  const clientEmail = readEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL");
  const privateKeyRaw = readEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY");
  const clientId = readEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_CLIENT_ID");

  if (!clientEmail || !privateKeyRaw || !clientId) {
    throw new Error(
      "Google Sheets service account key auth is not configured. Set GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL, GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEETS_SERVICE_ACCOUNT_CLIENT_ID, or use GOOGLE_SHEETS_AUTH_MODE=gcp_metadata/vercel_oidc."
    );
  }

  return {
    clientEmail,
    privateKey: parsePrivateKey(privateKeyRaw)
  };
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

function getVercelWifAudience(): string {
  const projectNumber = requireEnv("GCP_PROJECT_NUMBER");
  const poolId = requireEnv("GCP_WORKLOAD_IDENTITY_POOL_ID");
  const providerId = requireEnv("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");
  return `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
}

async function tryGetRuntimeVercelOidcTokenFromHeaders(): Promise<string | null> {
  try {
    const nextHeadersModule = await import("next/headers");
    const headerStore = await nextHeadersModule.headers();
    const token = headerStore.get("x-vercel-oidc-token")?.trim();
    return token || null;
  } catch {
    return null;
  }
}

async function getVercelOidcSubjectToken(): Promise<string> {
  const headerToken = await tryGetRuntimeVercelOidcTokenFromHeaders();
  if (headerToken) {
    return headerToken;
  }

  const envToken = readEnv("VERCEL_OIDC_TOKEN");
  if (envToken) {
    return envToken;
  }

  throw new Error(
    "Unable to resolve Vercel OIDC subject token. Ensure OIDC federation is enabled in Vercel and this code is running in a Vercel Function context."
  );
}

export function isGoogleSheetsConfigured(): boolean {
  return getConfiguredAuthMode() !== null;
}

async function fetchAccessTokenFromServiceAccountKey(scopes: string[]): Promise<GoogleAccessToken> {
  const now = Math.floor(Date.now() / 1000);
  const config = getServiceAccountConfig();
  const assertion = createSignedJwt(config, scopes);

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to fetch Google OAuth token (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token || typeof payload.expires_in !== "number") {
    throw new Error("Google OAuth token response was invalid.");
  }

  return {
    accessToken: payload.access_token,
    expiresAtUnix: now + payload.expires_in
  };
}

async function fetchAccessTokenFromVercelOidc(scopes: string[]): Promise<GoogleAccessToken> {
  const audience = getVercelWifAudience();
  const serviceAccountEmail = requireEnv("GCP_SERVICE_ACCOUNT_EMAIL");
  const subjectToken = await getVercelOidcSubjectToken();

  const stsResponse = await fetch(GOOGLE_STS_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      subject_token: subjectToken,
      audience,
      scope: GOOGLE_CLOUD_PLATFORM_SCOPE
    })
  });

  if (!stsResponse.ok) {
    const body = await stsResponse.text();
    throw new Error(`Google STS token exchange failed (${stsResponse.status}): ${body}`);
  }

  const stsPayload = (await stsResponse.json()) as {
    access_token?: string;
  };

  if (!stsPayload.access_token) {
    throw new Error("Google STS token response was invalid.");
  }

  const impersonationResponse = await fetch(
    `${GOOGLE_IAM_CREDENTIALS_ENDPOINT}/${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${stsPayload.access_token}`
      },
      body: JSON.stringify({
        scope: scopes
      })
    }
  );

  if (!impersonationResponse.ok) {
    const body = await impersonationResponse.text();
    throw new Error(`Service account impersonation failed (${impersonationResponse.status}): ${body}`);
  }

  const impersonationPayload = (await impersonationResponse.json()) as {
    accessToken?: string;
    expireTime?: string;
  };

  if (!impersonationPayload.accessToken || !impersonationPayload.expireTime) {
    throw new Error("Service account impersonation response was invalid.");
  }

  const expiresAtUnix = Math.floor(new Date(impersonationPayload.expireTime).getTime() / 1000);
  if (!Number.isFinite(expiresAtUnix) || expiresAtUnix <= 0) {
    throw new Error("Service account impersonation expiry was invalid.");
  }

  return {
    accessToken: impersonationPayload.accessToken,
    expiresAtUnix
  };
}

async function fetchAccessTokenFromMetadata(scopes: string[]): Promise<GoogleAccessToken> {
  const serviceAccountSelector = readEnv("GOOGLE_SHEETS_RUNTIME_SERVICE_ACCOUNT_EMAIL") || "default";
  const encodedServiceAccount = encodeURIComponent(serviceAccountSelector);
  const scopedUrl = `${GOOGLE_METADATA_TOKEN_ENDPOINT}/${encodedServiceAccount}/token?scopes=${encodeURIComponent(scopes.join(","))}`;
  const unscopedUrl = `${GOOGLE_METADATA_TOKEN_ENDPOINT}/${encodedServiceAccount}/token`;
  const urls = [scopedUrl, unscopedUrl];
  let lastError = "metadata_token_unavailable";

  for (const url of urls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Metadata-Flavor": "Google"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        lastError = `Metadata token request failed (${response.status}): ${body}`;
        continue;
      }

      const payload = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
      };

      if (!payload.access_token || typeof payload.expires_in !== "number") {
        lastError = "Metadata token response was invalid.";
        continue;
      }

      const now = Math.floor(Date.now() / 1000);
      return {
        accessToken: payload.access_token,
        expiresAtUnix: now + payload.expires_in
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "metadata_request_failed";
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(
    `Unable to fetch Google OAuth token from metadata server. Ensure this runtime has a GCP service account attached with Sheets/Drive access. Last error: ${lastError}`
  );
}

async function getAccessToken(scopes = DEFAULT_SCOPES): Promise<string> {
  const normalizedScopes = normalizeScopes(scopes);
  const mode = getConfiguredAuthMode();

  if (!mode) {
    throw new Error(
      "Google Sheets auth is not configured. Configure one mode: service_account_key, gcp_metadata, or vercel_oidc."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const cacheKey = getTokenCacheKey(mode, normalizedScopes);
  const cached = cachedTokensByKey.get(cacheKey);
  if (cached && cached.expiresAtUnix - 30 > now) {
    return cached.accessToken;
  }

  const nextToken =
    mode === "service_account_key"
      ? await fetchAccessTokenFromServiceAccountKey(normalizedScopes)
      : mode === "gcp_metadata"
        ? await fetchAccessTokenFromMetadata(normalizedScopes)
        : await fetchAccessTokenFromVercelOidc(normalizedScopes);
  cachedTokensByKey.set(cacheKey, nextToken);
  return nextToken.accessToken;
}

async function googleFetch<TResponse>(url: string, init?: RequestInit, scopes?: string[]): Promise<TResponse> {
  const accessToken = await getAccessToken(scopes);
  return googleFetchWithAccessToken(accessToken, url, init);
}

async function googleFetchWithAccessToken<TResponse>(
  accessToken: string,
  url: string,
  init?: RequestInit
): Promise<TResponse> {
  const trimmedAccessToken = accessToken.trim();
  if (!trimmedAccessToken) {
    throw new Error("Google access token was missing.");
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${trimmedAccessToken}`,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google API request failed (${response.status}) ${url}: ${errorText}`);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

export type GoogleSheetMetadata = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheets: Array<{
    properties: {
      sheetId: number;
      title: string;
      hidden?: boolean;
      gridProperties?: {
        rowCount?: number;
        columnCount?: number;
        frozenRowCount?: number;
      };
    };
    protectedRanges?: Array<{ protectedRangeId?: number; description?: string }>;
  }>;
};

export async function createSpreadsheet(input: {
  title: string;
  sheets: Array<{ title: string; hidden?: boolean }>;
}): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  return createSpreadsheetWithAccessToken(await getAccessToken(DEFAULT_SCOPES), input);
}

export async function createSpreadsheetWithAccessToken(
  accessToken: string,
  input: {
    title: string;
    sheets: Array<{ title: string; hidden?: boolean }>;
  }
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const payload = {
    properties: {
      title: input.title
    },
    sheets: input.sheets.map((sheet) => ({
      properties: {
        title: sheet.title,
        hidden: Boolean(sheet.hidden)
      }
    }))
  };

  const response = await googleFetchWithAccessToken<{ spreadsheetId: string; spreadsheetUrl?: string }>(
    accessToken,
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );

  if (!response.spreadsheetId) {
    throw new Error("Google Sheets did not return a spreadsheet id.");
  }

  return {
    spreadsheetId: response.spreadsheetId,
    spreadsheetUrl: response.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${response.spreadsheetId}/edit`
  };
}

export async function shareSpreadsheetWithUser(spreadsheetId: string, email: string): Promise<void> {
  await shareSpreadsheetWithUserAccessToken(await getAccessToken([GOOGLE_DRIVE_SCOPE]), spreadsheetId, email);
}

export async function shareSpreadsheetWithUserAccessToken(
  accessToken: string,
  spreadsheetId: string,
  email: string
): Promise<void> {
  await googleFetchWithAccessToken(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}/permissions?sendNotificationEmail=false`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "user",
        role: "writer",
        emailAddress: email
      })
    }
  );
}

export async function getSpreadsheetMetadata(spreadsheetId: string): Promise<GoogleSheetMetadata> {
  return googleFetch<GoogleSheetMetadata>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount,frozenRowCount)),protectedRanges(protectedRangeId,description))`
  );
}

export async function batchUpdateSpreadsheet(
  spreadsheetId: string,
  requests: Array<Record<string, unknown>>
): Promise<void> {
  if (requests.length === 0) {
    return;
  }

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ requests })
    }
  );
}

export async function getSheetValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const response = await googleFetch<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`
  );

  return response.values ?? [];
}

export async function updateSheetValues(input: {
  spreadsheetId: string;
  range: string;
  values: Array<Array<string | number | boolean>>;
  valueInputOption?: "RAW" | "USER_ENTERED";
}): Promise<void> {
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}?valueInputOption=${encodeURIComponent(
      input.valueInputOption ?? "RAW"
    )}`,
    {
      method: "PUT",
      body: JSON.stringify({
        range: input.range,
        majorDimension: "ROWS",
        values: input.values
      })
    }
  );
}

export async function clearSheetRange(spreadsheetId: string, range: string): Promise<void> {
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`,
    {
      method: "POST",
      body: "{}"
    }
  );
}
