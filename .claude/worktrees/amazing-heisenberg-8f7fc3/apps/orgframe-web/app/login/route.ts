import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/src/shared/supabase/config";
import { isHttpsRequest, normalizeSupabaseCookieOptions, type SupabaseCookieToSet } from "@/src/shared/supabase/cookies";

function getAppOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? process.env.ORGFRAME_APP_ORIGIN ?? "https://orgframe.app";
  return configuredOrigin.replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const appOrigin = getAppOrigin();
  const writableResponse = NextResponse.next();
  const isHttps = isHttpsRequest(request);
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();

  const supabase = createServerClient<any>(supabaseUrl, supabasePublishableKey, {
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
          writableResponse.cookies.set(name, value, normalizeSupabaseCookieOptions(options, isHttps));
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const destination = user ? "/" : "/auth";
  const redirectResponse = NextResponse.redirect(new URL(destination, appOrigin), { status: 307 });
  writableResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}
