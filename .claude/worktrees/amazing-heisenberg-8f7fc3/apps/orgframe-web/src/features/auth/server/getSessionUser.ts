import { buildGetSessionUser, type SessionUser } from "@orgframe/auth";
import { createSupabaseServer } from "@/src/shared/supabase/server";
export type { SessionUser };
export const getSessionUser = buildGetSessionUser(createSupabaseServer);
