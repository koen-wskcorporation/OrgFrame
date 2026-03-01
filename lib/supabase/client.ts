"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

let browserClient: ReturnType<typeof createBrowserClient<any>> | null = null;

export function createSupabaseBrowser() {
  if (!browserClient) {
    const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();

    browserClient = createBrowserClient<any>(supabaseUrl, supabasePublishableKey, {
      cookieOptions: {
        path: "/",
        sameSite: "lax"
      }
    });
  }

  return browserClient;
}

export const createSupabaseBrowserClient = createSupabaseBrowser;
