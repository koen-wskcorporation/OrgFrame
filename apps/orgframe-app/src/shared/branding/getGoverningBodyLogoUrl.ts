import { getDataApiPublicConfig } from "@/src/shared/data-api/config";

const GOVERNING_BODY_BUCKET = "governing-body-assets";

export function getGoverningBodyLogoUrl(path: string) {
  const normalizedPath = path.trim().replace(/^\/+/, "");

  if (!normalizedPath) {
    return "";
  }

  const { supabaseUrl } = getDataApiPublicConfig();
  return `${supabaseUrl}/storage/v1/object/public/${GOVERNING_BODY_BUCKET}/${normalizedPath}`;
}
