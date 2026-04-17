import type { NextRequest } from "next/server";
import { updateSupabaseSessionFromProxy } from "@/src/shared/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSupabaseSessionFromProxy(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|heic|heif|ico)$).*)"]
};
