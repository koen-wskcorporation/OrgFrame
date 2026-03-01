import "server-only";

import { createSupabaseServer } from "@/lib/supabase/server";

export async function getSignedProfileAvatarUrl(path: string, expiresInSeconds = 60 * 10) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.storage.from("account-assets").createSignedUrl(path, expiresInSeconds);

  if (error) {
    return null;
  }

  return data.signedUrl;
}
