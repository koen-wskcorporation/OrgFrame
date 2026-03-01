import { createClient } from "@supabase/supabase-js";
import { getOptionalSupabaseServiceRoleConfig, getSupabaseServiceRoleConfig } from "@/lib/supabase/config";

let serviceRoleClient: ReturnType<typeof createClient<any>> | null = null;

function createClientWithServiceKey(supabaseUrl: string, serviceKey: string) {
  return createClient<any>(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function createSupabaseServiceRoleClient() {
  if (!serviceRoleClient) {
    const { supabaseUrl, serviceRoleKey } = getSupabaseServiceRoleConfig();

    serviceRoleClient = createClientWithServiceKey(supabaseUrl, serviceRoleKey);
  }

  return serviceRoleClient;
}

export function createOptionalSupabaseServiceRoleClient() {
  const config = getOptionalSupabaseServiceRoleConfig();

  if (!config) {
    return null;
  }

  return createClientWithServiceKey(config.supabaseUrl, config.serviceRoleKey);
}
