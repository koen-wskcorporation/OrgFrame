import { normalizeDomain } from "@/src/shared/domains/customDomains";

type VercelVerificationChallenge = {
  type: string;
  domain: string;
  value: string;
  reason?: string;
};

type VercelProjectDomainResponse = {
  verified?: boolean;
  verification?: VercelVerificationChallenge[];
};

type AttachResult =
  | { ok: true; verified: boolean; verification: VercelVerificationChallenge[] }
  | {
      ok: false;
      reason: "not_configured" | "api_error";
      message: string;
    };

export type VercelDnsInstruction = {
  type: string;
  host: string;
  value: string;
  reason: string | null;
};

type DnsInstructionsResult =
  | {
      ok: true;
      verified: boolean;
      records: VercelDnsInstruction[];
    }
  | {
      ok: false;
      reason: "not_configured" | "api_error";
      message: string;
    };

export type VercelDomainDebugInfo = {
  domain: string;
  configured: {
    hasToken: boolean;
    tokenPreview: string | null;
    projectIdOrName: string | null;
    teamId: string | null;
    teamSlug: string | null;
  };
  request: {
    url: string | null;
  };
  response: {
    ok: boolean;
    status: number | null;
    verified: boolean | null;
    verificationCount: number | null;
    rawPayload: string | null;
    error: string | null;
  };
};

type VerifyResult =
  | {
      ok: true;
      verified: boolean;
      message: string;
      records: VercelDnsInstruction[];
    }
  | {
      ok: false;
      reason: "not_configured" | "api_error";
      message: string;
    };

function getEnv(name: string) {
  return (process.env[name] ?? "").trim();
}

function buildProjectDomainsUrl(projectIdOrName: string) {
  const encodedProject = encodeURIComponent(projectIdOrName);
  const url = new URL(`https://api.vercel.com/v10/projects/${encodedProject}/domains`);
  const teamId = getEnv("VERCEL_TEAM_ID");
  const teamSlug = getEnv("VERCEL_TEAM_SLUG");

  if (teamId) {
    url.searchParams.set("teamId", teamId);
  } else if (teamSlug) {
    url.searchParams.set("slug", teamSlug);
  }

  return url.toString();
}

function buildProjectDomainUrl(projectIdOrName: string, domain: string) {
  const encodedProject = encodeURIComponent(projectIdOrName);
  const encodedDomain = encodeURIComponent(domain);
  const url = new URL(`https://api.vercel.com/v9/projects/${encodedProject}/domains/${encodedDomain}`);
  const teamId = getEnv("VERCEL_TEAM_ID");
  const teamSlug = getEnv("VERCEL_TEAM_SLUG");

  if (teamId) {
    url.searchParams.set("teamId", teamId);
  } else if (teamSlug) {
    url.searchParams.set("slug", teamSlug);
  }

  return url.toString();
}

function buildProjectDomainVerifyUrl(projectIdOrName: string, domain: string) {
  return `${buildProjectDomainUrl(projectIdOrName, domain)}/verify`;
}

function parseApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Vercel API returned an unknown error.";
  }

  const maybeError = "error" in payload ? payload.error : null;
  if (!maybeError || typeof maybeError !== "object") {
    return "Vercel API returned an unknown error.";
  }

  const message = "message" in maybeError ? maybeError.message : null;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : "Vercel API returned an unknown error.";
}

function toDnsInstructions(challenges: VercelVerificationChallenge[] | undefined): VercelDnsInstruction[] {
  if (!Array.isArray(challenges)) {
    return [];
  }

  return challenges
    .filter((item) => item && typeof item.type === "string" && typeof item.domain === "string" && typeof item.value === "string")
    .map((item) => ({
      type: item.type.toUpperCase(),
      host: item.domain,
      value: item.value,
      reason: typeof item.reason === "string" && item.reason.trim() ? item.reason.trim() : null
    }));
}

function getVercelProjectConfig() {
  const token = getEnv("VERCEL_API_TOKEN");
  const projectIdOrName = getEnv("VERCEL_PROJECT_ID") || getEnv("VERCEL_PROJECT_NAME");
  return {
    token,
    projectIdOrName
  };
}

