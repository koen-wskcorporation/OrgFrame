import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCanonicalAuthHost, normalizeHost } from "@/src/shared/domains/customDomains";

function resolveProtocol(headerStore: Headers): "http" | "https" {
  const forwarded = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "http" || forwarded === "https") {
    return forwarded;
  }
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

function isLocalDevHost(host: string): boolean {
  // Only treat true loopback hostnames as dev. Custom dev TLDs like
  // `orgframe.test` are real names in the user's hosts file and resolve to
  // genuine subdomains (`auth.orgframe.test`), so they must do the cross-host
  // redirect like production would.
  if (!host) return true;
  if (host === "localhost" || host.startsWith("127.") || host === "0.0.0.0") return true;
  return !host.includes(".");
}

/**
 * Redirect the user to the auth page on the canonical auth host (e.g.
 * `auth.orgframe.app/`). Eliminates the previous marketing-site bounce and
 * keeps the URL bar at root — the middleware rewrites `/` → `/auth/page.tsx`
 * on the canonical host.
 *
 * - On the canonical auth host: redirect to root (clean URL).
 * - On any other recognised platform host: cross-origin redirect to the
 *   canonical auth host root.
 * - On localhost / dev hosts: fall back to the local `/auth` route since the
 *   middleware rewrite only fires on the canonical host.
 */
export async function redirectToAuth(nextPath?: string): Promise<never> {
  const headerStore = await headers();
  const protocol = resolveProtocol(headerStore);
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = headerStore.get("host")?.split(",")[0]?.trim() ?? "";
  const currentHost = normalizeHost(forwardedHost || hostHeader);
  const canonicalHost = normalizeHost(getCanonicalAuthHost());

  const trimmedNext = typeof nextPath === "string" ? nextPath.trim() : "";
  const search = trimmedNext && trimmedNext !== "/" ? `?next=${encodeURIComponent(trimmedNext)}` : "";

  if (!canonicalHost || currentHost === canonicalHost) {
    redirect(`/${search}`);
  }

  if (isLocalDevHost(currentHost)) {
    redirect(`/auth${search}`);
  }

  // Preserve the current request port so dev (e.g. `orgframe.test:3000` →
  // `auth.orgframe.test:3000`) doesn't collapse to the default 80/443.
  const portIdx = hostHeader.indexOf(":");
  const port = portIdx >= 0 ? hostHeader.slice(portIdx) : "";
  redirect(`${protocol}://${canonicalHost}${port}/${search}`);
}
