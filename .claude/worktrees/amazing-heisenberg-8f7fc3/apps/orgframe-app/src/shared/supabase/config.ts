type SupabasePublicConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

type SupabaseServiceRoleConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

let cachedPublicConfig: SupabasePublicConfig | null = null;
let cachedServiceRoleConfig: SupabaseServiceRoleConfig | null = null;
let legacyServiceRoleKeyWarningShown = false;

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function validateSupabaseUrl(supabaseUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL. Expected https://<project>.supabase.co or http://localhost:54321."
    );
  }

  const isLocal = parsed.protocol === "http:" && parsed.hostname === "localhost" && parsed.port === "54321";
  const isHosted = parsed.protocol === "https:" && (parsed.hostname === "supabase.co" || parsed.hostname.endsWith(".supabase.co"));

  if (!isLocal && !isHosted) {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL. Expected https://<project>.supabase.co or http://localhost:54321."
    );
  }
}

function getSupabasePublishableKey() {
  const publishableKey = readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY");

  if (publishableKey) {
    return publishableKey;
  }

  throw new Error("Missing Supabase publishable key. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.");
}

function getSupabaseServiceRoleKeyOptional() {
  const canonicalKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (canonicalKey) {
    return canonicalKey;
  }

  const legacyKey = readEnv("SUPABASE_SECRET_KEY");

  if (legacyKey) {
    if (!legacyServiceRoleKeyWarningShown) {
      legacyServiceRoleKeyWarningShown = true;
      console.warn("[supabase] SUPABASE_SECRET_KEY is deprecated. Rename it to SUPABASE_SERVICE_ROLE_KEY.");
    }

    return legacyKey;
  }

  return null;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  if (cachedPublicConfig) {
    return cachedPublicConfig;
  }

  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  validateSupabaseUrl(supabaseUrl);

  cachedPublicConfig = {
    supabaseUrl,
    supabasePublishableKey: getSupabasePublishableKey()
  };

  return cachedPublicConfig;
}

export function getSupabaseServiceRoleConfig(): SupabaseServiceRoleConfig {
  if (cachedServiceRoleConfig) {
    return cachedServiceRoleConfig;
  }

  const { supabaseUrl } = getSupabasePublicConfig();
  const serviceRoleKey = getSupabaseServiceRoleKeyOptional();

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  cachedServiceRoleConfig = {
    supabaseUrl,
    serviceRoleKey
  };

  return cachedServiceRoleConfig;
}

export function getOptionalSupabaseServiceRoleConfig(): SupabaseServiceRoleConfig | null {
  const { supabaseUrl } = getSupabasePublicConfig();
  const serviceRoleKey = getSupabaseServiceRoleKeyOptional();

  if (!serviceRoleKey) {
    return null;
  }

  return {
    supabaseUrl,
    serviceRoleKey
  };
}
