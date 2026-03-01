import { cache } from "react";
import { createSupabaseServer } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string | null;
};

const getSessionUserCached = cache(async (): Promise<SessionUser | null> => {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email ?? null
    };
  } catch {
    return null;
  }
});

export async function getSessionUser(): Promise<SessionUser | null> {
  return getSessionUserCached();
}
