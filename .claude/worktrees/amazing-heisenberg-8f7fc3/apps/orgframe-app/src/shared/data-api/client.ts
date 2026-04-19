import { createClient } from "@supabase/supabase-js";
import { getDataApiPublicConfig } from "@/src/shared/data-api/config";

let sharedPublicClient: ReturnType<typeof createClient<any>> | null = null;

export function createDataApiPublicClient() {
  if (sharedPublicClient) {
    return sharedPublicClient;
  }

  const { supabaseUrl, supabasePublishableKey } = getDataApiPublicConfig();

  sharedPublicClient = createClient<any>(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return sharedPublicClient;
}
