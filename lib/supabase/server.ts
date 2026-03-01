import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { normalizeSupabaseCookieOptions, type SupabaseCookieToSet } from "@/lib/supabase/cookies";

function isHttpsFromHeaders(headerStore: Headers) {
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();

  if (forwardedProto === "https") {
    return true;
  }

  const origin = headerStore.get("origin");
  return typeof origin === "string" && origin.startsWith("https://");
}

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const isHttps = isHttpsFromHeaders(headerStore);
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();

  return createServerClient<any>(supabaseUrl, supabasePublishableKey, {
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
            cookieStore.set(name, value, normalizeSupabaseCookieOptions(options, isHttps));
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
          response.cookies.set(name, value, normalizeSupabaseCookieOptions(options, isHttps));
        });
      }
    }
  });
}

export const createSupabaseServerClient = createSupabaseServer;