function maskToken(token: string) {
  if (!token) {
    return null;
  }

  if (token.length <= 8) {
    return "*".repeat(token.length);
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export async function attachDomainToVercelProject(domain: string): Promise<AttachResult> {
  const normalizedDomain = normalizeDomain(domain);
  const { token, projectIdOrName } = getVercelProjectConfig();

  if (!normalizedDomain) {
    return {
      ok: false,
      reason: "api_error",
      message: "Domain is empty."
    };
  }

  if (!token || !projectIdOrName) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "Automatic domain connection is not configured. Set VERCEL_API_TOKEN and VERCEL_PROJECT_ID (or VERCEL_PROJECT_NAME)."
    };
  }

  try {
    const response = await fetch(buildProjectDomainsUrl(projectIdOrName), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: normalizedDomain }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as VercelProjectDomainResponse | null;
      return {
        ok: true,
        verified: Boolean(payload?.verified),
        verification: Array.isArray(payload?.verification) ? payload.verification : []
      };
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    const apiMessage = parseApiError(payload);

    if (response.status === 400 && apiMessage.toLowerCase().includes("already exists")) {
      const existing = await getVercelDomainDnsInstructions(normalizedDomain);
      if (existing.ok) {
        return {
          ok: true,
          verified: existing.verified,
          verification: existing.records.map((record) => ({
            type: record.type,
            domain: record.host,
            value: record.value,
            reason: record.reason ?? undefined
          }))
        };
      }
    }

    if (response.status === 409) {
      return {
        ok: false,
        reason: "api_error",
        message:
          "This domain is already connected in Vercel. Remove it from the other project/team first, then try again."
      };
    }

    return {
      ok: false,
      reason: "api_error",
      message: `Unable to attach domain in Vercel: ${apiMessage}`
    };
  } catch {
    return {
      ok: false,
      reason: "api_error",
      message: "Unable to reach Vercel API to attach domain. Try again in a minute."
    };
  }
}

type DetachResult =
  | { ok: true; alreadyMissing: boolean }
  | { ok: false; reason: "not_configured" | "api_error"; message: string };

export async function detachDomainFromVercelProject(domain: string): Promise<DetachResult> {
  const normalizedDomain = normalizeDomain(domain);
  const { token, projectIdOrName } = getVercelProjectConfig();

  if (!normalizedDomain) {
    return { ok: false, reason: "api_error", message: "Domain is empty." };
  }

  if (!token || !projectIdOrName) {
    return {
      ok: false,
      reason: "not_configured",
      message: "VERCEL_API_TOKEN and VERCEL_PROJECT_ID (or VERCEL_PROJECT_NAME) must be set to detach domains."
    };
  }

  try {
    const response = await fetch(buildProjectDomainUrl(projectIdOrName, normalizedDomain), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      return { ok: true, alreadyMissing: false };
    }

    // 404 means the domain wasn't attached to this project — treat as success
    // so removing-an-already-removed domain is idempotent and never blocks the
    // database cleanup.
    if (response.status === 404) {
      return { ok: true, alreadyMissing: true };
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    return {
      ok: false,
      reason: "api_error",
      message: `Unable to detach domain in Vercel: ${parseApiError(payload)}`
    };
  } catch {
    return {
      ok: false,
      reason: "api_error",
      message: "Unable to reach Vercel API to detach domain. Try again in a minute."
    };
  }
}

export async function getVercelDomainDnsInstructions(domain: string): Promise<DnsInstructionsResult> {
  const normalizedDomain = normalizeDomain(domain);
  const { token, projectIdOrName } = getVercelProjectConfig();

  if (!normalizedDomain) {
    return {
      ok: false,
      reason: "api_error",
      message: "Domain is empty."
    };
  }

  if (!token || !projectIdOrName) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Automatic Vercel DNS instructions are not configured. Missing VERCEL_API_TOKEN and/or VERCEL_PROJECT_ID."
    };
  }

  try {
    const response = await fetch(buildProjectDomainUrl(projectIdOrName, normalizedDomain), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });

    const payload = (await response.json().catch(() => null)) as VercelProjectDomainResponse | unknown;

    if (!response.ok) {
      return {
        ok: false,
        reason: "api_error",
        message: parseApiError(payload)
      };
    }

    const data = payload as VercelProjectDomainResponse;
    return {
      ok: true,
      verified: Boolean(data.verified),
      records: toDnsInstructions(data.verification)
    };
  } catch {
    return {
      ok: false,
      reason: "api_error",
      message: "Unable to fetch DNS instructions from Vercel."
    };
  }
}

