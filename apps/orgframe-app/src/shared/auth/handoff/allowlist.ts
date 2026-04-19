import { createOptionalSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { getTenantBaseHosts, isReservedSubdomain, normalizeHost } from "@/src/shared/domains/customDomains";

type CacheEntry = { allowed: boolean; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function isPlatformHost(host: string): boolean {
  for (const baseHost of getTenantBaseHosts()) {
    if (host === baseHost) {
      return true;
    }

    if (host.endsWith(`.${baseHost}`)) {
      const slug = host.slice(0, -baseHost.length - 1);
      if (!slug || slug.includes(".") || isReservedSubdomain(slug)) {
        return false;
      }

      return true;
    }
  }

  return false;
}

async function lookupVerifiedCustomDomain(host: string): Promise<boolean> {
  const client = createOptionalSupabaseServiceRoleClient();
  if (!client) {
    return false;
  }

  const { data, error } = await client
    .from("org_custom_domains")
    .select("domain")
    .eq("status", "verified")
    .ilike("domain", host)
    .limit(1)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}

export type AllowedOrigin = {
  origin: string;
  host: string;
  isPlatform: boolean;
};

export async function resolveAllowedReturnOrigin(rawOrigin: string | null | undefined): Promise<AllowedOrigin | null> {
  if (!rawOrigin) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    return null;
  }

  const host = normalizeHost(parsed.hostname);
  if (!host) {
    return null;
  }

  if (isPlatformHost(host)) {
    return { origin: `${parsed.protocol}//${parsed.host}`, host, isPlatform: true };
  }

  const now = Date.now();
  const cached = cache.get(host);
  if (cached && cached.expiresAt > now) {
    if (!cached.allowed) {
      return null;
    }
    return { origin: `${parsed.protocol}//${parsed.host}`, host, isPlatform: false };
  }

  const allowed = await lookupVerifiedCustomDomain(host);
  cache.set(host, { allowed, expiresAt: now + CACHE_TTL_MS });

  if (!allowed) {
    return null;
  }

  return { origin: `${parsed.protocol}//${parsed.host}`, host, isPlatform: false };
}

export async function isReturnOriginAllowed(rawOrigin: string | null | undefined): Promise<boolean> {
  return (await resolveAllowedReturnOrigin(rawOrigin)) !== null;
}
