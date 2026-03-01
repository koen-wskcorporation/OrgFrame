import { getSupabasePublicConfig } from "@/lib/supabase/config";

const GOVERNING_BODY_BUCKET = "governing-body-assets";

export function getGoverningBodyLogoUrl(path: string) {
  const normalizedPath = path.trim().replace(/^\/+/, "");

  if (!normalizedPath) {
    return "";
  }

  const { supabaseUrl } = getSupabasePublicConfig();
  return `${supabaseUrl}/storage/v1/object/public/${GOVERNING_BODY_BUCKET}/${normalizedPath}`;
}
