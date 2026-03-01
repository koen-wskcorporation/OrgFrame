import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeHost, getPlatformHosts, shouldSkipCustomDomainRoutingPath } from "@/lib/domains/customDomains";
import { updateSupabaseSessionFromProxy } from "@/lib/supabase/proxy";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

let lookupClient: ReturnType<typeof createClient<any>> | null = null;

function getLookupClient() {
  if (lookupClient) {
    return lookupClient;
  }

  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();

  lookupClient = createClient<any>(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return lookupClient;
}

async function resolveOrgSlugForDomain(host: string) {
  const supabase = getLookupClient();
  const { data, error } = await supabase.rpc("resolve_org_slug_for_domain", {
    target_domain: host
  });

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Custom domain lookup failed:", error.message);
    }

    return null;
  }

  return typeof data === "string" && data.trim().length > 0 ? data.trim() : null;
}

export async function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = normalizeHost(forwardedHost || request.headers.get("host"));
  const platformHosts = getPlatformHosts();

  let rewriteUrl: URL | null = null;

  if (host && !platformHosts.has(host) && !shouldSkipCustomDomainRoutingPath(request.nextUrl.pathname)) {
    const orgSlug = await resolveOrgSlugForDomain(host);

    if (orgSlug) {
      const prefix = `/${orgSlug}`;
      const currentPathname = request.nextUrl.pathname;
      const alreadyOrgPrefixed = currentPathname === prefix || currentPathname.startsWith(`${prefix}/`);

      if (!alreadyOrgPrefixed) {
        rewriteUrl = request.nextUrl.clone();
        rewriteUrl.pathname = currentPathname === "/" ? prefix : `${prefix}${currentPathname}`;
      }
    }
  }

  return updateSupabaseSessionFromProxy(request, {
    rewriteUrl
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|heic|heif|ico)$).*)"]
};
