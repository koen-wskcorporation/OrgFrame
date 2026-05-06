import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getCanonicalAuthHost,
  getPlatformHost,
  normalizeHost
} from "@/src/shared/domains/customDomains";

function resolveProtocol(headerStore: Headers): "http" | "https" {
  const forwarded = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "http" || forwarded === "https") {
    return forwarded;
  }
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

function getPort(hostHeader: string): string {
  const idx = hostHeader.indexOf(":");
  return idx >= 0 ? hostHeader.slice(idx) : "";
}

// Hosts we never cross-origin redirect to/from. Mirrors the same set in
// redirectToAuth.ts so preview deploys (`*.vercel.app`) and localhost stay
// same-origin and don't hit production deployment-protection walls.
function isEphemeralHost(host: string): boolean {
  if (!host) return true;
  if (host === "localhost" || host.startsWith("127.") || host === "0.0.0.0") return true;
  if (host.endsWith(".vercel.app")) return true;
  return !host.includes(".");
}

/**
 * After a successful sign-in / signup, redirect the user away from the
 * auth-host root to wherever they were going. If we're on the canonical
 * auth host (e.g. `auth.orgframe.app`), we MUST cross-origin to the
 * platform host or the rewrite middleware will route the redirect target
 * back to the auth page and we'll loop forever. On non-canonical hosts
 * (custom domains, localhost) a same-origin redirect is correct.
 */
export async function redirectAfterAuth(nextPath: string): Promise<never> {
  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = headerStore.get("host")?.split(",")[0]?.trim() ?? "";
  const currentHost = normalizeHost(forwardedHost || hostHeader);
  const canonicalHost = normalizeHost(getCanonicalAuthHost());
  const platformHost = normalizeHost(getPlatformHost());

  const trimmed = typeof nextPath === "string" && nextPath.trim().startsWith("/") ? nextPath.trim() : "/";

  // Off the canonical auth host (or no canonical configured) — same-origin
  // redirect is fine. The middleware only rewrites `/` → `/auth` on the
  // canonical host. Same applies to ephemeral preview / dev hosts where the
  // canonical host doesn't exist or doesn't accept us.
  if (!canonicalHost || currentHost !== canonicalHost || isEphemeralHost(currentHost)) {
    redirect(trimmed);
  }

  // On the canonical auth host: cross-origin to the platform host so we
  // don't bounce back through the middleware rewrite.
  const protocol = resolveProtocol(headerStore);
  const port = getPort(hostHeader);
  const targetHost = platformHost && platformHost !== canonicalHost ? platformHost : canonicalHost;
  redirect(`${protocol}://${targetHost}${port}${trimmed}`);
}
