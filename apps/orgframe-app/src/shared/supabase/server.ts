import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/src/shared/supabase/config";
import { normalizeSupabaseCookieOptions, type SupabaseCookieToSet } from "@/src/shared/supabase/cookies";
import { parseHostWithPort } from "@/src/shared/domains/hostHeaders";

function isHttpsFromHeaders(headerStore: Headers) {
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();

  if (forwardedProto === "https") {
    return true;
  }

  const origin = headerStore.get("origin");
  return typeof origin === "string" && origin.startsWith("https://");
}

export type SupabaseActorContext = {
  // Tags every PostgREST request so audit triggers and audit.record_event
  // know whether a write was initiated by a user, the AI, or a system task.
  actorKind?: "user" | "ai" | "system";
  onBehalfOfUserId?: string;
  requestId?: string;
  // Tells audit triggers to skip auto-logging — used when the caller is
  // about to record a richer app-level event for the same change.
  skipTriggerAudit?: boolean;
};

function actorContextHeaders(context: SupabaseActorContext | undefined): Record<string, string> {
  if (!context) return {};
  const out: Record<string, string> = {};
  if (context.actorKind) out["x-actor-kind"] = context.actorKind;
  if (context.onBehalfOfUserId) out["x-on-behalf-of"] = context.onBehalfOfUserId;
  if (context.requestId) out["x-request-id"] = context.requestId;
  if (context.skipTriggerAudit) out["x-audit-skip"] = "true";
  return out;
}

export async function createSupabaseServer(actorContext?: SupabaseActorContext) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const isHttps = isHttpsFromHeaders(headerStore);
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const hostHeader = headerStore.get("host")?.split(",")[0]?.trim() ?? "";
  const requestHost = parseHostWithPort(forwardedHost || hostHeader).host;
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();
  const extraHeaders = actorContextHeaders(actorContext);

  return createServerClient<any>(supabaseUrl, supabasePublishableKey, {
    ...(Object.keys(extraHeaders).length > 0 ? { global: { headers: extraHeaders } } : {}),
    cookieOptions: {
      path: "/",
      sameSite: "lax"
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: SupabaseCookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, normalizeSupabaseCookieOptions(options, isHttps, requestHost));
          });
        } catch {
          // Server Components can read cookies but cannot always mutate them.
          // Middleware handles refresh writes in those cases.
        }
      }
    }
  });
}

export function createSupabaseServerForRequest(request: NextRequest, response: NextResponse) {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const isHttps = forwardedProto === "https" || request.nextUrl.protocol === "https:";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  const requestHost = parseHostWithPort(forwardedHost || hostHeader || request.nextUrl.host).host;

  return createServerClient<any>(supabaseUrl, supabasePublishableKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax"
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, normalizeSupabaseCookieOptions(options, isHttps, requestHost));
        });
      }
    }
  });
}

export const createSupabaseServerClient = createSupabaseServer;