export async function verifyDomainOnVercel(domain: string): Promise<VerifyResult> {
  const normalizedDomain = normalizeDomain(domain);
  const { token, projectIdOrName } = getVercelProjectConfig();

  if (!normalizedDomain) {
    return {
      ok: false,
      reason: "api_error",
      message: "Domain is empty."
    };
  }

  if (!token || !projectIdOrName) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Automatic Vercel verification is not configured."
    };
  }

  try {
    const response = await fetch(buildProjectDomainVerifyUrl(projectIdOrName, normalizedDomain), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });

    const payload = (await response.json().catch(() => null)) as VercelProjectDomainResponse | unknown;

    if (!response.ok) {
      return {
        ok: false,
        reason: "api_error",
        message: parseApiError(payload)
      };
    }

    const data = payload as VercelProjectDomainResponse;
    const records = toDnsInstructions(data.verification);

    if (data.verified) {
      return {
        ok: true,
        verified: true,
        message: "Domain verified successfully in Vercel.",
        records
      };
    }

    const first = records[0];
    const message = first
      ? `Add ${first.type} record: ${first.host} -> ${first.value}${first.reason ? ` (${first.reason})` : ""}`
      : "Domain is not verified in Vercel yet. Check required DNS records and try again.";

    return {
      ok: true,
      verified: false,
      message,
      records
    };
  } catch {
    return {
      ok: false,
      reason: "api_error",
      message: "Unable to reach Vercel verification API."
    };
  }
}

export async function getVercelDomainDebugInfo(domain: string): Promise<VercelDomainDebugInfo> {
  const normalizedDomain = normalizeDomain(domain);
  const token = getEnv("VERCEL_API_TOKEN");
  const projectIdOrName = getEnv("VERCEL_PROJECT_ID") || getEnv("VERCEL_PROJECT_NAME");
  const teamId = getEnv("VERCEL_TEAM_ID");
  const teamSlug = getEnv("VERCEL_TEAM_SLUG");

  const configured = {
    hasToken: Boolean(token),
    tokenPreview: maskToken(token),
    projectIdOrName: projectIdOrName || null,
    teamId: teamId || null,
    teamSlug: teamSlug || null
  };

  if (!normalizedDomain || !token || !projectIdOrName) {
    return {
      domain: normalizedDomain,
      configured,
      request: {
        url: null
      },
      response: {
        ok: false,
        status: null,
        verified: null,
        verificationCount: null,
        rawPayload: null,
        error: "Missing Vercel config for debug request."
      }
    };
  }

  const url = buildProjectDomainUrl(projectIdOrName, normalizedDomain);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });

    const payload = (await response.json().catch(() => null)) as VercelProjectDomainResponse | unknown;
    const rawPayload = payload ? JSON.stringify(payload, null, 2) : null;
    const data = payload as VercelProjectDomainResponse;

    return {
      domain: normalizedDomain,
      configured,
      request: { url },
      response: {
        ok: response.ok,
        status: response.status,
        verified: typeof data?.verified === "boolean" ? data.verified : null,
        verificationCount: Array.isArray(data?.verification) ? data.verification.length : null,
        rawPayload,
        error: response.ok ? null : parseApiError(payload)
      }
    };
  } catch (error) {
    return {
      domain: normalizedDomain,
      configured,
      request: { url },
      response: {
        ok: false,
        status: null,
        verified: null,
        verificationCount: null,
        rawPayload: null,
        error: error instanceof Error ? error.message : "Unknown debug request error."
      }
    };
  }
}
