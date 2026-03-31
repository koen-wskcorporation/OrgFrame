import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { deriveCapabilities } from "@/src/features/ai/context/deriveCapabilities";
import {
  InvalidUserError,
  MembershipNotFoundError,
  OrgNotFoundError,
  OrgSlugNotResolvedError,
  ScopeResolutionError,
  UnauthenticatedError
} from "@/src/features/ai/context/errors";
import { logAIContext } from "@/src/features/ai/context/logger";
import { resolveScope } from "@/src/features/ai/context/resolveScope";
import type { AIContext } from "@/src/features/ai/context/types";
import { listPlayersForPicker } from "@/src/features/players/db/queries";
import { isReservedOrgSlug } from "@/src/shared/org/reservedSlugs";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import { extractOrgSlugFromSubdomain, getTenantBaseHosts, normalizeHost } from "@/src/shared/domains/customDomains";
import type { OrgRole } from "@/src/features/core/access";

const NON_ORG_PATH_SEGMENTS = new Set(["account", "api", "auth", "brand", "forbidden", "x", "_next"]);
const ORG_SEGMENT_PATTERN = /^[a-z0-9-]+$/;

type OrgResolution = {
  orgSlug: string;
  resolvedFrom: AIContext["debug"]["resolvedFrom"]["org"];
};

function getRequestId(req: Request) {
  return req.headers.get("x-request-id")?.trim() || randomUUID();
}

function getRequestUrl(req: Request) {
  try {
    return new URL(req.url);
  } catch {
    throw new ScopeResolutionError("Invalid request URL.");
  }
}

function getRequestHost(req: Request, requestUrl: URL) {
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = req.headers.get("host")?.split(",")[0]?.trim();
  const rawHost = forwarded || hostHeader || requestUrl.host;
  return normalizeHost(rawHost);
}

function resolveOrgFromPath(pathname: string) {
  const firstSegment = pathname.split("/").map((segment) => segment.trim()).filter(Boolean)[0] ?? "";

  if (!firstSegment) {
    return null;
  }

  const normalized = firstSegment.toLowerCase();

  if (NON_ORG_PATH_SEGMENTS.has(normalized) || isReservedOrgSlug(normalized) || !ORG_SEGMENT_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function resolveOrgSlug(req: Request, requestUrl: URL): OrgResolution {
  const host = getRequestHost(req, requestUrl);

  if (host) {
    for (const baseHost of getTenantBaseHosts()) {
      const subdomainSlug = extractOrgSlugFromSubdomain(host, baseHost);
      if (subdomainSlug) {
        return {
          orgSlug: subdomainSlug,
          resolvedFrom: "subdomain"
        };
      }
    }
  }

  const pathnameSlug = resolveOrgFromPath(requestUrl.pathname);
  if (pathnameSlug) {
    return {
      orgSlug: pathnameSlug,
      resolvedFrom: "path"
    };
  }

  const fallbackSlug = requestUrl.searchParams.get("orgSlug")?.trim().toLowerCase();
  if (fallbackSlug && ORG_SEGMENT_PATTERN.test(fallbackSlug) && !isReservedOrgSlug(fallbackSlug)) {
    return {
      orgSlug: fallbackSlug,
      resolvedFrom: "fallback"
    };
  }

  throw new OrgSlugNotResolvedError();
}

function resolveOrgSlugOptional(req: Request, requestUrl: URL): OrgResolution | null {
  try {
    return resolveOrgSlug(req, requestUrl);
  } catch (error) {
    if (error instanceof OrgSlugNotResolvedError) {
      return null;
    }

    throw error;
  }
}

function stripOrgSlugPrefix(pathname: string, orgSlug: string) {
  const prefix = `/${orgSlug}`;

  if (pathname === prefix) {
    return "/";
  }

  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length);
  }

  return pathname;
}

export async function buildAIContext(req: Request): Promise<AIContext> {
  const requestId = getRequestId(req);
  const requestUrl = getRequestUrl(req);
  const pathname = requestUrl.pathname || "/";
  const host = getRequestHost(req, requestUrl);

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    throw new UnauthenticatedError();
  }

  if (!sessionUser.email) {
    throw new InvalidUserError("Authenticated user is missing an email.");
  }

  const orgResolution = resolveOrgSlugOptional(req, requestUrl);
  const supabase = await createSupabaseServer();

  let org: AIContext["org"] = null;
  let membership: AIContext["membership"] = null;
  let permissions: string[] = [];

  if (orgResolution) {
    const { data: resolvedOrg, error: orgError } = await supabase
      .schema("orgs").from("orgs")
      .select("id, slug, name")
      .eq("slug", orgResolution.orgSlug)
      .maybeSingle();

    if (orgError) {
      throw new OrgNotFoundError(`Failed to resolve organization: ${orgError.message}`);
    }

    if (!resolvedOrg?.id || !resolvedOrg.slug || !resolvedOrg.name) {
      throw new OrgNotFoundError();
    }

    org = {
      id: resolvedOrg.id,
      slug: resolvedOrg.slug,
      name: resolvedOrg.name
    };

    const { data: resolvedMembership, error: membershipError } = await supabase
      .schema("orgs").from("org_memberships")
      .select("role")
      .eq("org_id", resolvedOrg.id)
      .eq("user_id", sessionUser.id)
      .maybeSingle();

    if (membershipError) {
      throw new MembershipNotFoundError(`Failed to resolve membership: ${membershipError.message}`);
    }

    if (!resolvedMembership?.role) {
      throw new MembershipNotFoundError();
    }

    membership = {
      role: resolvedMembership.role,
      permissions: []
    };
    permissions = await resolveOrgRolePermissions(supabase, resolvedOrg.id, resolvedMembership.role as OrgRole);
    membership.permissions = permissions;
  }

  const capabilities = deriveCapabilities(permissions);
  const scopedPath = org ? stripOrgSlugPrefix(pathname, org.slug) : pathname;
  const scope = resolveScope(scopedPath);
  const players = await listPlayersForPicker(sessionUser.id).catch(() => []);
  const activePlayerId = requestUrl.searchParams.get("playerId")?.trim() || null;

  logAIContext({
    requestId,
    userId: sessionUser.id,
    orgId: org?.id ?? null,
    module: scope.currentModule ?? "unknown"
  });

  return {
    requestId,
    user: {
      id: sessionUser.id,
      email: sessionUser.email
    },
    org,
    membership,
    account: {
      activePlayerId,
      players
    },
    scope,
    environment: {
      host,
      pathname,
      userAgent: req.headers.get("user-agent") ?? undefined
    },
    capabilities,
    debug: {
      resolvedFrom: {
        org: orgResolution?.resolvedFrom ?? "none",
        user: "session"
      }
    }
  };
}
