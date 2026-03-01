import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/auth/getSessionUser";
import { getSessionUser } from "@/lib/auth/getSessionUser";

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/auth/login");
  }

  return user;
}
