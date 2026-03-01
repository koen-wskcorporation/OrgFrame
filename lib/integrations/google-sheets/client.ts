import { createSign } from "node:crypto";

type GoogleSheetsServiceAccountConfig = {
  clientEmail: string;
  privateKey: string;
  clientId: string;
};

type GoogleAccessToken = {
  accessToken: string;
  expiresAtUnix: number;
};

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DEFAULT_SCOPES = [GOOGLE_SHEETS_SCOPE, GOOGLE_DRIVE_SCOPE];

let cachedToken: GoogleAccessToken | null = null;

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function parsePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
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
      "Google Sheets service account is not configured. Set GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL, GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEETS_SERVICE_ACCOUNT_CLIENT_ID."
    );
  }

  return {
    clientEmail,
    privateKey: parsePrivateKey(privateKeyRaw),
    clientId
  };
}

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    readEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL") &&
      readEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY") &&
      readEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_CLIENT_ID")
  );
}

async function getAccessToken(scopes = DEFAULT_SCOPES): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAtUnix - 30 > now) {
    return cachedToken.accessToken;
  }

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

  cachedToken = {
    accessToken: payload.access_token,
    expiresAtUnix: now + payload.expires_in
  };

  return payload.access_token;
}

async function googleFetch<TResponse>(url: string, init?: RequestInit, scopes?: string[]): Promise<TResponse> {
  const accessToken = await getAccessToken(scopes);

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
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

  const response = await googleFetch<{ spreadsheetId: string; spreadsheetUrl?: string }>(
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
  await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}/permissions?sendNotificationEmail=true`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "user",
        role: "writer",
        emailAddress: email
      })
    },
    [GOOGLE_DRIVE_SCOPE]
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
