import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getOptionalSupabasePublicConfig } from "@/src/shared/supabase/config";
import { isHttpsRequest, normalizeSupabaseCookieOptions, type SupabaseCookieToSet } from "@/src/shared/supabase/cookies";

export async function updateSupabaseSessionFromProxy(request: NextRequest) {
  const response = NextResponse.next({
    request
  });
  const isHttps = isHttpsRequest(request);
  const config = getOptionalSupabasePublicConfig();
  if (!config) {
    return response;
  }
  const { supabaseUrl, supabasePublishableKey } = config;

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
          response.cookies.set(name, value, normalizeSupabaseCookieOptions(options, isHttps));
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
