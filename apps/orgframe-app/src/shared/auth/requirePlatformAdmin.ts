import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/src/features/core/auth/server/getSessionUser";

function getAllowlist(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAllowlist().includes(email.toLowerCase());
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/auth");
  }
  if (!isPlatformAdminEmail(user.email)) {
    redirect("/forbidden?reason=platform-admin");
  }
  return user;
}
