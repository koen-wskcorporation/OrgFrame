import type { NextRequest } from "next/server";
import { updateSupabaseSessionFromProxy as updateRawSupabaseSessionFromProxy } from "@/src/shared/supabase/proxy";

export async function updateDataApiSessionFromProxy(
  request: NextRequest,
  options?: {
    rewriteUrl?: URL | null;
  }
) {
  return updateRawSupabaseSessionFromProxy(request, options);
}

// Backward-compatible alias used during migration.
export const updateSupabaseSessionFromProxy = updateDataApiSessionFromProxy;
