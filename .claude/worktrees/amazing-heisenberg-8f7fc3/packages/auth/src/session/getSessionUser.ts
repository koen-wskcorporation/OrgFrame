import { cache } from "react";
import type { SessionUser } from "../types/session";

type SupabaseLikeAuthUser = {
  id: string;
  email?: string | null;
};

type SupabaseLikeClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: SupabaseLikeAuthUser | null };
      error: unknown;
    }>;
  };
};

export function buildGetSessionUser(createClient: () => Promise<SupabaseLikeClient>) {
  const getSessionUserCached = cache(async (): Promise<SessionUser | null> => {
    try {
      const client = await createClient();
      const {
        data: { user },
        error
      } = await client.auth.getUser();

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

  return async function getSessionUser(): Promise<SessionUser | null> {
    return getSessionUserCached();
  };
}
