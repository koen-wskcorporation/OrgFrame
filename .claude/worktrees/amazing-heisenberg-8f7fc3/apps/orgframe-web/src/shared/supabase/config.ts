type SupabasePublicConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

let cachedPublicConfig: SupabasePublicConfig | null = null;

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  if (cachedPublicConfig) {
    return cachedPublicConfig;
  }

  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabasePublishableKey = readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY");

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!supabasePublishableKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.");
  }

  cachedPublicConfig = {
    supabaseUrl,
    supabasePublishableKey
  };

  return cachedPublicConfig;
}
