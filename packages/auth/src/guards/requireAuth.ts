import type { SessionUser } from "../types/session";

export function buildRequireAuth(getSessionUser: () => Promise<SessionUser | null>, onUnauthenticated: () => never) {
  return async function requireAuth(): Promise<SessionUser> {
    const user = await getSessionUser();

    if (!user) {
      return onUnauthenticated();
    }

    return user;
  };
}
