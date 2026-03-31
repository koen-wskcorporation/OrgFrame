import { buildGetSessionUser, type SessionUser } from "@orgframe/auth";
import { createSupabaseServer } from "@/src/shared/data-api/server";
export type { SessionUser };
export const getSessionUser = buildGetSessionUser(createSupabaseServer);
