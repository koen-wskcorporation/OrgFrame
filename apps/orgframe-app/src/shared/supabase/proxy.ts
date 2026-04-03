import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/src/shared/supabase/config";
import { isHttpsRequest, normalizeSupabaseCookieOptions, type SupabaseCookieToSet } from "@/src/shared/supabase/cookies";
import { parseHostWithPort } from "@/src/shared/domains/hostHeaders";

type ProxyResponseOptions = {
  rewriteUrl?: URL | null;
};

export async function updateSupabaseSessionFromProxy(request: NextRequest, options: ProxyResponseOptions = {}) {
  let response = options.rewriteUrl
    ? NextResponse.rewrite(options.rewriteUrl)
    : NextResponse.next({
        request
      });
  const isHttps = isHttpsRequest(request);
  const requestHost = parseHostWithPort(request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host).host;
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
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

  try {
    await supabase.auth.getUser();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Supabase proxy refresh failed:", error);
    }
  }

  return response;
}
